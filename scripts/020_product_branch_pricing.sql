-- Precio y stock independientes por sucursal (mismo código de barras, distintos registros)
-- Cada fila en products = inventario de UNA sucursal con su propio precio y stock.

-- Agrupa el mismo producto lógico entre sucursales (mismo barcode)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_group_id UUID;

-- Asegurar columnas de precio promocional por sucursal
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotion_price DECIMAL(10,2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;

-- Agrupar productos existentes por código de barras
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
  LOOP
    new_group_id := gen_random_uuid();
    UPDATE public.products
    SET sku_group_id = new_group_id
    WHERE barcode = rec.barcode
      AND (sku_group_id IS NULL OR sku_group_id <> new_group_id);
  END LOOP;

  -- Productos sin barcode: grupo propio
  UPDATE public.products
  SET sku_group_id = id
  WHERE sku_group_id IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_sku_group_id ON public.products(sku_group_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);

COMMENT ON COLUMN public.products.price IS 'Precio de venta en esta sucursal';
COMMENT ON COLUMN public.products.stock_quantity IS 'Stock disponible en esta sucursal';
COMMENT ON COLUMN public.products.promotion_price IS 'Precio promocional en esta sucursal (opcional)';
COMMENT ON COLUMN public.products.sku_group_id IS 'Agrupa el mismo producto entre varias sucursales';

-- Vista para consultar precios/stock por sucursal del mismo producto
CREATE OR REPLACE VIEW public.v_product_branch_pricing AS
SELECT
  p.sku_group_id,
  p.barcode,
  p.name,
  p.branch_id,
  b.name AS branch_name,
  p.id AS product_id,
  p.price,
  p.promotion_price,
  p.stock_quantity,
  p.min_stock_level,
  p.expiration_date,
  p.is_active
FROM public.products p
JOIN public.branches b ON b.id = p.branch_id
WHERE p.is_active = true;

GRANT SELECT ON public.v_product_branch_pricing TO authenticated;
