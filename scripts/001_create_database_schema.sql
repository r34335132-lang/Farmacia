-- Farmacia Solidaria Database Schema
-- Create tables for pharmacy management system

-- Users profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cajero')) DEFAULT 'cajero',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  barcode TEXT UNIQUE,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 10,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales table
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID NOT NULL REFERENCES public.profiles(id),
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('efectivo', 'tarjeta')),
  cash_received DECIMAL(10,2),
  change_given DECIMAL(10,2),
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sale items table
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stock movements table for inventory tracking
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'salida', 'ajuste')),
  quantity INTEGER NOT NULL,
  reason TEXT,
  user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert profiles" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for products
CREATE POLICY "All authenticated users can view products" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for sales
CREATE POLICY "Users can view their own sales" ON public.sales
  FOR SELECT USING (
    cashier_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Cashiers can create sales" ON public.sales
  FOR INSERT WITH CHECK (
    cashier_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_active = true
    )
  );

-- RLS Policies for sale_items
CREATE POLICY "Users can view sale items for their sales" ON public.sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_id AND (
        s.cashier_id = auth.uid() OR 
        EXISTS (
          SELECT 1 FROM public.profiles 
          WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Cashiers can create sale items" ON public.sale_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_id AND s.cashier_id = auth.uid()
    )
  );

-- RLS Policies for stock_movements
CREATE POLICY "All authenticated users can view stock movements" ON public.stock_movements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create stock movements" ON public.stock_movements
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND is_active = true
    )
  );
