-- Proveedores + stock mínimo 5 + proveedor en pedidos
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique_idx
  ON public.suppliers (lower(trim(name)));

ALTER TABLE public.supply_requests
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS supply_requests_supplier_idx
  ON public.supply_requests (supplier_id, created_at DESC);

ALTER TABLE public.suppliers DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;

DROP POLICY IF EXISTS "staff_all_suppliers" ON public.suppliers;
CREATE POLICY "staff_all_suppliers"
  ON public.suppliers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Stock mínimo de todos los productos activos a 5
UPDATE public.products
SET min_stock_level = 5,
    updated_at = NOW()
WHERE COALESCE(is_active, true) = true
  AND COALESCE(min_stock_level, 0) <> 5;
