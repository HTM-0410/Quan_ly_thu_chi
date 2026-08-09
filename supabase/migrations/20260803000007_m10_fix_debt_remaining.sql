-- ============================================================
-- Migration: m10_fix_debt_remaining
-- Root cause: Bảng debt_payments có 2 trigger cùng chạy AFTER INSERT
--   - trg_update_remaining_amount → fn_update_remaining_after_payment()
--   - trigger_update_debt_remaining → update_debt_remaining_amount()
-- Cả 2 đều trừ remaining_amount, làm dư nợ giảm 2 lần so với thực tế.
--
-- Ví dụ: debt 90tr, ghi nhận 1 payment 40tr
--   - DB hiển thị remaining = 10tr (đáng lẽ phải 50tr)
--
-- Fix: gộp thành 1 trigger duy nhất (giữ logic audit_log).
-- ============================================================

-- 1. Drop 2 trigger cũ
DROP TRIGGER IF EXISTS trg_update_remaining_amount ON public.debt_payments;
DROP TRIGGER IF EXISTS trigger_update_debt_remaining ON public.debt_payments;

-- 2. Drop 2 function cũ (sẽ được tạo lại bên dưới)
DROP FUNCTION IF EXISTS public.fn_update_remaining_after_payment();
DROP FUNCTION IF EXISTS public.update_debt_remaining_amount();

-- 3. Tạo function mới (single source of truth)
CREATE OR REPLACE FUNCTION public.update_debt_remaining_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining BIGINT;
  v_payment_type TEXT;
BEGIN
  -- Normalize payment_type; NULL cũng treat như 'payment'
  v_payment_type := COALESCE(NEW.payment_type, 'payment');

  -- Lock debt row để tránh race khi nhiều payment cùng lúc
  SELECT remaining_amount INTO v_remaining
  FROM public.debts
  WHERE id = NEW.debt_id
  FOR UPDATE;

  IF v_remaining IS NULL THEN
    RAISE EXCEPTION 'Invalid debt_id';
  END IF;

  -- Trừ remaining cho các payment trả nợ; interest không đổi dư nợ
  IF v_payment_type IN ('principal', 'full', 'adjustment', 'payment') THEN
    v_remaining := v_remaining - NEW.amount;
  ELSIF v_payment_type = 'interest' THEN
    v_remaining := v_remaining;
  ELSE
    -- Unknown payment_type: conservative, treat như payment
    v_remaining := v_remaining - NEW.amount;
  END IF;

  IF v_remaining < 0 THEN
    RAISE EXCEPTION 'Payment would cause negative remaining balance';
  END IF;

  UPDATE public.debts
  SET
    remaining_amount = v_remaining,
    updated_at = NOW(),
    status = CASE WHEN v_remaining = 0 THEN 'paid' ELSE status END
  WHERE id = NEW.debt_id;

  -- Ghi audit log (best-effort; ON CONFLICT để bỏ qua nếu conflict)
  BEGIN
    INSERT INTO public.debt_audit_log (debt_id, action, amount, payment_type, note)
    VALUES (NEW.debt_id, 'payment', NEW.amount, v_payment_type, NEW.notes)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Không block transaction nếu audit log lỗi (vd bảng chưa sẵn sàng)
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- 4. Tạo 1 trigger duy nhất
CREATE TRIGGER trg_debt_payment_update_remaining
AFTER INSERT ON public.debt_payments
FOR EACH ROW EXECUTE FUNCTION public.update_debt_remaining_on_payment();

-- 5. Recompute remaining_amount cho toàn bộ debt đang active
--    (data đã bị corrupt bởi 2 trigger cũ; sửa 1 lần)
DO $$
DECLARE
  rec RECORD;
  v_paid BIGINT;
  v_remaining BIGINT;
BEGIN
  FOR rec IN SELECT id, original_amount FROM public.debts WHERE status = 'active' LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.debt_payments
    WHERE debt_id = rec.id;

    v_remaining := GREATEST(0, rec.original_amount - v_paid);

    UPDATE public.debts
    SET
      remaining_amount = v_remaining,
      status = CASE WHEN v_remaining = 0 THEN 'paid' ELSE status END,
      updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END $$;
