-- ============================================================
-- Migration: m7_fix_create_debt_counterparty
-- Fix create_debt RPC to set counterparty_name from people table
-- Root cause: debts.counterparty_name is NOT NULL but the RPC did
-- not set it, causing 400 Bad Request on every insert.
-- ============================================================

-- Drop and recreate create_debt with proper counterparty_name handling
CREATE OR REPLACE FUNCTION public.create_debt(
  p_person_id UUID,
  p_type TEXT,
  p_original_amount BIGINT,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.debts
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_debt public.debts;
  v_person public.people;
BEGIN
  -- Fetch person for counterparty_name (must not be null in debts table)
  SELECT * INTO v_person FROM public.people
  WHERE id = p_person_id AND user_id = auth.uid();
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'Invalid person_id';
  END IF;

  INSERT INTO public.debts (
    user_id,
    person_id,
    type,
    counterparty_name,
    counterparty_phone,
    original_amount,
    remaining_amount,
    notes
  )
  VALUES (
    auth.uid(),
    p_person_id,
    p_type,
    v_person.name,
    v_person.phone,
    p_original_amount,
    p_original_amount,
    p_notes
  )
  RETURNING * INTO v_debt;

  RETURN v_debt;
END;
$$;
