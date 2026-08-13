-- Conteo de inventario: comparación y ajuste transaccional por sucursal
-- Idempotente. Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Auditoría (si aún no existe)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  branch_id UUID REFERENCES public.branches(id),
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON public.audit_logs(branch_id);

ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, branch_id, details)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_branch_id, COALESCE(p_details, '{}'::JSONB))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;

-- Columnas opcionales usadas por movimientos de inventario
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2) DEFAULT 0;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0;

-- =============================================================================
-- Comparar conteo físico vs stock del sistema (NO modifica stock)
-- Incluye altas (entradas) del periodo para estimar ventas en productos correctos
-- =============================================================================

DROP FUNCTION IF EXISTS public.compare_inventory_count(UUID, JSONB);
DROP FUNCTION IF EXISTS public.compare_inventory_count(UUID, JSONB, DATE, DATE);

CREATE OR REPLACE FUNCTION public.compare_inventory_count(
  p_branch_id UUID,
  p_items JSONB,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB := '[]'::JSONB;
  v_item JSONB;
  v_barcode TEXT;
  v_name TEXT;
  v_qty INT;
  v_product RECORD;
  v_ref RECORD;
  v_diff INT;
  v_status TEXT;
  v_product_name TEXT;
  v_system_stock INT;
  v_product_id UUID;
  v_unit_cost NUMERIC := 0;
  v_unit_price NUMERIC := 0;
  v_price_from_branch TEXT := NULL;
  v_entries_qty INT := 0;
  v_start DATE;
  v_end DATE;
  v_correct INT := 0;
  v_missing INT := 0;
  v_surplus INT := 0;
  v_unregistered INT := 0;
  v_reviewed INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden realizar conteos de inventario';
  END IF;

  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal requerida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'Sucursal no válida o inactiva';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El conteo debe incluir al menos un producto';
  END IF;

  -- Periodo de altas (por defecto últimos 7 días, zona CDMX)
  v_end := COALESCE(p_end_date, (NOW() AT TIME ZONE 'America/Mexico_City')::DATE);
  v_start := COALESCE(p_start_date, v_end - 6);

  IF v_end < v_start THEN
    RAISE EXCEPTION 'El periodo final no puede ser anterior al inicial';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
    v_name := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'name', '')), '');
    v_qty := NULLIF(v_item->>'quantity', '')::INT;
    v_entries_qty := 0;

    IF v_barcode IS NULL THEN
      RAISE EXCEPTION 'Hay filas sin código de barras';
    END IF;

    IF v_qty IS NULL OR v_qty < 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para el código %', v_barcode;
    END IF;

    SELECT
      p.id,
      p.name,
      p.stock_quantity,
      p.is_active,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.price, 0) AS price
    INTO v_product
    FROM public.products p
    WHERE p.barcode = v_barcode
      AND p.branch_id = p_branch_id
      AND COALESCE(p.is_active, true) = true
    ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
      -- No existe en esta sucursal: no registrado + precio de otra sucursal si existe
      v_unit_cost := 0;
      v_unit_price := 0;
      v_price_from_branch := NULL;
      v_product_name := COALESCE(v_name, 'Producto no registrado');

      SELECT
        p.name,
        COALESCE(p.cost_price, 0) AS cost_price,
        COALESCE(p.price, 0) AS price,
        b.name AS branch_name
      INTO v_ref
      FROM public.products p
      LEFT JOIN public.branches b ON b.id = p.branch_id
      WHERE p.barcode = v_barcode
        AND p.branch_id IS DISTINCT FROM p_branch_id
        AND COALESCE(p.is_active, true) = true
      ORDER BY
        CASE WHEN COALESCE(p.price, 0) > 0 THEN 0 ELSE 1 END,
        p.updated_at DESC NULLS LAST,
        p.created_at DESC NULLS LAST
      LIMIT 1;

      IF FOUND THEN
        v_product_name := COALESCE(v_ref.name, v_name, 'Producto no registrado');
        v_unit_cost := COALESCE(v_ref.cost_price, 0);
        v_unit_price := COALESCE(v_ref.price, 0);
        v_price_from_branch := v_ref.branch_name;
      END IF;

      v_status := 'unregistered';
      v_product_id := NULL;
      v_system_stock := 0;
      v_diff := v_qty;
      v_unregistered := v_unregistered + 1;
    ELSE
      v_product_id := v_product.id;
      v_product_name := v_product.name;
      v_system_stock := COALESCE(v_product.stock_quantity, 0);
      v_diff := v_qty - v_system_stock;
      v_unit_cost := COALESCE(v_product.cost_price, 0);
      v_unit_price := COALESCE(v_product.price, 0);
      v_price_from_branch := NULL;

      -- Altas (entradas) del periodo: sirven para estimar ventas cuando el stock cuadra
      SELECT COALESCE(SUM(sm.quantity), 0)::INT
      INTO v_entries_qty
      FROM public.stock_movements sm
      WHERE sm.product_id = v_product.id
        AND sm.movement_type = 'entrada'
        AND COALESCE(sm.quantity, 0) > 0
        AND (sm.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN v_start AND v_end
        AND (sm.branch_id IS NULL OR sm.branch_id = p_branch_id);

      IF v_diff = 0 THEN
        v_status := 'correct';
        v_correct := v_correct + 1;
      ELSIF v_diff < 0 THEN
        v_status := 'missing';
        v_missing := v_missing + 1;
      ELSE
        v_status := 'surplus';
        v_surplus := v_surplus + 1;
      END IF;
    END IF;

    v_reviewed := v_reviewed + 1;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'barcode', v_barcode,
      'product_id', v_product_id,
      'product_name', v_product_name,
      'file_name', v_name,
      'system_stock', v_system_stock,
      'counted', v_qty,
      'difference', v_diff,
      'status', v_status,
      'unit_cost', v_unit_cost,
      'unit_price', v_unit_price,
      'price_from_branch', v_price_from_branch,
      'entries_qty', COALESCE(v_entries_qty, 0)
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'period', jsonb_build_object(
      'start', v_start,
      'end', v_end
    ),
    'summary', jsonb_build_object(
      'reviewed', v_reviewed,
      'correct', v_correct,
      'missing', v_missing,
      'surplus', v_surplus,
      'unregistered', v_unregistered,
      'to_update', v_missing + v_surplus
    ),
    'rows', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compare_inventory_count(UUID, JSONB, DATE, DATE) TO authenticated;

-- =============================================================================
-- Aplicar ajuste de stock + venta = estimado de ganancias completo
-- p_items: faltantes/sobrantes (ajuste de stock)
-- p_sale_items: líneas de venta del estimado (faltantes + correctos/altas + no reg.)
-- =============================================================================

DROP FUNCTION IF EXISTS public.apply_inventory_count(UUID, JSONB);
DROP FUNCTION IF EXISTS public.apply_inventory_count(UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.apply_inventory_count(
  p_branch_id UUID,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_sale_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_barcode TEXT;
  v_qty INT;
  v_product RECORD;
  v_old INT;
  v_diff INT;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_movement_type TEXT;
  v_reason TEXT;
  v_sale_line JSONB;
  v_sale_items JSONB := '[]'::JSONB;
  v_sale_total NUMERIC(12,2) := 0;
  v_sale_id UUID := NULL;
  v_unit_price NUMERIC(12,2);
  v_unit_cost NUMERIC(12,2);
  v_line_subtotal NUMERIC(12,2);
  v_line_cost NUMERIC(12,2);
  v_sale_qty INT := 0;
  v_product_id UUID;
  v_sale_product_id UUID;
  v_sale_product_name TEXT;
  v_sale_product_price NUMERIC(12,2);
  v_sale_product_cost NUMERIC(12,2);
  v_source TEXT;
  v_items_count INT := 0;
  v_sale_count INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden aplicar ajustes de inventario';
  END IF;

  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal requerida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'Sucursal no válida o inactiva';
  END IF;

  v_items_count := CASE
    WHEN p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN 0
    ELSE jsonb_array_length(p_items)
  END;
  v_sale_count := CASE
    WHEN p_sale_items IS NULL OR jsonb_typeof(p_sale_items) <> 'array' THEN 0
    ELSE jsonb_array_length(p_sale_items)
  END;

  IF v_items_count = 0 AND v_sale_count = 0 THEN
    RAISE EXCEPTION 'No hay productos para ajustar ni líneas de venta';
  END IF;

  -- 1) Ajuste de stock (faltantes / sobrantes)
  IF v_items_count > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
      v_qty := NULLIF(v_item->>'quantity', '')::INT;

      IF v_barcode IS NULL OR v_qty IS NULL OR v_qty < 0 THEN
        RAISE EXCEPTION 'Fila inválida en el ajuste de inventario';
      END IF;

      SELECT
        p.id,
        p.stock_quantity,
        p.name,
        COALESCE(p.cost_price, 0) AS cost_price,
        COALESCE(p.price, 0) AS price
      INTO v_product
      FROM public.products p
      WHERE p.barcode = v_barcode
        AND p.branch_id = p_branch_id
        AND COALESCE(p.is_active, true) = true
      FOR UPDATE;

      IF NOT FOUND THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_old := COALESCE(v_product.stock_quantity, 0);
      v_diff := v_qty - v_old;

      IF v_diff = 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      UPDATE public.products
      SET
        stock_quantity = v_qty,
        updated_at = NOW()
      WHERE id = v_product.id
        AND branch_id = p_branch_id
        AND COALESCE(is_active, true) = true;

      v_unit_cost := COALESCE(v_product.cost_price, 0);

      IF v_diff < 0 THEN
        v_movement_type := 'salida';
        v_reason := 'Venta por conteo de inventario';
      ELSE
        v_movement_type := 'entrada';
        v_reason := 'Conteo de inventario (sobrante)';
      END IF;

      INSERT INTO public.stock_movements (
        product_id,
        movement_type,
        quantity,
        reason,
        user_id,
        unit_cost,
        branch_id
      ) VALUES (
        v_product.id,
        v_movement_type,
        ABS(v_diff),
        v_reason,
        auth.uid(),
        v_unit_cost,
        p_branch_id
      );

      PERFORM public.log_audit(
        'inventory_count_adjusted',
        'product',
        v_product.id,
        p_branch_id,
        jsonb_build_object(
          'barcode', v_barcode,
          'product_name', v_product.name,
          'old_stock', v_old,
          'new_stock', v_qty,
          'difference', v_diff,
          'motivo', 'Conteo de inventario'
        )
      );

      v_updated := v_updated + 1;
    END LOOP;
  END IF;

  -- 2) Venta = estimado de ganancias completo (faltantes + correctos/altas + no registrados)
  IF v_sale_count > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_items)
    LOOP
      v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
      v_qty := NULLIF(v_item->>'quantity', '')::INT;
      v_source := COALESCE(NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'source', '')), ''), 'estimado');
      v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
      v_unit_price := COALESCE(NULLIF(v_item->>'unit_price', '')::NUMERIC, 0);
      v_unit_cost := COALESCE(NULLIF(v_item->>'unit_cost', '')::NUMERIC, 0);

      IF v_qty IS NULL OR v_qty <= 0 THEN
        CONTINUE;
      END IF;

      -- Resolver producto con variables escalares (evita "record is not assigned yet")
      v_sale_product_id := NULL;
      v_sale_product_name := NULL;
      v_sale_product_price := 0;
      v_sale_product_cost := 0;

      IF v_product_id IS NOT NULL THEN
        SELECT p.id, p.name, COALESCE(p.price, 0), COALESCE(p.cost_price, 0)
        INTO v_sale_product_id, v_sale_product_name, v_sale_product_price, v_sale_product_cost
        FROM public.products p
        WHERE p.id = v_product_id
          AND COALESCE(p.is_active, true) = true
        LIMIT 1;
      END IF;

      IF v_sale_product_id IS NULL AND v_barcode IS NOT NULL THEN
        SELECT p.id, p.name, COALESCE(p.price, 0), COALESCE(p.cost_price, 0)
        INTO v_sale_product_id, v_sale_product_name, v_sale_product_price, v_sale_product_cost
        FROM public.products p
        WHERE p.barcode = v_barcode
          AND p.branch_id = p_branch_id
          AND COALESCE(p.is_active, true) = true
        LIMIT 1;
      END IF;

      IF v_sale_product_id IS NULL AND v_barcode IS NOT NULL THEN
        SELECT p.id, p.name, COALESCE(p.price, 0), COALESCE(p.cost_price, 0)
        INTO v_sale_product_id, v_sale_product_name, v_sale_product_price, v_sale_product_cost
        FROM public.products p
        WHERE p.barcode = v_barcode
          AND p.branch_id IS DISTINCT FROM p_branch_id
          AND COALESCE(p.is_active, true) = true
        ORDER BY CASE WHEN COALESCE(p.price, 0) > 0 THEN 0 ELSE 1 END, p.updated_at DESC NULLS LAST
        LIMIT 1;
      END IF;

      IF v_sale_product_id IS NULL THEN
        CONTINUE;
      END IF;

      IF v_unit_price <= 0 THEN
        v_unit_price := COALESCE(v_sale_product_price, 0);
      END IF;
      IF v_unit_cost < 0 THEN
        v_unit_cost := 0;
      END IF;
      IF v_unit_cost = 0 THEN
        v_unit_cost := COALESCE(v_sale_product_cost, 0);
      END IF;

      v_line_subtotal := ROUND((v_qty * v_unit_price)::NUMERIC, 2);
      v_line_cost := ROUND((v_qty * v_unit_cost)::NUMERIC, 2);
      v_sale_total := v_sale_total + v_line_subtotal;
      v_sale_qty := v_sale_qty + v_qty;

      v_sale_items := v_sale_items || jsonb_build_array(jsonb_build_object(
        'product_id', v_sale_product_id,
        'barcode', v_barcode,
        'product_name', v_sale_product_name,
        'quantity', v_qty,
        'unit_price', v_unit_price,
        'subtotal', v_line_subtotal,
        'unit_cost', v_unit_cost,
        'cost_subtotal', v_line_cost,
        'source', v_source
      ));
    END LOOP;
  END IF;

  IF jsonb_array_length(v_sale_items) > 0 THEN
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
      auth.uid(),
      p_branch_id,
      v_sale_total,
      'none',
      0,
      'Venta por estimado de ganancias (conteo de inventario)',
      v_sale_total,
      'efectivo',
      v_sale_total,
      0,
      'completed'
    )
    RETURNING id INTO v_sale_id;

    FOR v_sale_line IN SELECT * FROM jsonb_array_elements(v_sale_items)
    LOOP
      INSERT INTO public.sale_items (
        sale_id,
        product_id,
        quantity,
        unit_price,
        subtotal,
        unit_cost,
        cost_subtotal
      ) VALUES (
        v_sale_id,
        (v_sale_line->>'product_id')::UUID,
        (v_sale_line->>'quantity')::INT,
        (v_sale_line->>'unit_price')::NUMERIC,
        (v_sale_line->>'subtotal')::NUMERIC,
        COALESCE((v_sale_line->>'unit_cost')::NUMERIC, 0),
        COALESCE((v_sale_line->>'cost_subtotal')::NUMERIC, 0)
      );
    END LOOP;

    PERFORM public.log_audit(
      'inventory_count_sale_created',
      'sale',
      v_sale_id,
      p_branch_id,
      jsonb_build_object(
        'sale_total', v_sale_total,
        'sale_items', jsonb_array_length(v_sale_items),
        'sale_qty', v_sale_qty,
        'motivo', 'Estimado de ganancias por conteo'
      )
    );
  END IF;

  PERFORM public.log_audit(
    'inventory_count_applied',
    'inventory_count',
    v_sale_id,
    p_branch_id,
    jsonb_build_object(
      'updated', v_updated,
      'skipped', v_skipped,
      'stock_items', v_items_count,
      'sale_lines_sent', v_sale_count,
      'sale_id', v_sale_id,
      'sale_total', v_sale_total,
      'sale_qty', v_sale_qty,
      'motivo', 'Conteo de inventario'
    )
  );

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'branch_id', p_branch_id,
    'sale_id', v_sale_id,
    'sale_total', v_sale_total,
    'sale_qty', v_sale_qty,
    'sale_items', jsonb_array_length(v_sale_items)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_inventory_count(UUID, JSONB, JSONB) TO authenticated;
