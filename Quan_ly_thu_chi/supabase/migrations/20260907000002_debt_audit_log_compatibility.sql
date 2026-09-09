-- The source database contains this audit table, while the historical m10
-- trigger referenced it without creating it in the migration chain.
CREATE TABLE IF NOT EXISTS public.debt_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  amount BIGINT,
  payment_type TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_audit_log ENABLE ROW LEVEL SECURITY;
