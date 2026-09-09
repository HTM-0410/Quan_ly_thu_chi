# ISSUES — Independent Acceptance

Các issue dưới đây do Contractor nghiệm thu độc lập ghi nhận. Chưa issue nào được tự sửa hoặc tự đóng.

## ISSUE-ACC-001 — Gemini key bị bundle và direct-call từ browser

- Severity: High
- Priority: P0
- Affected: F14, REQ-014, QA-17, D07
- Classification: confirmed by build/static scan; local runtime log also confirms prefix logging.
- Reproduction:
  1. Giữ web/.env.local với VITE_GEMINI_API_KEY không rỗng.
  2. Chạy npm run build.
  3. Quét dist JS/map theo exact value của key mà không in value ra output.
  4. Kết quả exact-match = TRUE; 1 file có match; literal AIza count = 2.
- Evidence: web/src/lib/config.ts:50, 53, 73-77; web/src/lib/ocr.ts:223-226, 270-272; web/src/lib/billOcr.ts:267-269.
- Impact: người dùng trình duyệt có thể lấy key; direct Gemini URL bypass proxy; log dev làm lộ 8 ký tự đầu.
- Fix proposal: bỏ hoàn toàn VITE_GEMINI_API_KEY khỏi client path; chỉ gọi same-origin worker proxy; bỏ prefix/key diagnostics; rotate key đã từng bundle.
- Retest: build với env production sạch, assert không có exact key/API-key pattern; network chỉ đi /api/ocr hoặc /api/bill-ocr; console không chứa secret/prefix.

## ISSUE-ACC-002 — SECURITY DEFINER RPC cho phép chỉ định user khác

- Severity: High
- Priority: P0
- Affected: QA-15, D08/D09, financial privacy
- Classification: confirmed by code; two-user runtime exploit test blocked by Docker.
- Reproduction: trong một authenticated session, gọi list_accounts_with_balances(p_other_user_id, true) hoặc get_monthly_history(p_other_user_id, ...). Function SECURITY DEFINER chỉ WHERE theo p_user_id, không kiểm tra p_user_id = auth.uid().
- Evidence: supabase/migrations/20260810000011_account_archive_and_balance_check.sql:13-63; supabase/migrations/20260803000001_m5_reports_tz_fix.sql:14-82; legacy overload in 20260802000002_m4_perf_rpcs.sql:8-55, 60-103.
- Impact: có thể đọc tên tài khoản, tổ chức, số dư và tổng hợp tài chính user khác nếu RPC đã apply.
- Fix proposal: dùng auth.uid() trong function, bỏ p_user_id khỏi public contract hoặc reject mismatch; revoke legacy overloads; set search_path an toàn; test direct RPC với hai user.
- Retest: QA-15 read/write matrix, anonymous/authenticated role checks, no cross-user rows or aggregates.

## ISSUE-ACC-003 — Pending đi vào số dư/ngân sách/lịch sử

- Severity: High
- Priority: P0
- Affected: D01/D02/D03, REQ-001, REQ-003, REQ-006, REQ-009
- Classification: confirmed by code; runtime fixture blocked.
- Reproduction: tạo transaction status=pending có entry, gọi calculate_account_balance hoặc get_budget_progress/get_monthly_history; predicates hiện dùng status != voided.
- Evidence: supabase/migrations/20260730000001_m1_core_tables.sql:426-444; supabase/migrations/20260810000007_budget_tree_and_lifecycle.sql:65-70; supabase/migrations/20260803000001_m5_reports_tz_fix.sql:62-74.
- Impact: tiền chưa ghi sổ làm thay đổi balance/KPI/budget, gây sai đối chiếu.
- Fix proposal: balance, KPI, budget, reports chỉ dùng status='posted'; pending/voided chỉ xuất hiện ở query history/status filter.
- Retest: fixture posted + pending + voided cùng kỳ; đối chiếu account, Dashboard, Reports, budget và CSV.

## ISSUE-ACC-004 — Idempotency bị phá khi retry conflict và fallback debt không nguyên tử

- Severity: High
- Priority: P0
- Affected: F10/F12, REQ-010/REQ-012, QA-06/QA-07/QA-08/QA-09
- Classification: confirmed by code; network-fault runtime blocked.
- Reproduction:
  1. createManualTransaction nhận conflict/unknown result.
  2. Code xóa input.client_generated_id ở api.ts:569-574 rồi retry bằng UUID mới.
  3. Nếu settle_debt_payment trả 42883, settleDebtPayment rơi về read debt → addDebtPayment → create transaction → update metadata, nhiều request.
