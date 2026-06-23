-- Multi-branch / multi-sucursal support for Farmacia POS

-- 1. Branches table
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Seed initial branches
INSERT INTO public.branches (name, address)
SELECT v.name, v.address
FROM (VALUES
  ('Sucursal Matriz', 'Dirección principal'),
  ('Farmacia Centro', 'Centro de la ciudad'),
  ('Farmacia Norte', 'Zona norte')
) AS v(name, address)
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches b WHERE b.name = v.name
);

-- 3. Add branch_id to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- 4. Assign existing products to first available branch
UPDATE public.products
SET branch_id = (
  SELECT id FROM public.branches
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE branch_id IS NULL;

-- 5. Make branch_id required
ALTER TABLE public.products
  ALTER COLUMN branch_id SET NOT NULL;

-- 6. Replace global barcode unique constraint with per-branch uniqueness
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_barcode_branch_id_key'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_barcode_branch_id_key UNIQUE (barcode, branch_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_branch_id ON public.products(branch_id);

-- 7. User-branch assignments
CREATE TABLE IF NOT EXISTS public.user_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'cashier',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branches_user_id ON public.user_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branches_branch_id ON public.user_branches(branch_id);

-- 8. Assign existing cashiers to Sucursal Matriz
INSERT INTO public.user_branches (user_id, branch_id, role, is_active)
SELECT p.id, b.id, 'cashier', true
FROM public.profiles p
CROSS JOIN (
  SELECT id FROM public.branches
  WHERE name = 'Sucursal Matriz'
  LIMIT 1
) b
WHERE p.role = 'cajero'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_branches ub WHERE ub.user_id = p.id
  )
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- 9. Add branch_id to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

UPDATE public.sales
SET branch_id = (
  SELECT id FROM public.branches
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_branch_id ON public.sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);

-- 10. Disable legacy trigger to avoid double stock deduction (process_sale handles stock)
DROP TRIGGER IF EXISTS update_stock_on_sale ON public.sale_items;

-- 11. Secure sale processing function
CREATE OR REPLACE FUNCTION public.process_sale(
  p_items JSONB,
  p_payment_method TEXT,
  p_cash_received NUMERIC DEFAULT NULL,
  p_change_given NUMERIC DEFAULT NULL,
  p_subtotal_before_discount NUMERIC DEFAULT NULL,
  p_discount_type TEXT DEFAULT 'none',
  p_discount_value NUMERIC DEFAULT 0,
  p_discount_reason TEXT DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_requested_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_branch_id UUID;
  v_sale_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_unit_price NUMERIC;
  v_subtotal NUMERIC;
  v_current_stock INT;
  v_product_branch_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_user_id AND is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no activo o sin perfil';
  END IF;

  IF v_role = 'cajero' THEN
    SELECT ub.branch_id INTO v_branch_id
    FROM public.user_branches ub
    WHERE ub.user_id = v_user_id
      AND ub.is_active = true
    ORDER BY ub.created_at ASC
    LIMIT 1;

    IF v_branch_id IS NULL THEN
      RAISE EXCEPTION 'Cajero sin sucursal asignada';
    END IF;
  ELSIF v_role = 'admin' THEN
    IF p_requested_branch_id IS NULL THEN
      RAISE EXCEPTION 'Admin debe especificar sucursal para la venta';
    END IF;
    v_branch_id := p_requested_branch_id;
  ELSE
    RAISE EXCEPTION 'Rol no autorizado para ventas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = v_branch_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Sucursal no válida o inactiva';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe incluir al menos un producto';
  END IF;

  IF p_payment_method NOT IN ('efectivo', 'tarjeta') THEN
    RAISE EXCEPTION 'Método de pago no válido';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_subtotal := (v_item->>'subtotal')::NUMERIC;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para producto %', v_product_id;
    END IF;

    SELECT p.stock_quantity, p.branch_id
    INTO v_current_stock, v_product_branch_id
    FROM public.products p
    WHERE p.id = v_product_id
      AND p.is_active = true
    FOR UPDATE;

    IF v_product_branch_id IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_product_id;
    END IF;

    IF v_product_branch_id <> v_branch_id THEN
      RAISE EXCEPTION 'Producto no pertenece a la sucursal activa';
    END IF;

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto %', v_product_id;
    END IF;
  END LOOP;

  INSERT INTO public.sales (
    cashier_id,
    branch_id,
    subtotal_before_discount,
    discount_type,
    discount_value,
    discount_reason,
    total_amount,
    payment_method,
    cash_received,
    change_given,
    status
  ) VALUES (
    v_user_id,
    v_branch_id,
    COALESCE(p_subtotal_before_discount, p_total_amount, 0),
    COALESCE(p_discount_type, 'none'),
    COALESCE(p_discount_value, 0),
    p_discount_reason,
    COALESCE(p_total_amount, 0),
    p_payment_method,
    p_cash_received,
    p_change_given,
    'completed'
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INT;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_subtotal := (v_item->>'subtotal')::NUMERIC;

    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    ) VALUES (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_subtotal
    );

    UPDATE public.products
    SET stock_quantity = stock_quantity - v_quantity,
        updated_at = NOW()
    WHERE id = v_product_id
      AND branch_id = v_branch_id;

    INSERT INTO public.stock_movements (
      product_id,
      movement_type,
      quantity,
      reason,
      user_id
    ) VALUES (
      v_product_id,
      'salida',
      v_quantity,
      'Venta POS #' || RIGHT(v_sale_id::TEXT, 8),
      v_user_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'branch_id', v_branch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale(JSONB, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, UUID) TO authenticated;

-- 12. Branch-aware sales summary helper
CREATE OR REPLACE FUNCTION public.get_branch_sales_summary(
  p_branch_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  branch_id UUID,
  branch_name TEXT,
  total_sales BIGINT,
  total_amount NUMERIC,
  avg_ticket NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS branch_id,
    b.name AS branch_name,
    COUNT(s.id)::BIGINT AS total_sales,
    COALESCE(SUM(s.total_amount), 0)::NUMERIC AS total_amount,
    CASE
      WHEN COUNT(s.id) > 0 THEN (COALESCE(SUM(s.total_amount), 0) / COUNT(s.id))::NUMERIC
      ELSE 0::NUMERIC
    END AS avg_ticket
  FROM public.branches b
  LEFT JOIN public.sales s
    ON s.branch_id = b.id
    AND s.status = 'completed'
    AND DATE(s.created_at) BETWEEN p_start_date AND p_end_date
  WHERE b.is_active = true
    AND (p_branch_id IS NULL OR b.id = p_branch_id)
  GROUP BY b.id, b.name
  ORDER BY b.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_sales_summary(UUID, DATE, DATE) TO authenticated;
