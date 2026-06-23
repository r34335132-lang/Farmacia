-- =============================================================================
-- Migrar productos de otra base (ej. El Salto) a la base nueva (multi-sucursal)
-- =============================================================================
--
-- PASO 1 — En la BD VIEJA (El Salto), SQL Editor → ejecuta la consulta EXPORT
-- PASO 2 — Copia el resultado (CSV o JSON) o usa Table Editor → Export
-- PASO 3 — En la BD NUEVA, crea la sucursal si no existe y anota su UUID
-- PASO 4 — En la BD NUEVA, ejecuta la sección IMPORT (ajusta el UUID)
--
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1: EXPORT — Ejecutar en la base de datos VIEJA (El Salto)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  name,
  description,
  barcode,
  price,
  stock_quantity,
  COALESCE(min_stock_level, 10)       AS min_stock_level,
  category,
  section,
  image_url,
  expiration_date,
  COALESCE(days_before_expiry_alert, 30) AS days_before_expiry_alert,
  promotion_price,
  COALESCE(is_visible, true)          AS is_visible,
  COALESCE(is_active, true)           AS is_active
FROM public.products
WHERE COALESCE(is_active, true) = true
ORDER BY name;


-- Alternativa: descargar como CSV desde Supabase
-- Table Editor → products → Export → CSV


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2: En la BD NUEVA — Crear sucursal El Salto (si aún no existe)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.branches (name, address, is_active)
SELECT 'Farmacia El Salto', 'El Salto, Jalisco', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches WHERE name ILIKE '%el salto%'
);

-- Obtén el UUID de la sucursal destino:
SELECT id, name FROM public.branches ORDER BY name;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3: IMPORT — Ejecutar en la BD NUEVA
-- Reemplaza '00000000-0000-0000-0000-000000000001' con el UUID real de tu sucursal
-- ─────────────────────────────────────────────────────────────────────────────

-- Opción A: Si pegaste los datos en una tabla temporal (recomendado para muchos productos)
--
-- 3a) Crea la tabla temporal en la BD NUEVA y pega/importa el CSV:
--
-- CREATE TEMP TABLE legacy_products (
--   name TEXT NOT NULL,
--   description TEXT,
--   barcode TEXT,
--   price NUMERIC(10,2) NOT NULL,
--   stock_quantity INTEGER NOT NULL DEFAULT 0,
--   min_stock_level INTEGER DEFAULT 10,
--   category TEXT,
--   section TEXT,
--   image_url TEXT,
--   expiration_date DATE,
--   days_before_expiry_alert INTEGER DEFAULT 30,
--   promotion_price NUMERIC(10,2),
--   is_visible BOOLEAN DEFAULT true,
--   is_active BOOLEAN DEFAULT true
-- );
--
-- Luego importa el CSV en Supabase Table Editor sobre legacy_products
-- o usa INSERT manual abajo.

-- 3b) Insertar desde tabla temporal a products con sucursal asignada:
/*
INSERT INTO public.products (
  name,
  description,
  barcode,
  price,
  stock_quantity,
  min_stock_level,
  category,
  section,
  image_url,
  expiration_date,
  days_before_expiry_alert,
  promotion_price,
  is_visible,
  is_active,
  branch_id,
  sku_group_id
)
SELECT
  lp.name,
  lp.description,
  NULLIF(TRIM(lp.barcode), ''),
  lp.price,
  lp.stock_quantity,
  lp.min_stock_level,
  lp.category,
  lp.section,
  lp.image_url,
  lp.expiration_date,
  lp.days_before_expiry_alert,
  lp.promotion_price,
  lp.is_visible,
  lp.is_active,
  '00000000-0000-0000-0000-000000000001'::uuid,  -- ← UUID de tu sucursal (Durango o El Salto)
  gen_random_uuid()
FROM legacy_products lp
ON CONFLICT (barcode, branch_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  stock_quantity = EXCLUDED.stock_quantity,
  min_stock_level = EXCLUDED.min_stock_level,
  category = EXCLUDED.category,
  section = EXCLUDED.section,
  image_url = EXCLUDED.image_url,
  expiration_date = EXCLUDED.expiration_date,
  days_before_expiry_alert = EXCLUDED.days_before_expiry_alert,
  promotion_price = EXCLUDED.promotion_price,
  is_visible = EXCLUDED.is_visible,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
*/


-- Opción B: INSERT directo de un producto de ejemplo (repite o genera desde Excel)
/*
INSERT INTO public.products (
  name, barcode, price, stock_quantity, min_stock_level,
  section, branch_id, sku_group_id, is_active, is_visible
) VALUES (
  'Ejemplo Producto',
  '7501234567890',
  25.00,
  10,
  5,
  'MEDICAMENTOS',
  '00000000-0000-0000-0000-000000000001'::uuid,  -- ← tu UUID de sucursal
  gen_random_uuid(),
  true,
  true
)
ON CONFLICT (barcode, branch_id) DO UPDATE SET
  price = EXCLUDED.price,
  stock_quantity = EXCLUDED.stock_quantity,
  updated_at = NOW();
*/


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 4 (opcional): Agrupar sku_group_id por mismo código de barras entre sucursales
-- Ejecutar en BD NUEVA después del import (también lo hace 020_product_branch_pricing.sql)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  new_group_id UUID;
BEGIN
  FOR rec IN
    SELECT barcode
    FROM public.products
    WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
    GROUP BY barcode
    HAVING COUNT(*) > 1
  LOOP
    new_group_id := gen_random_uuid();
    UPDATE public.products
    SET sku_group_id = new_group_id
    WHERE barcode = rec.barcode;
  END LOOP;

  UPDATE public.products
  SET sku_group_id = id
  WHERE sku_group_id IS NULL;
END $$;


-- Verificar importación:
SELECT b.name AS sucursal, COUNT(*) AS productos
FROM public.products p
JOIN public.branches b ON b.id = p.branch_id
GROUP BY b.name
ORDER BY b.name;
