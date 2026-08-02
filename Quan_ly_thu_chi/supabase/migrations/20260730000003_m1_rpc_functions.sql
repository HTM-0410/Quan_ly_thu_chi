-- Migration: M1 - RPC Functions
-- Spec reference: mục 11.1 - RPC bắt buộc
-- Created: 2026-07-30
-- Status: Milestone 1

-- ================================================================
-- create_manual_transaction
-- Spec: mục 11.1
-- ================================================================

CREATE OR REPLACE FUNCTION create_manual_transaction(
  p_client_generated_id UUID,
  p_type transaction_type,
  p_account_id UUID,
  p_amount_minor BIGINT,
  p_currency CHAR(3) DEFAULT 'VND',
  p_occurred_at TIMESTAMPTZ,
  p_category_id UUID DEFAULT NULL,
  p_payee TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_source transaction_source DEFAULT 'manual'
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_entry_amount BIGINT;
  v_user_id UUID;
BEGIN
  -- Kiểm tra account thuộc về user
  SELECT user_id INTO v_user_id
  FROM financial_accounts
  WHERE id = p_account_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Account does not belong to user';
  END IF;

  -- Kiểm tra category thuộc về user (nếu có)
  IF p_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM categories
      WHERE id = p_category_id
        AND (user_id = auth.uid() OR is_system = TRUE)
    ) THEN
      RAISE EXCEPTION 'Category not found or does not belong to user';
    END IF;
  END IF;

  -- Kiểm tra amount > 0
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Idempotent: Nếu đã tồn tại với client_generated_id, trả về ID cũ
  IF p_client_generated_id IS NOT NULL THEN
    SELECT id INTO v_transaction_id
    FROM transactions
    WHERE user_id = auth.uid()
      AND client_generated_id = p_client_generated_id;

    IF v_transaction_id IS NOT NULL THEN
      RETURN v_transaction_id;
    END IF;
  END IF;

  -- Xác định amount có dấu cho entry
  IF p_type IN ('income', 'refund') THEN
    v_entry_amount := p_amount_minor; -- Dương
  ELSE
    v_entry_amount := -p_amount_minor; -- Âm (expense, adjustment)
  END IF;

  -- Tạo transaction và entry trong transaction
  BEGIN
    -- Tạo transaction
    INSERT INTO transactions (
      user_id,
      type,
      occurred_at,
      amount_minor,
      currency,
      category_id,
      payee,
      note,
      source,
      client_generated_id,
      classification_status
    ) VALUES (
      auth.uid(),
      p_type,
      COALESCE(p_occurred_at, NOW()),
      p_amount_minor,
      p_currency,
      p_category_id,
      p_payee,
      p_note,
      p_source,
      p_client_generated_id,
      'confirmed'
    )
    RETURNING id INTO v_transaction_id;

    -- Tạo entry
    INSERT INTO transaction_entries (
      transaction_id,
      account_id,
      amount_minor
    ) VALUES (
      v_transaction_id,
      p_account_id,
      v_entry_amount
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- create_transfer
-- Spec: mục 11.1
-- ================================================================

CREATE OR REPLACE FUNCTION create_transfer(
  p_client_generated_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount_minor BIGINT,
  p_fee_minor BIGINT DEFAULT 0,
  p_occurred_at TIMESTAMPTZ DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_transfer_id UUID;
  v_fee_id UUID;
  v_transfer_group_id UUID;
  v_from_user_id UUID;
  v_to_user_id UUID;
BEGIN
  -- Kiểm tra account nguồn
  SELECT user_id INTO v_from_user_id
  FROM financial_accounts
  WHERE id = p_from_account_id;

  IF v_from_user_id IS NULL THEN
    RAISE EXCEPTION 'Source account not found';
  END IF;

  IF v_from_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Source account does not belong to user';
  END IF;

  -- Kiểm tra account đích
  SELECT user_id INTO v_to_user_id
  FROM financial_accounts
  WHERE id = p_to_account_id;

  IF v_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Destination account not found';
  END IF;

  IF v_to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Destination account does not belong to user';
  END IF;

  -- Không cho phép chuyển cùng tài khoản
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Cannot transfer to the same account';
  END IF;

  -- Kiểm tra amount > 0
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  IF p_fee_minor < 0 THEN
    RAISE EXCEPTION 'Fee cannot be negative';
  END IF;

  -- Idempotent check
  IF p_client_generated_id IS NOT NULL THEN
    SELECT id INTO v_transfer_id
    FROM transactions
    WHERE user_id = auth.uid()
      AND client_generated_id = p_client_generated_id;

    IF v_transfer_id IS NOT NULL THEN
      RETURN v_transfer_id;
    END IF;
  END IF;

  -- Tạo transfer group ID
  v_transfer_group_id := gen_random_uuid();

  BEGIN
    -- Tạo transfer transaction
    INSERT INTO transactions (
      user_id,
      type,
      occurred_at,
      amount_minor,
      currency,
      source,
      client_generated_id,
      transfer_group_id,
      note,
      classification_status
    ) VALUES (
      auth.uid(),
      'transfer',
      COALESCE(p_occurred_at, NOW()),
      p_amount_minor,
      'VND',
      'manual',
      p_client_generated_id,
      v_transfer_group_id,
      p_note,
      'confirmed'
    )
    RETURNING id INTO v_transfer_id;

    -- Tạo entry cho tài khoản nguồn (âm)
    INSERT INTO transaction_entries (
      transaction_id,
      account_id,
      amount_minor
    ) VALUES (
      v_transfer_id,
      p_from_account_id,
      -p_amount_minor
    );

    -- Tạo entry cho tài khoản đích (dương)
    INSERT INTO transaction_entries (
      transaction_id,
      account_id,
      amount_minor
    ) VALUES (
      v_transfer_id,
      p_to_account_id,
      p_amount_minor
    );

    -- Tạo transaction phí nếu có
    IF p_fee_minor > 0 THEN
      INSERT INTO transactions (
        user_id,
        type,
        occurred_at,
        amount_minor,
        currency,
        source,
        transfer_group_id,
        classification_status
      ) VALUES (
        auth.uid(),
        'expense',
        COALESCE(p_occurred_at, NOW()),
        p_fee_minor,
        'VND',
        'manual',
        v_transfer_group_id,
        'confirmed'
      )
      RETURNING id INTO v_fee_id;

      INSERT INTO transaction_entries (
        transaction_id,
        account_id,
        amount_minor
      ) VALUES (
        v_fee_id,
        p_from_account_id,
        -p_fee_minor
      );
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- void_transaction
-- Spec: mục 11.1
-- ================================================================

CREATE OR REPLACE FUNCTION void_transaction(
  p_transaction_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_transaction transactions%ROWTYPE;
  v_audit_log_id UUID;
BEGIN
  -- Lấy transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id
    AND user_id = auth.uid();

  IF v_transaction IS NULL THEN
    RAISE EXCEPTION 'Transaction not found or does not belong to user';
  END IF;

  -- Không cho phép void giao dịch ngân hàng
  IF v_transaction.source = 'bank' THEN
    RAISE EXCEPTION 'Cannot void bank transactions directly';
  END IF;

  -- Không cho phép void giao dịch đã void
  IF v_transaction.status = 'voided' THEN
    RETURN FALSE;
  END IF;

  -- Tạo audit log
  INSERT INTO audit_logs (
    user_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    reason
  ) VALUES (
    auth.uid(),
    'transaction',
    p_transaction_id,
    'void',
    jsonb_build_object(
      'status', v_transaction.status,
      'amount_minor', v_transaction.amount_minor,
      'type', v_transaction.type
    ),
    jsonb_build_object(
      'status', 'voided'
    ),
    p_reason
  )
  RETURNING id INTO v_audit_log_id;

  -- Cập nhật status thành voided
  UPDATE transactions
  SET status = 'voided',
      version = version + 1,
      updated_at = NOW()
  WHERE id = p_transaction_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- get_account_balance
-- Spec: mục 10.1 - Tính số dư
-- ================================================================

CREATE OR REPLACE FUNCTION get_account_balance(
  p_account_id UUID
)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM financial_accounts
  WHERE id = p_account_id;

  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Account not found or does not belong to user';
  END IF;

  RETURN calculate_account_balance(p_account_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- get_net_worth
-- Spec: mục 10.1 - Tính tổng tài sản
-- ================================================================

CREATE OR REPLACE FUNCTION get_net_worth()
RETURNS BIGINT AS $$
BEGIN
  RETURN calculate_net_worth(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- get_transactions_summary
-- Spec: M1 - Báo cáo thu chi cơ bản
-- ================================================================

CREATE OR REPLACE FUNCTION get_transactions_summary(
  p_start_date DATE,
  p_end_date DATE,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_income BIGINT,
  total_expense BIGINT,
  net_change BIGINT,
  transaction_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(
      CASE WHEN t.type = 'income' THEN t.amount_minor ELSE 0 END
    ), 0)::BIGINT as total_income,
    COALESCE(SUM(
      CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END
    ), 0)::BIGINT as total_expense,
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income' THEN t.amount_minor
        WHEN t.type = 'expense' THEN -t.amount_minor
        ELSE 0
      END
    ), 0)::BIGINT as net_change,
    COUNT(t.id)::BIGINT as transaction_count
  FROM transactions t
  WHERE t.user_id = auth.uid()
    AND t.status != 'voided'
    AND t.type IN ('income', 'expense')
    AND t.occurred_at >= p_start_date
    AND t.occurred_at < p_end_date + INTERVAL '1 day'
    AND (p_category_id IS NULL OR t.category_id = p_category_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
