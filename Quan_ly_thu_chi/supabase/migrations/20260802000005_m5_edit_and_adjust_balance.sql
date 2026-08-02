-- Migration: M5 - Edit giao dịch + Đặt số dư tài khoản
-- Created: 2026-08-02
-- Status: Milestone 5

-- ================================================================
-- update_transaction
-- Sửa giao dịch income/expense (không sửa transfer).
-- Cho phép đổi amount / type / account / category / payee / note /
-- occurred_at. Bump version, ghi audit log.
-- ================================================================

CREATE OR REPLACE FUNCTION update_transaction(
  p_transaction_id UUID,
  p_type transaction_type DEFAULT NULL,
  p_account_id     UUID DEFAULT NULL,
  p_amount_minor   BIGINT DEFAULT NULL,
  p_occurred_at    TIMESTAMPTZ DEFAULT NULL,
  p_category_id    UUID DEFAULT NULL,
  p_clear_category BOOLEAN DEFAULT FALSE,
  p_payee          TEXT DEFAULT NULL,
  p_note           TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_tx RECORD;
  v_new_amount BIGINT;
  v_entry_amount BIGINT;
  v_resolved_type transaction_type;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.user_id != auth.uid() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_tx.type = 'transfer' THEN RAISE EXCEPTION 'Transfers cannot be edited directly'; END IF;
  IF v_tx.status <> 'posted' THEN RAISE EXCEPTION 'Only posted transactions can be edited'; END IF;

  IF p_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM financial_accounts
      WHERE id = p_account_id AND user_id = auth.uid()
    ) THEN RAISE EXCEPTION 'Account not found'; END IF;
  END IF;

  IF p_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM categories
      WHERE id = p_category_id AND (user_id = auth.uid() OR is_system = TRUE)
    ) THEN RAISE EXCEPTION 'Category not found'; END IF;
  END IF;

  v_new_amount := COALESCE(p_amount_minor, v_tx.amount_minor);
  IF v_new_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than 0'; END IF;

  v_resolved_type := COALESCE(p_type, v_tx.type);

  UPDATE transactions SET
    type         = v_resolved_type,
    amount_minor = v_new_amount,
    occurred_at  = COALESCE(p_occurred_at, v_tx.occurred_at),
    category_id  = CASE
                     WHEN p_clear_category THEN NULL
                     WHEN p_category_id IS NOT NULL THEN p_category_id
                     ELSE category_id
                   END,
    payee        = COALESCE(p_payee, v_tx.payee),
    note         = COALESCE(p_note, v_tx.note),
    version      = version + 1,
    updated_at   = NOW()
  WHERE id = p_transaction_id;

  IF v_resolved_type IN ('income', 'refund') THEN
    v_entry_amount := v_new_amount;
  ELSE
    v_entry_amount := -v_new_amount;
  END IF;

  UPDATE transaction_entries SET
    account_id   = COALESCE(p_account_id, account_id),
    amount_minor = v_entry_amount
  WHERE transaction_id = p_transaction_id;

  INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_data, new_data)
  VALUES (
    auth.uid(),
    'transaction',
    p_transaction_id,
    'update',
    jsonb_build_object(
      'type', v_tx.type,
      'amount_minor', v_tx.amount_minor,
      'category_id', v_tx.category_id,
      'payee', v_tx.payee,
      'note', v_tx.note,
      'occurred_at', v_tx.occurred_at
    ),
    jsonb_build_object(
      'type', v_resolved_type,
      'amount_minor', v_new_amount,
      'category_id', CASE WHEN p_clear_category THEN NULL WHEN p_category_id IS NOT NULL THEN p_category_id ELSE v_tx.category_id END,
      'payee', COALESCE(p_payee, v_tx.payee),
      'note', COALESCE(p_note, v_tx.note),
      'occurred_at', COALESCE(p_occurred_at, v_tx.occurred_at),
      'account_id', p_account_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- adjust_account_balance
-- Đặt số dư tuyệt đối bằng cách chỉnh opening_balance_minor sao cho
-- opening_balance + SUM(posted entries) = target.
-- Chỉ tính giao dịch posted (bỏ voided).
-- ================================================================

CREATE OR REPLACE FUNCTION adjust_account_balance(
  p_account_id UUID,
  p_target_balance_minor BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_account RECORD;
  v_entries_sum BIGINT;
  v_new_opening BIGINT;
BEGIN
  SELECT * INTO v_account FROM financial_accounts WHERE id = p_account_id;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF v_account.user_id != auth.uid() THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT COALESCE(SUM(te.amount_minor), 0) INTO v_entries_sum
  FROM transaction_entries te
  JOIN transactions t ON t.id = te.transaction_id
  WHERE te.account_id = p_account_id
    AND t.status = 'posted';

  v_new_opening := p_target_balance_minor - v_entries_sum;

  UPDATE financial_accounts SET
    opening_balance_minor = v_new_opening,
    opening_balance_at    = NOW(),
    version               = version + 1,
    updated_at            = NOW()
  WHERE id = p_account_id;

  INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_data, new_data, reason)
  VALUES (
    auth.uid(),
    'financial_account',
    p_account_id,
    'adjust_balance',
    jsonb_build_object('opening_balance_minor', v_account.opening_balance_minor),
    jsonb_build_object(
      'opening_balance_minor', v_new_opening,
      'target_balance_minor', p_target_balance_minor,
      'entries_sum_minor', v_entries_sum
    ),
    p_note
  );

  RETURN v_new_opening;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
