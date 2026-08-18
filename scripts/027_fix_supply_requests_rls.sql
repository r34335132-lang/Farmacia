-- Arregla el error: new row violates row-level security policy for table "supply_requests"
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE IF EXISTS public.supply_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.supply_request_items DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supply_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supply_request_items TO authenticated;

DROP POLICY IF EXISTS "staff_all_supply_requests" ON public.supply_requests;
DROP POLICY IF EXISTS "staff_all_supply_request_items" ON public.supply_request_items;

CREATE POLICY "staff_all_supply_requests"
  ON public.supply_requests
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_all_supply_request_items"
  ON public.supply_request_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
