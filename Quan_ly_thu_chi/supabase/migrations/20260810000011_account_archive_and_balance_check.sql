-- ================================================================
-- Migration 20260810000011_account_archive_and_balance_check.sql
-- Manifest #30: Cập nhật list_accounts_with_balances hỗ trợ lọc
-- cả tài khoản đã lưu trữ (p_include_archived), phục vụ tab Lưu trữ (F22).
-- ================================================================

-- 1. DROP IF EXISTS & CREATE OR REPLACE list_accounts_with_balances
DROP FUNCTION IF EXISTS public.list_accounts_with_balances(UUID);
DROP FUNCTION IF EXISTS public.list_accounts_with_balances(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS list_accounts_with_balances(UUID);
DROP FUNCTION IF EXISTS list_accounts_with_balances(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION list_accounts_with_balances(
  p_user_id UUID,
  p_include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  type account_type,
  currency TEXT,
  opening_balance_minor BIGINT,
  color TEXT,
  icon TEXT,
  institution_name TEXT,
  include_in_net_worth BOOLEAN,
  is_archived BOOLEAN,
  version INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  balance_minor BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fa.id,
    fa.user_id,
    fa.name,
    fa.type,
    fa.currency::TEXT,
    fa.opening_balance_minor,
    fa.color,
    fa.icon,
    fa.institution_name,
    fa.include_in_net_worth,
    fa.is_archived,
    fa.version,
    fa.created_at,
    fa.updated_at,
    calculate_account_balance(fa.id) AS balance_minor
  FROM financial_accounts fa
  WHERE fa.user_id = p_user_id
    AND (p_include_archived = TRUE OR fa.is_archived = FALSE)
  ORDER BY fa.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION list_accounts_with_balances(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_accounts_with_balances(UUID, BOOLEAN) TO authenticated;
