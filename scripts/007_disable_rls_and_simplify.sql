-- Deshabilitar RLS y simplificar el sistema para evitar recursión infinita
-- Eliminar todas las políticas problemáticas

-- Deshabilitar RLS en profiles temporalmente
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas existentes que causan recursión
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow profile creation during registration" ON profiles;
DROP POLICY IF EXISTS "Allow users to read own profile" ON profiles;
DROP POLICY IF EXISTS "Allow users to update own profile" ON profiles;
DROP POLICY IF EXISTS "Allow admin to read all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow admin to insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow admin to update profiles" ON profiles;

-- Crear un usuario admin por defecto si no existe
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
  'admin@farmacia.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated'
) ON CONFLICT (email) DO NOTHING;

-- Crear perfil admin
INSERT INTO profiles (
  id,
  email,
  full_name,
  role,
  is_active
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@farmacia.com'),
  'admin@farmacia.com',
  'Administrador',
  'admin',
  true
) ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  is_active = true;

-- Crear un usuario cajero por defecto
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
  'cajero@farmacia.com',
  crypt('cajero123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{}',
  false,
  'authenticated'
) ON CONFLICT (email) DO NOTHING;

-- Crear perfil cajero
INSERT INTO profiles (
  id,
  email,
  full_name,
  role,
  is_active
) VALUES (
  (SELECT id FROM auth.users WHERE email = 'cajero@farmacia.com'),
  'cajero@farmacia.com',
  'Cajero',
  'cajero',
  true
) ON CONFLICT (id) DO UPDATE SET
  role = 'cajero',
  is_active = true;
