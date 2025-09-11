-- Eliminar TODAS las políticas RLS existentes para profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation during registration" ON profiles;
DROP POLICY IF EXISTS "Allow automatic profile creation" ON profiles;

-- Temporalmente deshabilitar RLS para testing
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Crear políticas ultra-simples sin recursión
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política simple para que usuarios vean su propio perfil
CREATE POLICY "simple_select_own_profile" ON profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Política simple para que usuarios actualicen su propio perfil  
CREATE POLICY "simple_update_own_profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- Política simple para insertar perfiles (solo durante registro)
CREATE POLICY "simple_insert_profile" ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Crear usuario admin inicial si no existe
DO $$
BEGIN
    -- Insertar admin directamente en auth.users si no existe
    INSERT INTO auth.users (
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        role
    ) VALUES (
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
    
    -- Insertar perfil admin
    INSERT INTO profiles (
        id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
    ) 
    SELECT 
        u.id,
        'admin@farmaciasolidaria.com',
        'Administrador',
        'admin',
        true,
        now(),
        now()
    FROM auth.users u 
    WHERE u.email = 'admin@farmaciasolidaria.com'
    ON CONFLICT (id) DO NOTHING;
    
EXCEPTION WHEN OTHERS THEN
    -- Si falla, crear perfil básico
    INSERT INTO profiles (
        id,
        email,
        full_name,
        role,
        is_active
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        'admin@farmaciasolidaria.com',
        'Administrador',
        'admin',
        true
    ) ON CONFLICT (id) DO NOTHING;
END $$;

-- Verificar que las políticas no tienen recursión
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';
