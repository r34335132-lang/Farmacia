-- Functions and triggers for Farmacia Solidaria

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'cajero')
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update stock after sale
CREATE OR REPLACE FUNCTION public.update_stock_after_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update product stock
  UPDATE public.products 
  SET stock_quantity = stock_quantity - NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.product_id;
  
  -- Create stock movement record
  INSERT INTO public.stock_movements (
    product_id, 
    movement_type, 
    quantity, 
    reason,
    user_id
  ) VALUES (
    NEW.product_id,
    'salida',
    NEW.quantity,
    'Venta ID: ' || NEW.sale_id,
    (SELECT cashier_id FROM public.sales WHERE id = NEW.sale_id)
  );
  
  RETURN NEW;
END;
$$;

-- Trigger for stock update after sale
DROP TRIGGER IF EXISTS update_stock_on_sale ON public.sale_items;
CREATE TRIGGER update_stock_on_sale
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stock_after_sale();

-- Function to check low stock
CREATE OR REPLACE FUNCTION public.get_low_stock_products()
RETURNS TABLE (
  id UUID,
  name TEXT,
  stock_quantity INTEGER,
  min_stock_level INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.stock_quantity, p.min_stock_level
  FROM public.products p
  WHERE p.stock_quantity <= p.min_stock_level
    AND p.is_active = true;
END;
$$;

-- Function to get sales summary
CREATE OR REPLACE FUNCTION public.get_sales_summary(
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_sales BIGINT,
  total_amount DECIMAL(10,2),
  cash_sales BIGINT,
  card_sales BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_sales,
    COALESCE(SUM(s.total_amount), 0)::DECIMAL(10,2) as total_amount,
    COUNT(CASE WHEN s.payment_method = 'efectivo' THEN 1 END)::BIGINT as cash_sales,
    COUNT(CASE WHEN s.payment_method = 'tarjeta' THEN 1 END)::BIGINT as card_sales
  FROM public.sales s
  WHERE DATE(s.created_at) BETWEEN start_date AND end_date
    AND s.status = 'completed';
END;
$$;
