-- Dashboard rápido, finanzas, gastos y top productos por sucursal
-- Idempotente. Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_active, true) = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Costos históricos en venta (si aún no existen)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost_subtotal DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Gastos
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'renta', 'inventario', 'salarios', 'servicios', 'mantenimiento', 'transporte', 'otros'
  )),
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON public.expenses(branch_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);

ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;

-- Markup
CREATE TABLE IF NOT EXISTS public.markup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  percent DECIMAL(6,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 1000),
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.markup_settings (id, percent)
VALUES ('00000000-0000-0000-0000-000000000001', 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.markup_settings DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.markup_settings TO authenticated;

-- =============================================================================
-- Dashboard agregado (evita cargar todos los productos/ventas)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard(
  p_branch_id UUID DEFAULT NULL,
  p_top_limit INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/Mexico_City')::DATE;
  v_month_start DATE := date_trunc('month', NOW() AT TIME ZONE 'America/Mexico_City')::DATE;
  v_stats JSONB;
  v_branches JSONB;
  v_low_stock JSONB;
  v_expiring JSONB;
  v_recent_sales JSONB;
  v_top_products JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores';
  END IF;

  SELECT jsonb_build_object(
    'totalProducts', COALESCE((
      SELECT COUNT(*) FROM public.products p
      WHERE p.is_active = true
        AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ), 0),
    'lowStockProducts', COALESCE((
      SELECT COUNT(*) FROM public.products p
      WHERE p.is_active = true
        AND p.stock_quantity <= COALESCE(p.min_stock_level, 0)
        AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ), 0),
    'expiringProducts', COALESCE((
      SELECT COUNT(*) FROM public.products p
      WHERE p.is_active = true
        AND p.expiration_date IS NOT NULL
        AND p.expiration_date >= v_today
        AND p.expiration_date <= v_today + COALESCE(p.days_before_expiry_alert, 30)
        AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ), 0),
    'expiredProducts', COALESCE((
      SELECT COUNT(*) FROM public.products p
      WHERE p.is_active = true
        AND p.expiration_date IS NOT NULL
        AND p.expiration_date < v_today
        AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ), 0),
    'todaySales', COALESCE((
      SELECT COUNT(*) FROM public.sales s
      WHERE s.status = 'completed'
        AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = v_today
        AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    ), 0),
    'totalRevenue', COALESCE((
      SELECT SUM(s.total_amount) FROM public.sales s
      WHERE s.status = 'completed'
        AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = v_today
        AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    ), 0),
    'activeCashiers', COALESCE((
      SELECT COUNT(*) FROM public.profiles pr
      WHERE pr.role IN ('cajero', 'encargado') AND COALESCE(pr.is_active, true) = true
    ), 0)
  ) INTO v_stats;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.name), '[]'::JSONB)
  INTO v_branches
  FROM (
    SELECT
      b.id,
      b.name,
      COALESCE((
        SELECT COUNT(*) FROM public.sales s
        WHERE s.branch_id = b.id AND s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = v_today
      ), 0)::INT AS "todaySales",
      COALESCE((
        SELECT SUM(s.total_amount) FROM public.sales s
        WHERE s.branch_id = b.id AND s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = v_today
      ), 0) AS "todayRevenue",
      COALESCE((
        SELECT COUNT(*) FROM public.sales s
        WHERE s.branch_id = b.id AND s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN v_month_start AND v_today
      ), 0)::INT AS "monthSales",
      COALESCE((
        SELECT SUM(s.total_amount) FROM public.sales s
        WHERE s.branch_id = b.id AND s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN v_month_start AND v_today
      ), 0) AS "monthRevenue",
      COALESCE((
        SELECT COUNT(*) FROM public.products p
        WHERE p.branch_id = b.id AND p.is_active = true
          AND p.stock_quantity > 0
          AND p.stock_quantity <= COALESCE(p.min_stock_level, 0)
      ), 0)::INT AS "lowStock",
      COALESCE((
        SELECT COUNT(*) FROM public.products p
        WHERE p.branch_id = b.id AND p.is_active = true AND p.stock_quantity <= 0
      ), 0)::INT AS "outOfStock"
    FROM public.branches b
    WHERE b.is_active = true
      AND (p_branch_id IS NULL OR b.id = p_branch_id)
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::JSONB)
  INTO v_low_stock
  FROM (
    SELECT p.id, p.name, p.stock_quantity, p.min_stock_level, b.name AS branch_name
    FROM public.products p
    JOIN public.branches b ON b.id = p.branch_id
    WHERE p.is_active = true
      AND p.stock_quantity <= COALESCE(p.min_stock_level, 0)
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.stock_quantity ASC, p.name
    LIMIT 5
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::JSONB)
  INTO v_expiring
  FROM (
    SELECT p.id, p.name, p.expiration_date, p.days_before_expiry_alert, b.name AS branch_name
    FROM public.products p
    JOIN public.branches b ON b.id = p.branch_id
    WHERE p.is_active = true
      AND p.expiration_date IS NOT NULL
      AND p.expiration_date >= v_today
      AND p.expiration_date <= v_today + COALESCE(p.days_before_expiry_alert, 30)
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
    ORDER BY p.expiration_date ASC
    LIMIT 5
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::JSONB)
  INTO v_recent_sales
  FROM (
    SELECT
      s.id,
      s.total_amount,
      s.payment_method,
      s.created_at,
      s.branch_id,
      pr.full_name AS cashier_name,
      b.name AS branch_name
    FROM public.sales s
    LEFT JOIN public.profiles pr ON pr.id = s.cashier_id
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = v_today
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    ORDER BY s.created_at DESC
    LIMIT 5
  ) x;

  -- Top productos más vendidos por sucursal (mes actual)
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.branch_name, x.rank), '[]'::JSONB)
  INTO v_top_products
  FROM (
    SELECT *
    FROM (
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        p.id AS product_id,
        p.name AS product_name,
        p.barcode,
        SUM(si.quantity)::INT AS qty_sold,
        ROUND(SUM(si.subtotal)::NUMERIC, 2) AS revenue,
        ROW_NUMBER() OVER (PARTITION BY b.id ORDER BY SUM(si.quantity) DESC, SUM(si.subtotal) DESC) AS rank
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      JOIN public.products p ON p.id = si.product_id
      JOIN public.branches b ON b.id = s.branch_id
      WHERE s.status = 'completed'
        AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN v_month_start AND v_today
        AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      GROUP BY b.id, b.name, p.id, p.name, p.barcode
    ) ranked
    WHERE ranked.rank <= GREATEST(COALESCE(p_top_limit, 5), 1)
  ) x;

  RETURN jsonb_build_object(
    'stats', v_stats,
    'branchSummaries', COALESCE(v_branches, '[]'::JSONB),
    'lowStockItems', COALESCE(v_low_stock, '[]'::JSONB),
    'expiringItems', COALESCE(v_expiring, '[]'::JSONB),
    'recentSales', COALESCE(v_recent_sales, '[]'::JSONB),
    'topProductsByBranch', COALESCE(v_top_products, '[]'::JSONB),
    'today', v_today,
    'monthStart', v_month_start
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard(UUID, INTEGER) TO authenticated;

-- =============================================================================
-- Resumen financiero (gastos visibles + comparación)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_financial_summary(
  p_branch_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_days INT;
  v_prev_start DATE;
  v_prev_end DATE;
  v_current JSONB;
  v_previous JSONB;
  v_by_category JSONB;
  v_by_branch JSONB;
  v_daily JSONB;
  v_recent_expenses JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden consultar finanzas';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'El periodo final no puede ser anterior al inicial';
  END IF;

  v_period_days := (p_end_date - p_start_date) + 1;
  v_prev_end := p_start_date - 1;
  v_prev_start := v_prev_end - v_period_days + 1;

  WITH sales_agg AS (
    SELECT
      COALESCE(SUM(s.total_amount), 0) AS sales_total,
      COUNT(s.id)::BIGINT AS sales_count
    FROM public.sales s
    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN p_start_date AND p_end_date
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  cogs_agg AS (
    SELECT COALESCE(SUM(COALESCE(si.cost_subtotal, 0)), 0) AS cogs_total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN p_start_date AND p_end_date
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  exp_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS expenses_total,
           COUNT(*)::BIGINT AS expenses_count
    FROM public.expenses e
    WHERE e.expense_date BETWEEN p_start_date AND p_end_date
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
  )
  SELECT jsonb_build_object(
    'sales_total', sa.sales_total,
    'sales_count', sa.sales_count,
    'cogs_total', ca.cogs_total,
    'gross_profit', sa.sales_total - ca.cogs_total,
    'expenses_total', ea.expenses_total,
    'expenses_count', ea.expenses_count,
    'net_profit', (sa.sales_total - ca.cogs_total) - ea.expenses_total,
    'gross_margin_percent', CASE WHEN sa.sales_total > 0 THEN ROUND(((sa.sales_total - ca.cogs_total) / sa.sales_total) * 100, 2) ELSE 0 END,
    'net_margin_percent', CASE WHEN sa.sales_total > 0 THEN ROUND((((sa.sales_total - ca.cogs_total) - ea.expenses_total) / sa.sales_total) * 100, 2) ELSE 0 END,
    'avg_ticket', CASE WHEN sa.sales_count > 0 THEN ROUND(sa.sales_total / sa.sales_count, 2) ELSE 0 END
  )
  INTO v_current
  FROM sales_agg sa, cogs_agg ca, exp_agg ea;

  WITH sales_agg AS (
    SELECT
      COALESCE(SUM(s.total_amount), 0) AS sales_total,
      COUNT(s.id)::BIGINT AS sales_count
    FROM public.sales s
    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN v_prev_start AND v_prev_end
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  cogs_agg AS (
    SELECT COALESCE(SUM(COALESCE(si.cost_subtotal, 0)), 0) AS cogs_total
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.status = 'completed'
      AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN v_prev_start AND v_prev_end
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ),
  exp_agg AS (
    SELECT COALESCE(SUM(e.amount), 0) AS expenses_total,
           COUNT(*)::BIGINT AS expenses_count
    FROM public.expenses e
    WHERE e.expense_date BETWEEN v_prev_start AND v_prev_end
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
  )
  SELECT jsonb_build_object(
    'sales_total', sa.sales_total,
    'sales_count', sa.sales_count,
    'cogs_total', ca.cogs_total,
    'gross_profit', sa.sales_total - ca.cogs_total,
    'expenses_total', ea.expenses_total,
    'expenses_count', ea.expenses_count,
    'net_profit', (sa.sales_total - ca.cogs_total) - ea.expenses_total,
    'gross_margin_percent', CASE WHEN sa.sales_total > 0 THEN ROUND(((sa.sales_total - ca.cogs_total) / sa.sales_total) * 100, 2) ELSE 0 END,
    'net_margin_percent', CASE WHEN sa.sales_total > 0 THEN ROUND((((sa.sales_total - ca.cogs_total) - ea.expenses_total) / sa.sales_total) * 100, 2) ELSE 0 END,
    'avg_ticket', CASE WHEN sa.sales_count > 0 THEN ROUND(sa.sales_total / sa.sales_count, 2) ELSE 0 END
  )
  INTO v_previous
  FROM sales_agg sa, cogs_agg ca, exp_agg ea;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', x.category,
    'amount', x.amount
  ) ORDER BY x.amount DESC), '[]'::JSONB)
  INTO v_by_category
  FROM (
    SELECT e.category, COALESCE(SUM(e.amount), 0) AS amount
    FROM public.expenses e
    WHERE e.expense_date BETWEEN p_start_date AND p_end_date
      AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    GROUP BY e.category
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'concept', e.concept,
    'category', e.category,
    'amount', e.amount,
    'expense_date', e.expense_date,
    'branch_id', e.branch_id,
    'branch_name', b.name,
    'description', e.description
  ) ORDER BY e.expense_date DESC, e.created_at DESC), '[]'::JSONB)
  INTO v_recent_expenses
  FROM public.expenses e
  JOIN public.branches b ON b.id = e.branch_id
  WHERE e.expense_date BETWEEN p_start_date AND p_end_date
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch_id', x.branch_id,
    'branch_name', x.branch_name,
    'sales_total', x.sales_total,
    'cogs_total', x.cogs_total,
    'gross_profit', x.sales_total - x.cogs_total,
    'expenses_total', x.expenses_total,
    'net_profit', (x.sales_total - x.cogs_total) - x.expenses_total
  ) ORDER BY x.branch_name), '[]'::JSONB)
  INTO v_by_branch
  FROM (
    SELECT
      b.id AS branch_id,
      b.name AS branch_name,
      COALESCE((
        SELECT SUM(s.total_amount) FROM public.sales s
        WHERE s.branch_id = b.id AND s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN p_start_date AND p_end_date
      ), 0) AS sales_total,
      COALESCE((
        SELECT SUM(COALESCE(si.cost_subtotal, 0))
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        WHERE s.branch_id = b.id AND s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE BETWEEN p_start_date AND p_end_date
      ), 0) AS cogs_total,
      COALESCE((
        SELECT SUM(e.amount) FROM public.expenses e
        WHERE e.branch_id = b.id
          AND e.expense_date BETWEEN p_start_date AND p_end_date
      ), 0) AS expenses_total
    FROM public.branches b
    WHERE b.is_active = true
      AND (p_branch_id IS NULL OR b.id = p_branch_id)
  ) x;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', d.day,
    'sales_total', d.sales_total,
    'cogs_total', d.cogs_total,
    'expenses_total', d.expenses_total,
    'gross_profit', d.sales_total - d.cogs_total,
    'net_profit', (d.sales_total - d.cogs_total) - d.expenses_total
  ) ORDER BY d.day), '[]'::JSONB)
  INTO v_daily
  FROM (
    SELECT
      gs.day::DATE AS day,
      COALESCE((
        SELECT SUM(s.total_amount) FROM public.sales s
        WHERE s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = gs.day
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      ), 0) AS sales_total,
      COALESCE((
        SELECT SUM(COALESCE(si.cost_subtotal, 0))
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        WHERE s.status = 'completed'
          AND (s.created_at AT TIME ZONE 'America/Mexico_City')::DATE = gs.day
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      ), 0) AS cogs_total,
      COALESCE((
        SELECT SUM(e.amount) FROM public.expenses e
        WHERE e.expense_date = gs.day
          AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
      ), 0) AS expenses_total
    FROM generate_series(p_start_date, p_end_date, INTERVAL '1 day') AS gs(day)
  ) d;

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'previous_start_date', v_prev_start,
      'previous_end_date', v_prev_end
    ),
    'current', v_current,
    'previous', v_previous,
    'expenses_by_category', COALESCE(v_by_category, '[]'::JSONB),
    'recent_expenses', COALESCE(v_recent_expenses, '[]'::JSONB),
    'by_branch', COALESCE(v_by_branch, '[]'::JSONB),
    'daily', COALESCE(v_daily, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_summary(UUID, DATE, DATE) TO authenticated;
