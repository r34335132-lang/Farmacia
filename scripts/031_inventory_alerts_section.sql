-- Alertas de inventario con sección + sucursal (opcional).
-- La app ya consulta esto en servidor; este script alinea el RPC viejo si lo usas.

CREATE OR REPLACE FUNCTION public.get_inventory_alerts(p_branch_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/Mexico_City')::DATE;
  v_out JSONB;
  v_low JSONB;
  v_expiring JSONB;
  v_expired JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.branch_name, x.section NULLS LAST, x.name), '[]'::JSONB)
  INTO v_out
  FROM (
    SELECT p.id, p.name, p.barcode, p.section, p.stock_quantity, p.min_stock_level,
           p.expiration_date, p.branch_id, b.name AS branch_name
    FROM public.products p
    JOIN public.branches b ON b.id = p.branch_id
    WHERE p.is_active = true
      AND p.stock_quantity <= 0
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY b.name, p.section NULLS LAST, p.name
    LIMIT 150
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.stock_quantity, x.branch_name, x.section NULLS LAST), '[]'::JSONB)
  INTO v_low
  FROM (
    SELECT p.id, p.name, p.barcode, p.section, p.stock_quantity, p.min_stock_level,
           p.expiration_date, p.branch_id, b.name AS branch_name
    FROM public.products p
    JOIN public.branches b ON b.id = p.branch_id
    WHERE p.is_active = true
      AND p.stock_quantity > 0
      AND p.stock_quantity <= COALESCE(p.min_stock_level, 0)
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.stock_quantity ASC, b.name, p.section NULLS LAST
    LIMIT 150
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.expiration_date, x.branch_name), '[]'::JSONB)
  INTO v_expiring
  FROM (
    SELECT p.id, p.name, p.barcode, p.section, p.stock_quantity, p.min_stock_level,
           p.expiration_date, p.days_before_expiry_alert, p.branch_id, b.name AS branch_name,
           (p.expiration_date - v_today)::INT AS days_left
    FROM public.products p
    JOIN public.branches b ON b.id = p.branch_id
    WHERE p.is_active = true
      AND p.expiration_date IS NOT NULL
      AND p.expiration_date >= v_today
      AND p.expiration_date <= v_today + COALESCE(p.days_before_expiry_alert, 30)
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.expiration_date ASC
    LIMIT 150
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.expiration_date, x.branch_name), '[]'::JSONB)
  INTO v_expired
  FROM (
    SELECT p.id, p.name, p.barcode, p.section, p.stock_quantity, p.min_stock_level,
           p.expiration_date, p.branch_id, b.name AS branch_name,
           (p.expiration_date - v_today)::INT AS days_left
    FROM public.products p
    JOIN public.branches b ON b.id = p.branch_id
    WHERE p.is_active = true
      AND p.expiration_date IS NOT NULL
      AND p.expiration_date < v_today
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.expiration_date ASC
    LIMIT 150
  ) x;

  RETURN jsonb_build_object(
    'out_of_stock', COALESCE(v_out, '[]'::JSONB),
    'low_stock', COALESCE(v_low, '[]'::JSONB),
    'expiring', COALESCE(v_expiring, '[]'::JSONB),
    'expired', COALESCE(v_expired, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_alerts(UUID) TO authenticated;
