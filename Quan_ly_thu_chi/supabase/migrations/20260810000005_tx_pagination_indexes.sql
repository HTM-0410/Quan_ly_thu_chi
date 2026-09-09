-- ================================================================
-- Migration: 20260810000005_tx_pagination_indexes.sql
-- Mục đích: Tối ưu hoá phân trang server-side và lọc status/user_id (F05 / V1-02)
-- ================================================================

-- Composite index cho truy vấn phân trang theo thời gian:
-- SELECT * FROM transactions WHERE user_id = ... ORDER BY occurred_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred_id
  ON transactions(user_id, occurred_at DESC, id DESC);

-- Composite index cho truy vấn phân trang có lọc status:
-- SELECT * FROM transactions WHERE user_id = ... AND status = ... ORDER BY occurred_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_transactions_user_status_occurred
  ON transactions(user_id, status, occurred_at DESC, id DESC);
