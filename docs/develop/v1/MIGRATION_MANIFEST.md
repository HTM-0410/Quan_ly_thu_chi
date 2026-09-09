# MIGRATION MANIFEST — Quản lý thu chi
Thư mục chuẩn: `Quan_ly_thu_chi/supabase/migrations`
Cập nhật: 07/09/2026 (TIP-000)

---

## Danh sách Thứ tự Áp dụng Migration

| Thứ tự | Tên File | Mô tả nội dung |
|---|---|---|
| 01 | `20260730000001_m1_core_tables.sql` | Core schema: profiles, accounts, transactions, entries, categories |
| 02 | `20260730000002_m1_rls_policies.sql` | Row-Level Security policies cho các bảng cốt lõi |
| 03 | `20260730000003_m1_rpc_functions.sql` | RPCs: create_manual_transaction, create_transfer, void_transaction, v.v. |
| 04 | `20260730000004_m1_audit_logs.sql` | Bảng audit_logs ghi vết thay đổi giao dịch |
| 05 | `20260801000001_m3_budgets_goals_recurring.sql` | Budgets, saving_goals, goal_contributions, recurring_rules, materialize |
| 06 | `20260802000001_m4_audit_hardening.sql` | Củng cố audit trail và triggers |
| 07 | `20260802000002_m4_perf_rpcs.sql` | Performance RPCs: list_accounts_with_balances, get_monthly_history |
| 08 | `20260802000003_fix_client_generated_id_indexes.sql` | Unique indexes cho client_generated_id chống trùng |
| 09 | `20260802000005_m5_edit_and_adjust_balance.sql` | RPCs: update_transaction, adjust_account_balance |
| 10 | `20260803000001_m5_reports_tz_fix.sql` | RPC get_transactions_summary hỗ trợ start_date/end_date |
| 11 | `20260803000002_m6_debts.sql` | People, debts, debt_payments, debt_audit_log, get_debts, create_debt |
| 12 | `20260803000003_m7_fix_create_debt_counterparty.sql` | Fix RPC create_debt và thêm người tại chỗ |
| 13 | `20260803000004_m8_fix_debts_rls.sql` | Fix RLS policies cho bảng debts và people |
| 14 | `20260803000005_m9_fix_add_debt_payment.sql` | Fix column names (notes), user_id, payment_type trong add_debt_payment |
| 15 | `20260803000006_seed_demo_user.sql` | Seed tài khoản demo cho môi trường dev/staging |
| 16 | `20260803000007_m10_fix_debt_remaining.sql` | Xóa trigger trùng, fix lỗi trừ nợ 2 lần |
| 17 | `20260803000008_m11_fix_debt_summary.sql` | Fix get_debt_summary trả về đủ 4 metrics |
| 18 | `20260809000001_m12_bills.sql` | Bảng bills, bill_items và các RPC quản lý hóa đơn |
| 19 | `20260809000002_m13_category_parent_tree.sql` | Danh mục cây cha/con, RPC resolve tree |
| 20 | `20260810000001_m14_global_categories_and_rpcs_baseline.sql` | Baseline DDL cho global_categories, transactions.global_category_id, RPC mark_debt_paid |
| 21 | `20260810000002_global_category_parent_tree.sql` | Mở rộng parent_id cho global_categories |
| 22 | `20260810000003_update_get_category_usage_counts_global.sql` | Cập nhật get_category_usage_counts hỗ trợ cả danh mục global |
| 23 | `20260810000004_fix_net_worth_and_tz_summary.sql` | Sửa dấu credit card trong calculate_net_worth và thêm p_timezone vào get_transactions_summary |
| 24 | `20260810000005_tx_pagination_indexes.sql` | Composite indexes tối ưu hóa phân trang server-side và lọc status trên transactions |
| 25 | `20260810000006_settle_debt_payment_rpc.sql` | RPC settle_debt_payment thanh toán nợ nguyên tử (row lock, idempotency, ledger entries) |
| 26 | `20260810000007_budget_tree_and_lifecycle.sql` | RPC get_budget_progress với CTE đệ quy cây danh mục, loại trừ nợ, và RPC quản trị vòng đời ngân sách |
| 27 | `20260810000008_category_expenses_breakdown_rpc.sql` | RPC get_category_expenses_breakdown tổng hợp toàn bộ chi tiêu theo danh mục (chưa phân loại & khác) |
| 28 | `20260810000009_recurring_scheduler_and_idempotency.sql` | RPC materialize_recurring_rules xử lý ngày cuối tháng (day 31), khóa FOR UPDATE và client_generated_id chống trùng |
| 29 | `20260810000010_goal_contribution_withdrawal_and_lifecycle.sql` | Fix F16 - RPC add_goal_contribution hỗ trợ rút tiền mục tiêu, chặn âm, đảo trạng thái completed ↔ active và FOR UPDATE |
| 30 | `20260810000011_account_archive_and_balance_check.sql` | Fix F22 - Cập nhật RPC list_accounts_with_balances hỗ trợ tham số p_include_archived phục vụ tab Lưu trữ |
| 31 | `20260907000001_source_schema_compatibility.sql` | Tương thích schema nguồn cho canonical local chain |
| 32 | `20260907000002_debt_audit_log_compatibility.sql` | Bổ sung audit log debt và compatibility fields |
| 33 | `20260907000003_acceptance_hardening.sql` | Hardening ownership/status, atomicity/idempotency, OCR row và recurring pending/confirm |
| 34 | `20260908000001_financial_operations.sql` | Retry form và nghiệp vụ trả hộ nguyên tử |
| 35 | `20260908000002_ocr_row_atomic.sql` | Toàn dòng OCR gồm splits, hóa đơn, công nợ nguyên tử |
| 36 | `20260908000003_principal_reporting.sql` | Loại gốc nợ khỏi thu nhập/chi tiêu báo cáo |
| 37 | `20260908000004_recurring_end_lifecycle.sql` | Kết thúc quy tắc ngay sau kỳ cuối hợp lệ |

## Identity and source-of-truth

`Quan_ly_thu_chi/supabase/migrations` is the only canonical migration root. A
root-level `supabase/migrations` directory is not a source tree and must not be
used by Supabase CLI or deployment tooling. Run
`scripts/preflight-supabase.ps1` before any migration/copy command; it prints
only sanitized project refs and refuses mismatched identities.
