-- Add branch support to online orders

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

UPDATE public.orders
SET branch_id = (
  SELECT id FROM public.branches
  WHERE is_active = true
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON public.orders(branch_id);
