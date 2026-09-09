-- ============================================================
-- Migration: m9_fix_add_debt_payment
-- Fix RPC add_debt_payment: column name note -> notes, add user_id & payment_type
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_debt_payment(
  p_debt_id UUID,
  p_amount BIGINT,
  p_payment_date TIMESTAMPTZ DEFAULT now(),
  p_note TEXT DEFAULT NULL
)
RETURNS public.debt_payments
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_payment public.debt_payments;
  v_debt public.debts;
BEGIN
  -- Get and verify debt
  SELECT * INTO v_debt FROM public.debts WHERE id = p_debt_id AND user_id = auth.uid();
  IF v_debt IS NULL THEN
    RAISE EXCEPTION 'Invalid debt_id';
  END IF;

  -- Verify amount doesn't exceed remaining
  IF p_amount > v_debt.remaining_amount THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining debt';
  END IF;

  -- Insert with correct column names: notes (not note), user_id, payment_type
  INSERT INTO public.debt_payments (debt_id, user_id, amount, payment_date, payment_type, notes)
  VALUES (p_debt_id, auth.uid(), p_amount, p_payment_date, 'payment', p_note)
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;
