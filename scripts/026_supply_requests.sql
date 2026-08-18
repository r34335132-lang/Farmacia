-- Pedidos de mercancía desde caja (cajeras y admin).
-- Idempotente. Ejecutar en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  created_by uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'purchased', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supply_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.supply_requests(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  barcode text,
  quantity integer NOT NULL CHECK (quantity > 0),
  photo_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supply_requests_branch_created_idx
  ON public.supply_requests (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS supply_requests_status_idx
  ON public.supply_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS supply_request_items_request_idx
  ON public.supply_request_items (request_id);

ALTER TABLE public.supply_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_request_items DISABLE ROW LEVEL SECURITY;

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
