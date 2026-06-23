-- Fix permissions for branches / user_branches tables
-- (Supabase enables RLS by default on new tables; this project uses RLS disabled on core tables)

ALTER TABLE IF EXISTS public.branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_branches DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_branches TO authenticated;

-- Public tienda needs to read active branches without login
GRANT SELECT ON public.branches TO anon;

-- Ensure authenticated users can use sequences if any
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
