-- Migration: M1 - Audit Logs Table
-- Spec reference: mục 9.12 - Các bảng bổ sung
-- Created: 2026-07-30
-- Status: Milestone 1

-- ================================================================
-- AUDIT_LOGS
-- Spec: mục 9.12
-- ================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'transaction', 'account', 'category', etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'void', etc.
  old_data JSONB,
  new_data JSONB,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
