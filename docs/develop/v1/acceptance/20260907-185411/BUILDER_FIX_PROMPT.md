# PROMPT SỬA LỖI SAU NGHIỆM THU — Quản lý thu chi

Bạn là THỢ / BUILDER nhận handoff sửa lỗi sau nghiệm thu độc lập.

## Bối cảnh và ràng buộc

Đọc trước:

- docs/develop/v1/acceptance/20260907-185411/ACCEPTANCE_REPORT.md
- docs/develop/v1/acceptance/20260907-185411/REQUIREMENT_COVERAGE.md
- docs/develop/v1/acceptance/20260907-185411/ISSUES.md
- docs/develop/v1/acceptance/20260907-185411/FIX_TIPS.md
- docs/develop/spec_v1.md
- docs/develop/v1/DECISIONS.md
- docs/develop/v1/REQUIREMENTS_MATRIX.md

Kết quả hiện tại là **REJECTED**. Không sửa report để biến FAIL/BLOCKED thành PASS.

- Chạy git status --short --branch và ghi revision trước khi sửa.
- Working tree dirty: không reset, checkout, clean, force-push hoặc ghi đè thay đổi ngoài phạm vi.
- Không apply migration remote, deploy, sửa dữ liệu production/demo hoặc bật RUN_REMOTE_TESTS=true.
- Không gọi Gemini thật, không gửi ảnh tài chính, không echo API key/password/JWT/service-role key.
- Không đổi expected behavior chỉ để test xanh.
- Nếu Docker/local DB không chạy, ghi BLOCKED; không thay bằng remote.

## Mục tiêu

Đóng ISSUE-ACC-001 đến ISSUE-ACC-008, rồi bàn giao cho Contractor nghiệm thu lại. Chỉ sửa lỗi thuộc phạm vi đã duyệt; không mở feature mới.

## Wave 1 — OCR security: ISSUE-ACC-001, ISSUE-ACC-007

Files chính:

- Quan_ly_thu_chi/web/src/lib/config.ts
- Quan_ly_thu_chi/web/src/lib/ocr.ts
- Quan_ly_thu_chi/web/src/lib/billOcr.ts
- Quan_ly_thu_chi/web/_worker.js/index.js

Yêu cầu:

- Xóa hoàn toàn nhánh gọi Gemini trực tiếp từ browser.
- Không bundle hoặc log VITE_GEMINI_API_KEY, kể cả khi env local có giá trị.
- Browser chỉ gọi same-origin /api/ocr và /api/bill-ocr.
- Worker xác thực Supabase JWT, kiểm tra content-type/schema/body-size, rate limit/quota theo user, model allowlist và sanitize lỗi.

AC:

- Production bundle không có exact key, key pattern hoặc direct URL chứa key.
- Anonymous/invalid JWT, payload quá lớn và quota vượt đều fail closed.
- Request hợp lệ chỉ forward một lần server-side.
- Chạy lại F11–F14 và QA-17.

## Wave 2 — User isolation: ISSUE-ACC-002

Rà soát tối thiểu list_accounts_with_balances, get_monthly_history, calculate_net_worth, mọi SECURITY DEFINER RPC có p_user_id và overload legacy.

Yêu cầu:

- Không tin p_user_id từ client; bỏ khỏi public contract hoặc bắt buộc bằng auth.uid().
- Kiểm tra auth.uid() khác NULL và ownership của mọi entity.
- Revoke overload cũ không dùng; dùng search_path an toàn và explicit grants.

AC:

- User A không đọc/ghi account, balance, report, debt, bill, category hoặc archived row của User B qua UI/direct RPC.
- Anonymous không gọi protected RPC.
- QA-15 có fixture hai user và direct API/RPC assertions.

## Wave 3 — Posted-only accounting: ISSUE-ACC-003

Rà soát calculate_account_balance, calculate_net_worth, get_monthly_history, get_transactions_summary, get_budget_progress và report/category aggregates.

Yêu cầu:

- Chỉ status=posted ảnh hưởng balance, net worth, KPI, budget và biểu đồ.
- pending/voided chỉ tra cứu được trong history/status filter.
- Đồng nhất timezone, kỳ [start, endExclusive) và định nghĩa nghiệp vụ.

