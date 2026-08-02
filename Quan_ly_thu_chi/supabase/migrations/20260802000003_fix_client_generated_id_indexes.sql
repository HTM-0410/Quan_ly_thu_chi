-- Migration: fix client_generated_id unique indexes
-- Bug: M1 + M3 định nghĩa UNIQUE INDEX chỉ trên user_id (thiếu client_generated_id
-- trong key). Kết quả: 1 user chỉ có thể có TỐI ĐA 1 transaction có
-- client_generated_id IS NOT NULL. Lần insert thứ 2 → 409 Conflict.
--
-- Fix: recreate các index với composite key (user_id, client_generated_id)
-- để mỗi cặp (user, client_id) là duy nhất — đúng nghĩa idempotent.

-- transactions
DROP INDEX IF EXISTS idx_transactions_client_generated_id;
CREATE UNIQUE INDEX idx_transactions_client_generated_id
  ON transactions(user_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

-- saving_goals
DROP INDEX IF EXISTS idx_saving_goals_client_generated_id;
CREATE UNIQUE INDEX idx_saving_goals_client_generated_id
  ON saving_goals(user_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

-- goal_contributions
DROP INDEX IF EXISTS idx_goal_contributions_client_generated_id;
CREATE UNIQUE INDEX idx_goal_contributions_client_generated_id
  ON goal_contributions(user_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;

-- recurring_rules
DROP INDEX IF EXISTS idx_recurring_rules_client_generated_id;
CREATE UNIQUE INDEX idx_recurring_rules_client_generated_id
  ON recurring_rules(user_id, client_generated_id)
  WHERE client_generated_id IS NOT NULL;
