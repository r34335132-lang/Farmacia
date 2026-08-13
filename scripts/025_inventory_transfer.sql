-- Traspaso de inventario entre sucursales (Excel)
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

-- =============================================================================
-- Preview: NO modifica stock
-- =============================================================================

DROP FUNCTION IF EXISTS public.preview_inventory_transfer(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.preview_inventory_transfer(
  p_from_branch_id UUID,
  p_to_branch_id UUID,
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
  v_from RECORD;
  v_to RECORD;
  v_status TEXT;
  v_reviewed INT := 0;
  v_ready INT := 0;
  v_insufficient INT := 0;
  v_missing_origin INT := 0;
  v_will_create INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden hacer traspasos';
  END IF;

  IF p_from_branch_id IS NULL OR p_to_branch_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal origen y destino son requeridas';
  END IF;

  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Origen y destino deben ser sucursales distintas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_from_branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'Sucursal origen no válida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_to_branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'Sucursal destino no válida';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El traspaso debe incluir al menos un producto';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
    v_name := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'name', '')), '');
    v_qty := NULLIF(v_item->>'quantity', '')::INT;

    IF v_barcode IS NULL THEN
      v_reviewed := v_reviewed + 1;
      v_missing_origin := v_missing_origin + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'barcode', '',
        'file_name', v_name,
        'quantity', COALESCE(v_qty, 0),
        'status', 'no_barcode',
        'origin_stock', 0,
        'dest_stock', 0,
        'origin_product_id', NULL,
        'dest_product_id', NULL,
        'product_name', COALESCE(v_name, 'Sin código'),
        'unit_cost', 0,
        'unit_price', 0,
        'message', 'Fila sin código de barras'
      ));
      CONTINUE;
    END IF;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para el código %', v_barcode;
    END IF;

    SELECT
      p.id,
      p.name,
      p.stock_quantity,
      COALESCE(p.cost_price, 0) AS cost_price,
      COALESCE(p.price, 0) AS price
    INTO v_from
    FROM public.products p
    WHERE p.barcode = v_barcode
      AND p.branch_id = p_from_branch_id
      AND COALESCE(p.is_active, true) = true
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
      v_status := 'missing_origin';
      v_missing_origin := v_missing_origin + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'barcode', v_barcode,
        'file_name', v_name,
        'quantity', v_qty,
        'status', v_status,
        'origin_stock', 0,
        'dest_stock', 0,
        'origin_product_id', NULL,
        'dest_product_id', NULL,
        'product_name', COALESCE(v_name, 'No está en origen'),
        'unit_cost', 0,
        'unit_price', 0,
        'message', 'No existe en la sucursal origen'
      ));
      v_reviewed := v_reviewed + 1;
      CONTINUE;
    END IF;

    SELECT p.id, p.name, p.stock_quantity
    INTO v_to
    FROM public.products p
    WHERE p.barcode = v_barcode
      AND p.branch_id = p_to_branch_id
      AND COALESCE(p.is_active, true) = true
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 1;

    IF COALESCE(v_from.stock_quantity, 0) < v_qty THEN
      v_status := 'insufficient';
      v_insufficient := v_insufficient + 1;
    ELSIF v_to.id IS NULL THEN
      v_status := 'will_create';
      v_will_create := v_will_create + 1;
      v_ready := v_ready + 1;
    ELSE
      v_status := 'ready';
      v_ready := v_ready + 1;
    END IF;

    v_reviewed := v_reviewed + 1;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'barcode', v_barcode,
      'file_name', v_name,
      'quantity', v_qty,
      'status', v_status,
      'origin_stock', COALESCE(v_from.stock_quantity, 0),
      'dest_stock', COALESCE(v_to.stock_quantity, 0),
      'origin_product_id', v_from.id,
      'dest_product_id', v_to.id,
      'product_name', v_from.name,
      'unit_cost', COALESCE(v_from.cost_price, 0),
      'unit_price', COALESCE(v_from.price, 0),
      'message', CASE v_status
        WHEN 'insufficient' THEN 'Stock insuficiente en origen'
        WHEN 'will_create' THEN 'Se creará en destino al aplicar'
        ELSE 'Listo para transferir'
      END
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'from_branch_id', p_from_branch_id,
    'to_branch_id', p_to_branch_id,
    'summary', jsonb_build_object(
      'reviewed', v_reviewed,
      'ready', v_ready,
      'insufficient', v_insufficient,
      'missing_origin', v_missing_origin,
      'will_create', v_will_create,
      'transferable', v_ready
    ),
    'rows', v_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_inventory_transfer(UUID, UUID, JSONB) TO authenticated;

-- =============================================================================
-- Apply: resta origen, suma destino (crea producto en destino si falta)
-- =============================================================================

DROP FUNCTION IF EXISTS public.apply_inventory_transfer(UUID, UUID, JSONB);

