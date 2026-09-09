-- ============================================================
-- Migration: M14 - Baseline global_categories and missing RPCs
-- Ensures clean database creation has the complete schema for
-- global_categories, transactions.global_category_id, and mark_debt_paid
-- ============================================================

-- 1) Create global_categories table if not exists
CREATE TABLE IF NOT EXISTS public.global_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  icon TEXT,
  color TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  parent_id UUID REFERENCES public.global_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: global_categories can be read by any authenticated user
ALTER TABLE public.global_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'global_categories' AND policyname = 'Anyone can view active global categories'
  ) THEN
    CREATE POLICY "Anyone can view active global categories"
      ON public.global_categories
      FOR SELECT
      TO authenticated
      USING (is_active = true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_global_categories_kind ON public.global_categories(kind);
CREATE INDEX IF NOT EXISTS idx_global_categories_parent_id ON public.global_categories(parent_id);

-- 2) Ensure transactions table has global_category_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'global_category_id'
  ) THEN
    ALTER TABLE public.transactions
      ADD COLUMN global_category_id UUID REFERENCES public.global_categories(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_transactions_global_category_id ON public.transactions(global_category_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND conname = 'transactions_global_category_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_global_category_id_fkey
      FOREIGN KEY (global_category_id)
      REFERENCES public.global_categories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Missing RPC: mark_debt_paid
-- Marks debt as paid and creates a final debt_payment row for remaining balance
DROP FUNCTION IF EXISTS public.mark_debt_paid(UUID);
DROP FUNCTION IF EXISTS public.mark_debt_paid();

CREATE OR REPLACE FUNCTION public.mark_debt_paid(
  p_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_debt public.debts;
  v_remaining BIGINT;
BEGIN
  SELECT * INTO v_debt
  FROM public.debts
  WHERE id = p_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_debt IS NULL THEN
    RAISE EXCEPTION 'Debt not found or permission denied';
  END IF;

  IF v_debt.status = 'paid' OR v_debt.remaining_amount = 0 THEN
    RETURN;
  END IF;

  v_remaining := v_debt.remaining_amount;

  -- Ghi nhận payment để xóa sạch dư nợ
  INSERT INTO public.debt_payments (
    debt_id, user_id, amount, payment_date, payment_type, notes
  ) VALUES (
    p_id, auth.uid(), v_remaining, now(), 'full', 'Đánh dấu đã trả'
  );

  UPDATE public.debts
  SET
    remaining_amount = 0,
    status = 'paid',
    updated_at = now()
  WHERE id = p_id;
END;
$$;
