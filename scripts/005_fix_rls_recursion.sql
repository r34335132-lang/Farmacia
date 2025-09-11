-- Arreglar recursión infinita en políticas RLS de profiles
-- Eliminar todas las políticas existentes que causan recursión
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation during registration" ON profiles;

-- Crear políticas simples sin recursión
-- Política para SELECT - usar auth.uid() directamente sin subconsultas
CREATE POLICY "Enable read access for users based on user_id" ON profiles
    FOR SELECT USING (auth.uid() = user_id);

-- Política para INSERT - permitir inserción si el user_id coincide con el usuario autenticado
CREATE POLICY "Enable insert for authenticated users" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Política para UPDATE - permitir actualización del propio perfil
CREATE POLICY "Enable update for users based on user_id" ON profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Política especial para admins - usar una función simple
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean AS $$
BEGIN
    -- Verificar si el usuario actual tiene rol admin directamente
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
        AND is_active = true
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Política para que admins puedan ver todos los perfiles
CREATE POLICY "Enable admin access to all profiles" ON profiles
    FOR ALL USING (is_admin_user());

-- Asegurar que RLS esté habilitado
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Crear un usuario admin inicial si no existe
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
VALUES (
    gen_random_uuid(),
    'admin@farmaciasolidaria.com',
    crypt('admin123', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    false,
    'authenticated'
) ON CONFLICT (email) DO NOTHING;

-- Crear perfil admin inicial
INSERT INTO profiles (user_id, email, full_name, role, is_active)
SELECT 
    u.id,
    'admin@farmaciasolidaria.com',
    'Administrador',
    'admin',
    true
FROM auth.users u
WHERE u.email = 'admin@farmaciasolidaria.com'
ON CONFLICT (user_id) DO UPDATE SET
    role = 'admin',
    is_active = true;
