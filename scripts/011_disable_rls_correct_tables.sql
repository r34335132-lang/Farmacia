-- Deshabilitar RLS y eliminar políticas de las tablas que realmente existen
-- Basado en el esquema real de la base de datos

-- Deshabilitar RLS en todas las tablas existentes
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements DISABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas existentes (si existen)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

DROP POLICY IF EXISTS "Everyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Cashiers can view products" ON public.products;

DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can view all sales" ON public.sales;
DROP POLICY IF EXISTS "Cashiers can create sales" ON public.sales;

DROP POLICY IF EXISTS "Users can view sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Cashiers can create sale items" ON public.sale_items;

DROP POLICY IF EXISTS "Admins can view stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "System can create stock movements" ON public.stock_movements;

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'RLS deshabilitado correctamente en todas las tablas existentes';
END $$;
