-- Migration: M3 - Saving Goals, Recurring Rules, Goal Contributions
-- Spec reference: Mục 9.10-9.13 - Budget, Saving Goals, Recurring
-- Created: 2026-08-01
-- Status: Milestone 3

-- ================================================================
-- ENUMS
-- ================================================================

CREATE TYPE goal_status AS ENUM (
  'active',
  'completed',
  'paused',
  'abandoned'
);

CREATE TYPE recurring_frequency AS ENUM (
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly'
);

CREATE TYPE recurring_status AS ENUM (
  'active',
  'paused',
  'ended'
);

-- ================================================================
-- SAVING_GOALS
-- ================================================================

CREATE TABLE saving_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  current_amount_minor BIGINT NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  target_date DATE,
  note TEXT,
  icon TEXT NOT NULL DEFAULT 'savings',
  color TEXT NOT NULL DEFAULT '#FFC107',
  status goal_status NOT NULL DEFAULT 'active',
  linked_account_id UUID REFERENCES financial_accounts(id) ON DELETE SET NULL,
  client_generated_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT positive_target_amount CHECK (target_amount_minor > 0),
  CONSTRAINT non_negative_current_amount CHECK (current_amount_minor >= 0),
  CONSTRAINT valid_target_date CHECK (target_date IS NULL OR target_date >= start_date)
);

CREATE UNIQUE INDEX idx_saving_goals_client_generated_id
  ON saving_goals(user_id)
  WHERE client_generated_id IS NOT NULL;

CREATE INDEX idx_saving_goals_user_id ON saving_goals(user_id);
CREATE INDEX idx_saving_goals_status ON saving_goals(status);
CREATE INDEX idx_saving_goals_target_date ON saving_goals(target_date);

-- ================================================================
-- GOAL_CONTRIBUTIONS
-- ================================================================

CREATE TABLE goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES saving_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL, -- có dấu: dương=thêm, âm=rút
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  client_generated_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT non_zero_contribution CHECK (amount_minor != 0)
);

CREATE UNIQUE INDEX idx_goal_contributions_client_generated_id
  ON goal_contributions(user_id)
  WHERE client_generated_id IS NOT NULL;

CREATE INDEX idx_goal_contributions_goal_id ON goal_contributions(goal_id);
CREATE INDEX idx_goal_contributions_user_id ON goal_contributions(user_id);
CREATE INDEX idx_goal_contributions_occurred_at ON goal_contributions(occurred_at);

-- ================================================================
-- RECURRING_RULES
-- ================================================================

CREATE TABLE recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type transaction_type NOT NULL,
  account_id UUID NOT NULL REFERENCES financial_accounts(id) ON DELETE CASCADE,
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  frequency recurring_frequency NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payee TEXT,
  note TEXT,
  day_of_month INTEGER,
  day_of_week INTEGER,
  next_occurrence TIMESTAMPTZ NOT NULL,
  last_occurrence TIMESTAMPTZ,
  status recurring_status NOT NULL DEFAULT 'active',
  client_generated_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT positive_recurring_amount CHECK (amount_minor > 0),
  CONSTRAINT valid_day_of_month CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 31)),
  CONSTRAINT valid_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 1 AND day_of_week <= 7)),
  CONSTRAINT valid_recurring_end_date CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE UNIQUE INDEX idx_recurring_rules_client_generated_id
  ON recurring_rules(user_id)
  WHERE client_generated_id IS NOT NULL;

CREATE INDEX idx_recurring_rules_user_id ON recurring_rules(user_id);
CREATE INDEX idx_recurring_rules_status ON recurring_rules(status);
CREATE INDEX idx_recurring_rules_next_occurrence ON recurring_rules(next_occurrence);
CREATE INDEX idx_recurring_rules_frequency ON recurring_rules(frequency);

-- ================================================================
-- TRIGGERS for updated_at
-- ================================================================

CREATE TRIGGER update_saving_goals_updated_at
  BEFORE UPDATE ON saving_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_rules_updated_at
  BEFORE UPDATE ON recurring_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- ENABLE RLS
-- ================================================================

ALTER TABLE saving_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- SAVING_GOALS RLS
-- ================================================================

CREATE POLICY "Users can view own saving goals"
  ON saving_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saving goals"
  ON saving_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saving goals"
  ON saving_goals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saving goals"
  ON saving_goals FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- GOAL_CONTRIBUTIONS RLS
-- ================================================================

CREATE POLICY "Users can view own contributions"
  ON goal_contributions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contributions"
  ON goal_contributions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contributions"
  ON goal_contributions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contributions"
  ON goal_contributions FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- RECURRING_RULES RLS
-- ================================================================

CREATE POLICY "Users can view own recurring rules"
  ON recurring_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recurring rules"
  ON recurring_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recurring rules"
  ON recurring_rules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recurring rules"
  ON recurring_rules FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- RPC: add_goal_contribution
-- Spec: M3 - Đóng góp vào goal với idempotency
-- ================================================================

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
  v_new_status goal_status;
  v_tx_id UUID;