AC:

- Fixture gồm posted + pending + voided cùng account/kỳ.
- Balance, Dashboard, Reports, Budget chỉ tính posted.
- Lỗi/loading không biến thành 0.
- Có evidence QA-01, QA-02, QA-03, QA-05, QA-06.

## Wave 4 — Atomicity/idempotency: ISSUE-ACC-004

Phạm vi: web/src/lib/api.ts, settle_debt_payment, create_manual_transaction và OCR import flow.

Yêu cầu:

- Cùng operation giữ nguyên idempotency key; không tạo UUID mới khi retry/conflict/unknown result.
- Cùng key + cùng payload trả kết quả cũ; cùng key + payload khác phải reject.
- Không fallback debt payment sang read → payment → transaction → metadata nhiều request.
- Nếu atomic RPC thiếu, fail closed; không downgrade nghiệp vụ tài chính.
- Một OCR row/split phải atomic; saved row không được nhập lại.

AC:

- Timeout/retry/double-click/concurrent payment chỉ tạo một operation.
- Không trả vượt; không có orphan payment/transaction/debt.
- OCR A/B không gắn nhầm bill/debt.
- QA-06, QA-07, QA-08, QA-09 chạy trên DB cô lập.

## Wave 5 — Recurring pending/confirm: ISSUE-ACC-005

Phạm vi: 20260810000009_recurring_scheduler_and_idempotency.sql, RecurringPage và API.

Yêu cầu:

- Materialize mặc định tạo pending/chờ xác nhận.
- Chỉ confirm mới chuyển posted và đổi balance.
- Auto-post phải là cờ riêng đã được kiểm chứng, không mặc định.
- Giữ occurrence id unique/idempotent, ngày 31: 31/01 → 28/29/02 → 31/03.
- Pause/resume không tự ghi bù hàng loạt.

AC:

- Materialize hai lần không duplicate.
- Pending không đổi balance/KPI.
- Confirm đúng một lần tạo posted.
- Có evidence QA-10 trước/sau.

## Wave 6 — Migration identity và helper secret: ISSUE-ACC-006, ISSUE-ACC-008

Yêu cầu:

- Chọn một migration directory canonical; manifest khớp clean checkout.
- Loại bỏ/đánh dấu stale directory; align config/env/project ref bằng preflight sanitized.
- Không apply remote.
- Xóa password fallback hardcoded khỏi scripts/copy-supabase-data.ps1.
- Secret/password là parameter hoặc secret input bắt buộc; thiếu thì fail trước network/write.
- Có dry-run và log redaction.

AC:

- Local DB reset từ zero chạy được canonical chain khi Docker sẵn sàng.
- Schema/RPC inventory khớp manifest.
- Secret scan sạch; mismatch/missing secret fail closed.
- QA-17 có command, cwd, exit code và evidence.

## Kiểm thử bắt buộc

Đọc setup, vitest.config.ts và helpers trước khi chạy. Ghi command, cwd, environment, exit code và test count:

- npm test -- --reporter=verbose
- npm run typecheck
- npm run build
- lint nếu có cấu hình; nếu không ghi NOT CONFIGURED
- isolated DB migration/reset và fault injection
- QA-01 đến QA-13, QA-15 đến QA-17
- authenticated browser E2E đúng route, desktop và mobile, có reload/persist

Không coi unit xanh, HTTP 200, screenshot cũ, build thành công hoặc Completion Report cũ là bằng chứng đóng issue.

## Completion Report bắt buộc

Tạo report Builder mới, không ghi đè acceptance report:

- STATUS: DONE / PARTIAL / BLOCKED.
- Revision và git status trước/sau.
- Files changed.
- Mapping ISSUE → TIP → REQ → QA → evidence.
- AC từng mục: PASS/FAIL/NOT RUN/BLOCKED.
- Commands/cwd/environment/exit code/test count.
- Migration/schema state và project ref đã sanitize.
- Browser route, viewport, fixture, persist-after-reload.
- Deviations, open risks và lý do.

Chỉ gửi Contractor nghiệm thu lại khi evidence raw, reproducible và không còn P0/P1 chưa xử lý.
