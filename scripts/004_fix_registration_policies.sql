-- Fix RLS policies to allow user registration without email confirmation

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;

-- Create new policy that allows profile creation during registration
CREATE POLICY "Allow profile creation during registration" ON public.profiles
  FOR INSERT WITH CHECK (
    -- Allow if it's the user's own profile being created
    auth.uid() = id OR
    -- Allow if there are no admins yet (first user)
    NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') OR
    -- Allow if current user is admin
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create policy to allow users to read their own profile during registration
CREATE POLICY "Allow reading own profile during registration" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Update the handle_new_user function to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile with proper error handling
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'cajero'),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;
