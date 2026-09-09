-- ================================================================
-- Migration 20260810000010_goal_contribution_withdrawal_and_lifecycle.sql
-- Manifest #29: Fix F16 - Hỗ trợ rút tiền mục tiêu, kiểm tra chặn âm,
-- cập nhật trạng thái vòng đời hai chiều và khóa hàng FOR UPDATE.
-- ================================================================

-- 1. DROP IF EXISTS & CREATE OR REPLACE add_goal_contribution
DROP FUNCTION IF EXISTS public.add_goal_contribution(UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID);
DROP FUNCTION IF EXISTS public.add_goal_contribution(UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID, BOOLEAN, JSONB);
DROP FUNCTION IF EXISTS add_goal_contribution(UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID);
DROP FUNCTION IF EXISTS add_goal_contribution(UUID, BIGINT, TIMESTAMPTZ, TEXT, UUID, BOOLEAN, JSONB);

CREATE OR REPLACE FUNCTION add_goal_contribution(
  p_goal_id UUID,
  p_amount_minor BIGINT,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW(),
  p_note TEXT DEFAULT NULL,
  p_client_generated_id UUID DEFAULT NULL,
  p_create_transaction BOOLEAN DEFAULT FALSE,
  p_transaction_payload JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_contribution_id UUID;
  v_user_id UUID;
  v_current BIGINT;
  v_target BIGINT;
  v_status goal_status;
  v_new_status goal_status;
  v_tx_id UUID;
BEGIN
  IF p_amount_minor = 0 THEN
    RAISE EXCEPTION 'Contribution amount cannot be zero';
  END IF;

  -- Khóa hàng kiểm tra quyền sở hữu và lấy số dư hiện hành
  SELECT user_id, current_amount_minor, target_amount_minor, status
  INTO v_user_id, v_current, v_target, v_status
  FROM saving_goals
  WHERE id = p_goal_id
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;

  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Goal does not belong to user';
  END IF;

  -- Kiểm tra không cho phép rút vượt quá số dư hiện có (F16 / AC-008-2)
  IF p_amount_minor < 0 AND (v_current + p_amount_minor) < 0 THEN
    RAISE EXCEPTION 'Withdrawal amount (%) exceeds goal balance (%)', ABS(p_amount_minor), v_current;
  END IF;

  -- Idempotent check
  IF p_client_generated_id IS NOT NULL THEN
    SELECT id INTO v_contribution_id
    FROM goal_contributions
    WHERE user_id = auth.uid()
      AND client_generated_id = p_client_generated_id;

    IF v_contribution_id IS NOT NULL THEN
      RETURN v_contribution_id;
    END IF;
  END IF;

  -- Optionally create transaction (nếu có yêu cầu ghi sổ tài khoản)
  IF p_create_transaction AND p_transaction_payload IS NOT NULL THEN
    INSERT INTO transactions (
      user_id, type, amount_minor, currency,
      occurred_at, category_id, payee, note, source
    ) VALUES (
      auth.uid(),
      (p_transaction_payload->>'type')::transaction_type,
      (p_transaction_payload->>'amount_minor')::BIGINT,
      COALESCE(p_transaction_payload->>'currency', 'VND'),
      COALESCE((p_transaction_payload->>'occurred_at')::TIMESTAMPTZ, NOW()),
      (p_transaction_payload->>'category_id')::UUID,
      p_transaction_payload->>'payee',
      p_transaction_payload->>'note',
      'manual'
    )
    RETURNING id INTO v_tx_id;
  END IF;

  -- Ghi nhận lịch sử đóng góp / rút tiền vào goal_contributions
  INSERT INTO goal_contributions (
    goal_id, user_id, amount_minor, occurred_at, note,
    transaction_id, client_generated_id
  ) VALUES (
    p_goal_id, auth.uid(), p_amount_minor, p_occurred_at, p_note,
    v_tx_id, p_client_generated_id
  )
  RETURNING id INTO v_contribution_id;

  -- Tính toán trạng thái vòng đời hai chiều (AC-008-3):
  -- 1. Nếu số dư >= mục tiêu -> completed
  -- 2. Nếu đã completed nhưng rút tiền làm số dư < mục tiêu -> phục hồi active
  -- 3. Ngược lại giữ nguyên trạng thái hiện tại (active/paused)
  IF (v_current + p_amount_minor) >= v_target THEN
    v_new_status := 'completed'::goal_status;
  ELSIF v_status = 'completed' AND (v_current + p_amount_minor) < v_target THEN
    v_new_status := 'active'::goal_status;
  ELSE
    v_new_status := v_status;
  END IF;

  -- Cập nhật số dư mục tiêu và trạng thái mới
  UPDATE saving_goals
  SET current_amount_minor = current_amount_minor + p_amount_minor,
      status = v_new_status,
      updated_at = NOW(),
      version = version + 1
  WHERE id = p_goal_id;

  RETURN v_contribution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
