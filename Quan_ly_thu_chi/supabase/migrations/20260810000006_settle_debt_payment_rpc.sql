-- ================================================================
-- Migration: 20260810000006_settle_debt_payment_rpc.sql
-- Mục đích: RPC thanh toán nợ nguyên tử (F08, F09, F10 / V1-05)
-- ================================================================

-- 1. DROP IF EXISTS & CREATE OR REPLACE settle_debt_payment
DROP FUNCTION IF EXISTS public.settle_debt_payment(UUID, UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.settle_debt_payment(
  p_debt_id UUID,
  p_account_id UUID,
  p_amount_minor BIGINT,
  p_payment_date TIMESTAMPTZ DEFAULT NOW(),
  p_note TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_debt public.debts;
  v_account public.financial_accounts;
  v_payment_id UUID;
  v_transaction_id UUID;
  v_tx_type transaction_type;
  v_entry_amount BIGINT;
  v_person_name TEXT;
  v_remaining_after BIGINT;
BEGIN
  -- 1. Khóa bản ghi nợ bằng FOR UPDATE để chống race condition
  SELECT * INTO v_debt
  FROM public.debts
  WHERE id = p_debt_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_debt IS NULL THEN
    RAISE EXCEPTION 'Khoản nợ không tồn tại hoặc không thuộc quyền sở hữu.';
  END IF;

  IF v_debt.status = 'paid' OR v_debt.remaining_amount <= 0 THEN
    RAISE EXCEPTION 'Khoản nợ này đã được thanh toán hết.';
  END IF;

  -- 2. Kiểm tra số tiền hợp lệ
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Số tiền thanh toán phải lớn hơn 0.';
  END IF;

  IF p_amount_minor > v_debt.remaining_amount THEN
    RAISE EXCEPTION 'Số tiền thanh toán (%) vượt quá số nợ còn lại (%).', p_amount_minor, v_debt.remaining_amount;
  END IF;

  -- 3. Kiểm tra tài khoản hợp lệ
  SELECT * INTO v_account
  FROM public.financial_accounts
  WHERE id = p_account_id AND user_id = auth.uid();

  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Tài khoản thanh toán không tồn tại hoặc không thuộc quyền sở hữu.';
  END IF;

  -- 4. Kiểm tra chống trùng lặp (Idempotency)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_transaction_id
    FROM public.transactions
    WHERE user_id = auth.uid() AND client_generated_id = p_idempotency_key;

    IF v_transaction_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'debt_id', v_debt.id,
        'remaining_amount', v_debt.remaining_amount,
        'idempotent', true
      );
    END IF;
  END IF;

  -- 5. Tạo debt_payment (trigger update_debt_remaining_on_payment sẽ tự động trừ remaining_amount trên debts)
  INSERT INTO public.debt_payments (
    user_id,
    debt_id,
    amount,
    payment_date,
    notes,
    payment_type
  ) VALUES (
    auth.uid(),
    v_debt.id,
    p_amount_minor,
    COALESCE(p_payment_date, NOW()),
    COALESCE(p_note, 'Thanh toán nợ'),
    'principal'
  )
  RETURNING id INTO v_payment_id;

  -- Đọc lại remaining_amount sau khi trigger chạy
  SELECT remaining_amount INTO v_remaining_after
  FROM public.debts
  WHERE id = v_debt.id;

  -- 6. Ghi nhận giao dịch dòng tiền vào sổ cái
  -- lend (thu nợ cho vay về): tiền vào ví (+)
  -- borrow (trả nợ vay): tiền ra khỏi ví (-)
  IF v_debt.type = 'lend' THEN
    v_tx_type := 'income';
    v_entry_amount := p_amount_minor;
  ELSE
    v_tx_type := 'expense';
    v_entry_amount := -p_amount_minor;
  END IF;

  v_person_name := v_debt.counterparty_name;

  INSERT INTO public.transactions (
    user_id,
    type,
    status,
    occurred_at,
    amount_minor,
    currency,
    payee,
    note,
    source,
    client_generated_id,
    classification_status,
    metadata
  ) VALUES (
    auth.uid(),
    v_tx_type,
    'posted',
    COALESCE(p_payment_date, NOW()),
    p_amount_minor,
    'VND',
    v_person_name,
    COALESCE(p_note, CASE WHEN v_debt.type = 'lend' THEN 'Thu hồi nợ: ' || v_person_name ELSE 'Trả nợ: ' || v_person_name END),
    'manual',
    p_idempotency_key,
    'confirmed',
    jsonb_build_object(
      'debt_id', v_debt.id,
      'debt_payment_id', v_payment_id,
      'debt_type', v_debt.type,
      'is_debt_principal', true
    )
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO public.transaction_entries (
    transaction_id,
    account_id,
    amount_minor
  ) VALUES (
    v_transaction_id,
    p_account_id,
    v_entry_amount
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'transaction_id', v_transaction_id,
    'remaining_amount', v_remaining_after,
    'status', CASE WHEN v_remaining_after <= 0 THEN 'paid' ELSE 'active' END
  );
END;
$$;
