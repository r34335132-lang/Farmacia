-- Add section field to products table for location tracking (A1, A2, B1, etc.)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS section TEXT;

-- Add index for faster section-based queries
CREATE INDEX IF NOT EXISTS idx_products_section ON public.products(section);