- Evidence: web/src/lib/api.ts:521-574 and 1434-1509.
- Impact: retry không còn cùng operation identity; timeout có thể tạo duplicate hoặc lưu nửa công nợ/nửa giao dịch.
- Fix proposal: giữ nguyên idempotency key cho cùng operation; RPC trả kết quả cũ khi key đã tồn tại; không fallback sang multi-request cho nghiệp vụ tài chính P0, hoặc chỉ fail closed khi migration thiếu.
- Retest: fault injection sau từng statement, retry same key, double-click/concurrent request; assert one payment, one transaction, exact remaining.

## ISSUE-ACC-005 — Recurring materialization ghi posted thay vì chờ xác nhận

- Severity: High
- Priority: P1
- Affected: F15, REQ-015, QA-10, D04
- Classification: confirmed by code; scheduler DB runtime blocked.
- Reproduction: materialize_recurring_rules inserts transactions at lines 62-87 but không set status; transaction schema default status='posted'.
- Evidence: supabase/migrations/20260810000009_recurring_scheduler_and_idempotency.sql:60-101; supabase/migrations/20260730000001_m1_core_tables.sql:154-161; DECISIONS.md D04.
- Impact: bấm materialize có thể làm số dư và báo cáo thay đổi trước khi user xác nhận.
- Fix proposal: occurrence pending by default; separate confirm/void/skip or explicitly authorized auto-post per rule; keep occurrence idempotent.
- Retest: 31/01→28/02→31/03, two materialize calls, pending does not change balance, confirm changes exactly once.

## ISSUE-ACC-006 — Migration baseline và project identity chưa thống nhất

- Severity: High
- Priority: P0
- Affected: F26, REQ-026, QA-17, D09
- Classification: confirmed by repository inspection; no remote apply performed.
- Evidence: root supabase/migrations has only 4 files; Quan_ly_thu_chi/supabase/migrations has a different/incomplete working chain plus untracked migrations. .env points to one project ref, web/.env.local/config.toml to another, and supabase/.temp/project-ref remains different.
- Impact: người vận hành có thể migrate sai project hoặc thiếu bảng/RPC; không thể coi rollback/deploy reproducible.
- Fix proposal: một canonical Supabase root, one checked-in manifest, explicit target preflight, remove/archive stale directory, align config/env refs without echoing secrets.
- Retest: clean checkout, local DB reset/migrate from zero, schema/RPC inventory, target ref assertion and dry-run only.

## ISSUE-ACC-007 — Worker OCR proxy thiếu auth/quota/body-size control

- Severity: High
- Priority: P0
- Affected: D07, F14, QA-17
- Classification: confirmed by code; deployed runtime not claimed.
- Evidence: web/_worker.js/index.js:11-32 reads arbitrary request body and forwards it; no Authorization/auth.uid verification, no rate limit/quota, no content-length/payload limit, no model allowlist.
- Impact: public endpoint có thể bị lạm dụng để tiêu quota Gemini, gửi payload lớn hoặc truy cập model ngoài policy.
- Fix proposal: verify Supabase JWT, enforce per-user quota/rate limit, content-type/size/schema validation, model allowlist, sanitized errors, no financial/image logging.
- Retest: anonymous 401, invalid JWT 401, over-size 413, quota 429, valid authenticated request forwards once.

## ISSUE-ACC-008 — Helper copy dữ liệu chứa password fallback hardcoded

- Severity: Medium
- Priority: P0 release hygiene
- Affected: D09, migration/data handling
- Classification: confirmed by repository inspection; script not executed.
- Evidence: Quan_ly_thu_chi/scripts/copy-supabase-data.ps1 contains a hardcoded password literal in the auth import SQL path.
- Impact: nếu script được commit/chia sẻ/chạy nhầm, password fallback có thể tái sử dụng; đây không phải bằng chứng cho production compromise.
- Fix proposal: bỏ password literal, bắt buộc parameter/secret input, fail closed, redact logs, document backup/rollback and target preflight.
- Retest: static secret scan, missing-parameter failure, dry-run on disposable DB.

