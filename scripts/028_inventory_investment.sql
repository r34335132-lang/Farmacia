-- Valor de inventario / inversión por sucursal para el dueño.
-- Idempotente. Ejecutar en Supabase SQL Editor (opcional: la API también agrega en servidor).

CREATE OR REPLACE FUNCTION public.get_inventory_investment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;

  WITH rows AS (
    SELECT
      p.branch_id,
      b.name AS sucursal,
      COUNT(*)::integer AS productos,
      COALESCE(SUM(p.stock_quantity), 0)::bigint AS unidades,
      COALESCE(SUM(COALESCE(p.price, 0) * COALESCE(p.stock_quantity, 0)), 0)::numeric AS valor_inventario,
      COALESCE(SUM(COALESCE(p.cost_price, 0) * COALESCE(p.stock_quantity, 0)), 0)::numeric AS inversion,
      COALESCE(
        SUM((COALESCE(p.price, 0) - COALESCE(p.cost_price, 0)) * COALESCE(p.stock_quantity, 0)),
        0
      )::numeric AS utilidad_potencial
    FROM public.products p
    INNER JOIN public.branches b ON b.id = p.branch_id
    WHERE COALESCE(p.is_active, true) = true
      AND COALESCE((to_jsonb(p) ->> 'is_deleted')::boolean, false) = false
    GROUP BY p.branch_id, b.name
  )
  SELECT jsonb_build_object(
    'branches', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'branch_id', r.branch_id,
          'sucursal', r.sucursal,
          'productos', r.productos,
          'unidades', r.unidades,
          'valor_inventario', r.valor_inventario,
          'inversion', r.inversion,
          'utilidad_potencial', r.utilidad_potencial
        )
        ORDER BY r.valor_inventario DESC
      )
      FROM rows r
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'sucursales', (SELECT COUNT(*) FROM rows),
      'productos', (SELECT COALESCE(SUM(productos), 0) FROM rows),
      'unidades', (SELECT COALESCE(SUM(unidades), 0) FROM rows),
      'valor_inventario', (SELECT COALESCE(SUM(valor_inventario), 0) FROM rows),
      'inversion', (SELECT COALESCE(SUM(inversion), 0) FROM rows),
      'utilidad_potencial', (SELECT COALESCE(SUM(utilidad_potencial), 0) FROM rows)
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_investment() TO authenticated;
