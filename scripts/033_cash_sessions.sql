-- Sesiones de caja (apertura / corte) para saber cuánto tiempo estuvo activa cada cajera.
-- Idempotente. Ejecutar en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  cashier_id uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  opening_float numeric(12, 2) NOT NULL DEFAULT 500,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_sessions_closed_check CHECK (
    (status = 'open' AND closed_at IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_cashier_branch
  ON public.cash_sessions (cashier_id, branch_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS cash_sessions_branch_opened_idx
  ON public.cash_sessions (branch_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS cash_sessions_cashier_opened_idx
  ON public.cash_sessions (cashier_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS cash_sessions_status_idx
  ON public.cash_sessions (status, opened_at DESC);

ALTER TABLE public.cash_sessions DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;

DROP POLICY IF EXISTS "staff_all_cash_sessions" ON public.cash_sessions;
CREATE POLICY "staff_all_cash_sessions"
  ON public.cash_sessions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
