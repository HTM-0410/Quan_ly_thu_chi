-- ============================================================
-- Migration: m8_fix_debts_rls_and_api
-- Root causes fixed:
--  1. debt_payments RLS policy references non-existent column user_id
--     → replace with EXISTS subquery through debts table
--  2. api.ts createDebt does direct INSERT, bypassing RPC that sets
--     user_id and counterparty_name → switch to RPC call
--  3. debt_payments has no user_id column; enforce access via debts.owner
-- ============================================================

-- 1. Fix RLS policy for debt_payments (no user_id column exists)
DROP POLICY IF EXISTS "Users can CRUD own debt payments" ON public.debt_payments;

CREATE POLICY "Users can manage own debt payments"
  ON public.debt_payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.debts d
      WHERE d.id = debt_payments.debt_id AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.debts d
      WHERE d.id = debt_payments.debt_id AND d.user_id = auth.uid()
    )
  );

-- 2. Fix RLS policy for debts (add WITH CHECK to ensure user_id is set)
DROP POLICY IF EXISTS "Users can CRUD own debts" ON public.debts;

CREATE POLICY "Users can manage own debts"
  ON public.debts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Fix RLS policy for people (add WITH CHECK)
DROP POLICY IF EXISTS "Users can manage own people" ON public.people;

CREATE POLICY "Users can manage own people"
  ON public.people
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
