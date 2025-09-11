-- Script para eliminar completamente todas las políticas RLS problemáticas
-- y deshabilitar RLS para evitar recursión infinita

-- Deshabilitar RLS en todas las tablas primero
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas existentes de profiles (usar IF EXISTS para evitar errores)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation during registration" ON profiles;
DROP POLICY IF EXISTS "Allow users to read own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON profiles;

-- Eliminar todas las políticas de products
DROP POLICY IF EXISTS "Everyone can view products" ON products;
DROP POLICY IF EXISTS "Admins can manage products" ON products;
DROP POLICY IF EXISTS "Allow read access to products" ON products;
DROP POLICY IF EXISTS "Allow admin to manage products" ON products;

-- Eliminar todas las políticas de sales
DROP POLICY IF EXISTS "Users can view their own sales" ON sales;
DROP POLICY IF EXISTS "Admins can view all sales" ON sales;
DROP POLICY IF EXISTS "Cashiers can create sales" ON sales;
DROP POLICY IF EXISTS "Allow cashiers to create sales" ON sales;
DROP POLICY IF EXISTS "Allow users to view sales" ON sales;

-- Eliminar todas las políticas de sale_items
DROP POLICY IF EXISTS "Users can view sale items for their sales" ON sale_items;
DROP POLICY IF EXISTS "Admins can view all sale items" ON sale_items;
DROP POLICY IF EXISTS "Cashiers can create sale items" ON sale_items;
DROP POLICY IF EXISTS "Allow cashiers to create sale items" ON sale_items;
DROP POLICY IF EXISTS "Allow users to view sale items" ON sale_items;

-- Eliminar todas las políticas de inventory_movements
DROP POLICY IF EXISTS "Admins can view all inventory movements" ON inventory_movements;
DROP POLICY IF EXISTS "Cashiers can view inventory movements" ON inventory_movements;
DROP POLICY IF EXISTS "Allow users to view inventory movements" ON inventory_movements;

-- Verificar que RLS esté deshabilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'products', 'sales', 'sale_items', 'inventory_movements');

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'RLS deshabilitado y todas las políticas eliminadas exitosamente';
END $$;
