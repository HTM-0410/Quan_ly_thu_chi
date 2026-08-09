-- ============================================================
-- Migration: m6_debts - Quản lý công nợ đơn giản
-- Tables: people, debts, debt_payments
-- ============================================================

-- 1. Bảng people - Danh sách người quen dùng chung
CREATE TABLE IF NOT EXISTS public.people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own people"
  ON public.people
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Bảng debts - Khoản cho vay / đi vay
CREATE TABLE IF NOT EXISTS public.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('lend', 'borrow')),
  original_amount BIGINT NOT NULL CHECK (original_amount > 0),
  remaining_amount BIGINT NOT NULL CHECK (remaining_amount >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT remaining_not_exceed_original CHECK (remaining_amount <= original_amount)
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own debts"
  ON public.debts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_debts_person ON public.debts(person_id);
CREATE INDEX idx_debts_status ON public.debts(status);
CREATE INDEX idx_debts_type ON public.debts(type);

-- 3. Bảng debt_payments - Lịch sử trả nợ
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id UUID NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage payments via their debts"
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

CREATE INDEX idx_debt_payments_debt ON public.debt_payments(debt_id);

-- Trigger: auto-update remaining_amount và status khi thêm payment
CREATE OR REPLACE FUNCTION public.handle_debt_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining BIGINT;
BEGIN
  -- Tính remaining mới
  SELECT original_amount - COALESCE(
    (SELECT SUM(amount) FROM public.debt_payments WHERE debt_id = NEW.debt_id AND id != NEW.id),
    0
  ) - NEW.amount
  INTO v_remaining
  FROM public.debts
  WHERE id = NEW.debt_id;

  -- Update debts
  UPDATE public.debts
  SET
    remaining_amount = GREATEST(0, v_remaining),
    status = CASE WHEN GREATEST(0, v_remaining) = 0 THEN 'paid' ELSE status END,
    updated_at = now()
  WHERE id = NEW.debt_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_debt_payment ON public.debt_payments;
CREATE TRIGGER on_debt_payment
  AFTER INSERT ON public.debt_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_debt_payment();

-- ============================================================
-- RPC Functions
-- ============================================================

-- get_people: Lấy danh sách người của user hiện tại
CREATE OR REPLACE FUNCTION public.get_people()
RETURNS SETOF public.people
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.people
  WHERE user_id = auth.uid()
  ORDER BY name ASC;
END;
$$;

-- create_person: Tạo người mới
CREATE OR REPLACE FUNCTION public.create_person(
  p_name TEXT,
  p_phone TEXT DEFAULT NULL
)
RETURNS public.people
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_person public.people;
BEGIN
  INSERT INTO public.people (user_id, name, phone)
  VALUES (auth.uid(), p_name, p_phone)
  RETURNING * INTO v_person;
  RETURN v_person;
END;
$$;

-- delete_person: Xóa người (chỉ khi không có debt nào)
CREATE OR REPLACE FUNCTION public.delete_person(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Kiểm tra không có debt nào liên quan
  IF EXISTS (SELECT 1 FROM public.debts WHERE person_id = p_id) THEN
    RAISE EXCEPTION 'Cannot delete person with existing debts';
  END IF;

  DELETE FROM public.people WHERE id = p_id AND user_id = auth.uid();
  RETURN TRUE;
END;
$$;

-- get_debts: Lấy danh sách debts
CREATE OR REPLACE FUNCTION public.get_debts(p_status TEXT DEFAULT NULL)
RETURNS SETOF public.debts
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.debts
  WHERE user_id = auth.uid()
    AND (p_status IS NULL OR status = p_status)
  ORDER BY created_at DESC;
END;
$$;

-- get_debt_payments: Lấy payments của một debt
CREATE OR REPLACE FUNCTION public.get_debt_payments(p_debt_id UUID)
RETURNS SETOF public.debt_payments
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT dp.* FROM public.debt_payments dp
  JOIN public.debts d ON d.id = dp.debt_id
  WHERE dp.debt_id = p_debt_id AND d.user_id = auth.uid()
  ORDER BY dp.payment_date ASC;
END;
$$;

-- create_debt: Tạo khoản nợ mới
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
BEGIN
  -- Verify person belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM public.people WHERE id = p_person_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Invalid person_id';
  END IF;

  INSERT INTO public.debts (user_id, person_id, type, original_amount, remaining_amount, notes)
  VALUES (auth.uid(), p_person_id, p_type, p_original_amount, p_original_amount, p_notes)
  RETURNING * INTO v_debt;

  RETURN v_debt;
END;
$$;

-- delete_debt: Xóa khoản nợ
CREATE OR REPLACE FUNCTION public.delete_debt(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.debts WHERE id = p_id AND user_id = auth.uid();
  RETURN TRUE;
END;
$$;

-- add_debt_payment: Thêm payment (trigger tự update remaining)
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

  INSERT INTO public.debt_payments (debt_id, amount, payment_date, note)
  VALUES (p_debt_id, p_amount, p_payment_date, p_note)
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$;

-- get_debt_summary: Lấy tổng hợp công nợ
CREATE OR REPLACE FUNCTION public.get_debt_summary()
RETURNS TABLE(metric TEXT, amount BIGINT, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH summary AS (
    SELECT
      COALESCE(SUM(CASE WHEN type = 'lend' AND status = 'active' THEN remaining_amount ELSE 0 END), 0)::BIGINT AS total_lending,
      COALESCE(SUM(CASE WHEN type = 'borrow' AND status = 'active' THEN remaining_amount ELSE 0 END), 0)::BIGINT AS total_borrowing,
      COUNT(CASE WHEN type = 'lend' AND status = 'active' THEN 1 END)::BIGINT AS lend_count,
      COUNT(CASE WHEN type = 'borrow' AND status = 'active' THEN 1 END)::BIGINT AS borrow_count
    FROM public.debts
    WHERE user_id = auth.uid()
  )
  SELECT
    x.metric::TEXT,
    x.amount::BIGINT,
    x.count::BIGINT
  FROM (
    SELECT 'total_lending' AS metric, total_lending AS amount, lend_count AS count FROM summary
    UNION ALL
    SELECT 'total_borrowing' AS metric, total_borrowing AS amount, borrow_count AS count FROM summary
  ) x;
END;
$$;