BEGIN
  -- Verify ownership
  SELECT user_id, current_amount_minor, target_amount_minor
  INTO v_user_id, v_current, v_target
  FROM saving_goals
  WHERE id = p_goal_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Goal not found';
  END IF;

  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Goal does not belong to user';
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

  -- Optionally create transaction
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

  -- Insert contribution
  INSERT INTO goal_contributions (
    goal_id, user_id, amount_minor, occurred_at, note,
    transaction_id, client_generated_id
  ) VALUES (
    p_goal_id, auth.uid(), p_amount_minor, p_occurred_at, p_note,
    v_tx_id, p_client_generated_id
  )
  RETURNING id INTO v_contribution_id;

  -- Update goal current_amount + status
  v_new_status := CASE
    WHEN v_current + p_amount_minor >= v_target THEN 'completed'::goal_status
    ELSE (SELECT status FROM saving_goals WHERE id = p_goal_id)
  END;

  UPDATE saving_goals
  SET current_amount_minor = current_amount_minor + p_amount_minor,
      status = v_new_status,
      updated_at = NOW(),
      version = version + 1
  WHERE id = p_goal_id;

  RETURN v_contribution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- RPC: get_budget_progress
-- Spec: M3 - Tính tiến độ ngân sách
-- ================================================================

CREATE OR REPLACE FUNCTION get_budget_progress(
  p_budget_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS TABLE (
  budget_id UUID,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  spent_minor BIGINT,
  transaction_count BIGINT,
  percent NUMERIC
) AS $$
DECLARE
  v_amount_minor BIGINT;
BEGIN
  SELECT amount_minor INTO v_amount_minor
  FROM budgets
  WHERE id = p_budget_id AND user_id = auth.uid();

  IF v_amount_minor IS NULL THEN
    RAISE EXCEPTION 'Budget not found';
  END IF;

  RETURN QUERY
  SELECT
    p_budget_id AS budget_id,
    p_period_start AS period_start,
    p_period_end AS period_end,
    COALESCE(SUM(t.amount_minor), 0)::BIGINT AS spent_minor,
    COUNT(t.id)::BIGINT AS transaction_count,
    CASE WHEN v_amount_minor > 0
      THEN ROUND((COALESCE(SUM(t.amount_minor), 0)::NUMERIC / v_amount_minor) * 100, 2)
      ELSE 0
    END AS percent
  FROM transactions t
  WHERE t.user_id = auth.uid()
    AND t.status != 'voided'
    AND t.type = 'expense'
    AND t.occurred_at >= p_period_start
    AND t.occurred_at < p_period_end
    AND (
      NOT EXISTS (SELECT 1 FROM budget_categories WHERE budget_id = p_budget_id)
      OR t.category_id IN (SELECT category_id FROM budget_categories WHERE budget_id = p_budget_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- RPC: materialize_recurring_rules
-- Spec: M3 - Sinh giao dịch từ recurring rules đến hạn
-- ================================================================

CREATE OR REPLACE FUNCTION materialize_recurring_rules(
  p_up_to TIMESTAMPTZ DEFAULT NOW(),
  p_max_rules INTEGER DEFAULT 50
)
RETURNS INTEGER AS $$
DECLARE
  v_rule RECORD;
  v_current_next TIMESTAMPTZ;
  v_new_next TIMESTAMPTZ;
  v_count INTEGER := 0;
  v_tx_id UUID;
  v_interval INTERVAL;
BEGIN
  FOR v_rule IN
    SELECT *
    FROM recurring_rules
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND next_occurrence <= p_up_to
    ORDER BY next_occurrence
    LIMIT p_max_rules
  LOOP
    v_current_next := v_rule.next_occurrence;

    -- Compute next interval based on frequency
    v_interval := CASE v_rule.frequency
      WHEN 'daily' THEN INTERVAL '1 day'
      WHEN 'weekly' THEN INTERVAL '7 days'
      WHEN 'biweekly' THEN INTERVAL '14 days'
      WHEN 'monthly' THEN INTERVAL '1 month'
      WHEN 'quarterly' THEN INTERVAL '3 months'
      WHEN 'yearly' THEN INTERVAL '1 year'
    END;

    WHILE v_current_next <= p_up_to LOOP
      -- Create transaction
      INSERT INTO transactions (
        user_id, type, amount_minor, currency,
        occurred_at, category_id, payee, note, source
      ) VALUES (
        v_rule.user_id, v_rule.type, v_rule.amount_minor, v_rule.currency,
        v_current_next, v_rule.category_id, v_rule.payee, v_rule.note, 'recurring'
      )
      RETURNING id INTO v_tx_id;

      -- Create entry
      INSERT INTO transaction_entries (
        transaction_id, account_id, amount_minor
      ) VALUES (
        v_tx_id, v_rule.account_id,
        CASE WHEN v_rule.type IN ('income', 'refund')
          THEN v_rule.amount_minor
          ELSE -v_rule.amount_minor
        END
      );

      v_current_next := v_current_next + v_interval;
      v_count := v_count + 1;
    END LOOP;

    -- Update rule's next_occurrence and last_occurrence
    UPDATE recurring_rules
    SET next_occurrence = v_current_next,
        last_occurrence = v_current_next - v_interval,
        updated_at = NOW(),
        version = version + 1
    WHERE id = v_rule.id;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
