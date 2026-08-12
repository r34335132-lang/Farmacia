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

-- =============================================================================
-- Comparar conteo físico vs stock del sistema (NO modifica stock)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compare_inventory_count(
  p_branch_id UUID,
  p_items JSONB
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
  v_diff INT;
  v_status TEXT;
  v_product_name TEXT;
  v_system_stock INT;
  v_product_id UUID;
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
    v_name := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'name', '')), '');
    v_qty := NULLIF(v_item->>'quantity', '')::INT;

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
      -- Producto inexistente o inactivo/eliminado en esta sucursal
      v_status := 'unregistered';
      v_product_id := NULL;
      v_product_name := COALESCE(v_name, 'Producto no registrado');
      v_system_stock := 0;
      v_diff := v_qty;
      v_unregistered := v_unregistered + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode,
        'product_id', v_product_id,
        'product_name', v_product_name,
        'file_name', v_name,
        'system_stock', v_system_stock,
        'counted', v_qty,
        'difference', v_diff,
        'status', v_status,
        'unit_cost', 0,
        'unit_price', 0
      ));
    ELSE
      v_product_id := v_product.id;
      v_product_name := v_product.name;
      v_system_stock := COALESCE(v_product.stock_quantity, 0);
      v_diff := v_qty - v_system_stock;

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

      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode,
        'product_id', v_product_id,
        'product_name', v_product_name,
        'file_name', v_name,
        'system_stock', v_system_stock,
        'counted', v_qty,
        'difference', v_diff,
        'status', v_status,
        'unit_cost', COALESCE(v_product.cost_price, 0),
        'unit_price', COALESCE(v_product.price, 0)
      ));
    END IF;

    v_reviewed := v_reviewed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
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

GRANT EXECUTE ON FUNCTION public.compare_inventory_count(UUID, JSONB) TO authenticated;

-- =============================================================================
-- Aplicar ajuste: actualiza stock de productos existentes de la sucursal
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_inventory_count(
  p_branch_id UUID,
  p_items JSONB
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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay productos para ajustar';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
    v_qty := NULLIF(v_item->>'quantity', '')::INT;

    IF v_barcode IS NULL OR v_qty IS NULL OR v_qty < 0 THEN
      RAISE EXCEPTION 'Fila inválida en el ajuste de inventario';
    END IF;

    SELECT p.id, p.stock_quantity, p.name, p.cost_price
    INTO v_product
    FROM public.products p
    WHERE p.barcode = v_barcode
      AND p.branch_id = p_branch_id
      AND COALESCE(p.is_active, true) = true
    FOR UPDATE;

    IF NOT FOUND THEN
      -- No registrados / eliminados: no insertar ni modificar
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

    v_movement_type := 'ajuste';

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
      'Conteo de inventario',
      auth.uid(),
      COALESCE(v_product.cost_price, 0),
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

  PERFORM public.log_audit(
    'inventory_count_applied',
    'inventory_count',
    NULL,
    p_branch_id,
    jsonb_build_object(
      'updated', v_updated,
      'skipped', v_skipped,
      'items', jsonb_array_length(p_items),
      'motivo', 'Conteo de inventario'
    )
  );

  RETURN jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'branch_id', p_branch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_inventory_count(UUID, JSONB) TO authenticated;