CREATE OR REPLACE FUNCTION public.apply_inventory_transfer(
  p_from_branch_id UUID,
  p_to_branch_id UUID,
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
  v_from RECORD;
  v_to RECORD;
  v_new_id UUID;
  v_transferred INT := 0;
  v_created INT := 0;
  v_skipped INT := 0;
  v_units INT := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden aplicar traspasos';
  END IF;

  IF p_from_branch_id IS NULL OR p_to_branch_id IS NULL THEN
    RAISE EXCEPTION 'Sucursal origen y destino son requeridas';
  END IF;

  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Origen y destino deben ser sucursales distintas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_from_branch_id AND is_active = true)
     OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_to_branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'Sucursal origen o destino no válida';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay productos para transferir';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_barcode := NULLIF(TRIM(BOTH FROM COALESCE(v_item->>'barcode', '')), '');
    v_qty := NULLIF(v_item->>'quantity', '')::INT;

    IF v_barcode IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT
      p.id,
      p.name,
      p.description,
      p.barcode,
      p.category,
      p.image_url,
      p.price,
      COALESCE(p.cost_price, 0) AS cost_price,
      p.stock_quantity,
      COALESCE(p.min_stock_level, 10) AS min_stock_level,
      p.sku_group_id,
      p.expiration_date,
      p.promotion_price,
      p.markup_percent
    INTO v_from
    FROM public.products p
    WHERE p.barcode = v_barcode
      AND p.branch_id = p_from_branch_id
      AND COALESCE(p.is_active, true) = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no existe en origen', v_barcode;
    END IF;

    IF COALESCE(v_from.stock_quantity, 0) < v_qty THEN
      RAISE EXCEPTION 'Stock insuficiente en origen para % (tiene %, pide %)',
        v_barcode, COALESCE(v_from.stock_quantity, 0), v_qty;
    END IF;

    UPDATE public.products
    SET
      stock_quantity = stock_quantity - v_qty,
      updated_at = NOW()
    WHERE id = v_from.id;

    INSERT INTO public.stock_movements (
      product_id, movement_type, quantity, reason, user_id, unit_cost, branch_id
    ) VALUES (
      v_from.id,
      'salida',
      v_qty,
      'Traspaso a otra sucursal',
      auth.uid(),
      COALESCE(v_from.cost_price, 0),
      p_from_branch_id
    );

    SELECT p.id, p.stock_quantity
    INTO v_to
    FROM public.products p
    WHERE p.barcode = v_barcode
      AND p.branch_id = p_to_branch_id
      AND COALESCE(p.is_active, true) = true
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.products (
        name,
        description,
        barcode,
        category,
        image_url,
        branch_id,
        sku_group_id,
        price,
        cost_price,
        markup_percent,
        stock_quantity,
        min_stock_level,
        promotion_price,
        expiration_date,
        is_active
      ) VALUES (
        v_from.name,
        v_from.description,
        v_from.barcode,
        v_from.category,
        v_from.image_url,
        p_to_branch_id,
        v_from.sku_group_id,
        COALESCE(v_from.price, 0),
        COALESCE(v_from.cost_price, 0),
        v_from.markup_percent,
        v_qty,
        COALESCE(v_from.min_stock_level, 10),
        v_from.promotion_price,
        v_from.expiration_date,
        true
      )
      RETURNING id INTO v_new_id;

      v_created := v_created + 1;

      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity, reason, user_id, unit_cost, branch_id
      ) VALUES (
        v_new_id,
        'entrada',
        v_qty,
        'Traspaso desde otra sucursal (alta)',
        auth.uid(),
        COALESCE(v_from.cost_price, 0),
        p_to_branch_id
      );

      PERFORM public.log_audit(
        'inventory_transfer_created',
        'product',
        v_new_id,
        p_to_branch_id,
        jsonb_build_object(
          'barcode', v_barcode,
          'from_branch_id', p_from_branch_id,
          'quantity', v_qty,
          'from_product_id', v_from.id
        )
      );
    ELSE
      UPDATE public.products
      SET
        stock_quantity = COALESCE(stock_quantity, 0) + v_qty,
        updated_at = NOW()
      WHERE id = v_to.id;

      INSERT INTO public.stock_movements (
        product_id, movement_type, quantity, reason, user_id, unit_cost, branch_id
      ) VALUES (
        v_to.id,
        'entrada',
        v_qty,
        'Traspaso desde otra sucursal',
        auth.uid(),
        COALESCE(v_from.cost_price, 0),
        p_to_branch_id
      );

      v_new_id := v_to.id;
    END IF;

    PERFORM public.log_audit(
      'inventory_transferred',
      'product',
      v_from.id,
      p_from_branch_id,
      jsonb_build_object(
        'barcode', v_barcode,
        'quantity', v_qty,
        'from_branch_id', p_from_branch_id,
        'to_branch_id', p_to_branch_id,
        'to_product_id', v_new_id,
        'motivo', 'Traspaso de inventario'
      )
    );

    v_transferred := v_transferred + 1;
    v_units := v_units + v_qty;
  END LOOP;

  PERFORM public.log_audit(
    'inventory_transfer_applied',
    'inventory_transfer',
    NULL,
    p_to_branch_id,
    jsonb_build_object(
      'from_branch_id', p_from_branch_id,
      'to_branch_id', p_to_branch_id,
      'transferred', v_transferred,
      'created', v_created,
      'skipped', v_skipped,
      'units', v_units,
      'motivo', 'Traspaso de inventario'
    )
  );

  RETURN jsonb_build_object(
    'transferred', v_transferred,
    'created', v_created,
    'skipped', v_skipped,
    'units', v_units,
    'from_branch_id', p_from_branch_id,
    'to_branch_id', p_to_branch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_inventory_transfer(UUID, UUID, JSONB) TO authenticated;
