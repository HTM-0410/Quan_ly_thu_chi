-- ================================================================
-- MIGRATION 20260810000009: Recurring Scheduler, Boundary Days & Idempotency
-- Fix F15: Lập lịch đúng ngày trong tháng (day_of_month 31),
-- phục hồi ngày sau tháng thiếu (28/02 -> 31/03), khóa FOR UPDATE,
-- và gán client_generated_id chống sinh trùng lặp giao dịch.
ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS global_category_id UUID;

-- 1. DROP IF EXISTS & CREATE OR REPLACE materialize_recurring_rules
DROP FUNCTION IF EXISTS public.materialize_recurring_rules(TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS materialize_recurring_rules(TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION materialize_recurring_rules(
  p_up_to TIMESTAMPTZ DEFAULT NOW(),
  p_max_rules INTEGER DEFAULT 50
)
RETURNS INTEGER AS $$
DECLARE
  v_rule RECORD;
  v_current_next TIMESTAMPTZ;
  v_target_day INTEGER;
  v_step_months INTEGER;
  v_base_date TIMESTAMPTZ;
  v_last_day INTEGER;
  v_actual_day INTEGER;
  v_count INTEGER := 0;
  v_tx_id UUID;
  v_client_id UUID;
  v_rule_completed BOOLEAN;
BEGIN
  -- Khóa các dòng active đến hạn bằng FOR UPDATE để tránh race condition khi chạy đồng thời
  FOR v_rule IN
    SELECT *
    FROM recurring_rules
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND next_occurrence <= p_up_to
    ORDER BY next_occurrence
    LIMIT p_max_rules
    FOR UPDATE
  LOOP
    v_current_next := v_rule.next_occurrence;
    v_target_day := COALESCE(v_rule.day_of_month, EXTRACT(DAY FROM v_rule.start_date)::INTEGER);
    v_rule_completed := FALSE;

    WHILE v_current_next <= p_up_to LOOP
      -- Kiểm tra nếu đã vượt quá end_date
      IF v_rule.end_date IS NOT NULL AND (v_current_next AT TIME ZONE 'UTC')::DATE > v_rule.end_date THEN
        v_rule_completed := TRUE;
        EXIT;
      END IF;

      -- Sinh client_generated_id xác định từ (rule_id + occurrence date) để chống sinh trùng tuyệt đối
      v_client_id := CAST(MD5(v_rule.id::TEXT || ':' || TO_CHAR(v_current_next AT TIME ZONE 'UTC', 'YYYY-MM-DD')) AS UUID);

      -- Kiểm tra giao dịch đã tồn tại chưa
      SELECT id INTO v_tx_id
      FROM transactions
      WHERE user_id = auth.uid()
        AND client_generated_id = v_client_id;

      IF v_tx_id IS NULL THEN
        -- Tạo transaction
        INSERT INTO transactions (
          user_id,
          type,
          amount_minor,
          currency,
          occurred_at,
          category_id,
          global_category_id,
          payee,
          note,
          status,
          source,
          client_generated_id
        ) VALUES (
          v_rule.user_id,
          v_rule.type,
          v_rule.amount_minor,
          v_rule.currency,
          v_current_next,
          v_rule.category_id,
          v_rule.global_category_id,
          v_rule.payee,
          v_rule.note,
          'pending',
          'recurring',
          v_client_id
        )
        RETURNING id INTO v_tx_id;

        -- Tạo transaction_entry tương ứng
        INSERT INTO transaction_entries (
          transaction_id,
          account_id,
          amount_minor
        ) VALUES (
          v_tx_id,
          v_rule.account_id,
          CASE WHEN v_rule.type IN ('income', 'refund')
            THEN v_rule.amount_minor
            ELSE -v_rule.amount_minor
          END
        );

        v_count := v_count + 1;
      END IF;

      -- Tính ngày kế tiếp dựa trên frequency và target day_of_month (F15)
      IF v_rule.frequency = 'daily' THEN
        v_current_next := v_current_next + INTERVAL '1 day';
      ELSIF v_rule.frequency = 'weekly' THEN
        v_current_next := v_current_next + INTERVAL '7 days';
      ELSIF v_rule.frequency = 'biweekly' THEN
        v_current_next := v_current_next + INTERVAL '14 days';
      ELSIF v_rule.frequency IN ('monthly', 'quarterly', 'yearly') THEN
        v_step_months := CASE v_rule.frequency
          WHEN 'monthly' THEN 1
          WHEN 'quarterly' THEN 3
          WHEN 'yearly' THEN 12
        END;

        -- Tiến bước theo tháng xuất phát từ đầu tháng hiện tại
        v_base_date := (DATE_TRUNC('month', v_current_next AT TIME ZONE 'UTC') + (v_step_months || ' month')::INTERVAL);
        -- Tìm ngày cuối cùng của tháng mục tiêu
        v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', v_base_date) + INTERVAL '1 month - 1 day'))::INTEGER;
        -- Giữ nguyên target day, chỉ kẹp về last_day nếu tháng thiếu ngày (vd 31 kẹp về 28 trong tháng 2, nhưng sang tháng 3 lại là 31)
        v_actual_day := LEAST(v_target_day, v_last_day);

        v_current_next := (DATE_TRUNC('month', v_base_date) + ((v_actual_day - 1) || ' days')::INTERVAL)
                          + (v_rule.next_occurrence::TIME);
      END IF;
    END LOOP;

    -- Cập nhật quy tắc
    IF v_rule_completed THEN
      UPDATE recurring_rules
      SET status = 'ended',
          last_occurrence = v_current_next,
          updated_at = NOW(),
          version = version + 1
      WHERE id = v_rule.id;
    ELSE
      UPDATE recurring_rules
      SET next_occurrence = v_current_next,
          last_occurrence = CASE
            WHEN v_count > 0 THEN NOW()
            ELSE last_occurrence
          END,
          updated_at = NOW(),
          version = version + 1
      WHERE id = v_rule.id;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
