# TEST RESULTS — Independent Acceptance

Thời điểm chính: 2026-09-07, UTC+7.  
CWD app: D:/Quản lý thu chi/Quan_ly_thu_chi/web.

## Automated checks

| Test ID / command | Environment | Exit | Result | Notes |
|---|---|---:|---|---|
| npm test -- --reporter=verbose | local Vite/Vitest, RUN_REMOTE_TESTS empty | 0 | PASS: 15 files, 131 tests | Không chạy api-debt.test.ts/debt-flow.test.ts; có React act warnings và React Router future warnings. |
| npm run typecheck | local TypeScript | 0 | PASS | tsc --noEmit không lỗi. |
| npm run build | local production build | 0 | PASS kỹ thuật | 2.716 modules; có warning api.ts vừa dynamic vừa static import. |
| lint | package.json | N/A | NOT CONFIGURED | Không có npm lint script/config lint; không ghi nhận PASS. |
| git diff --check | dirty working tree | 0 | PASS | Chỉ có line-ending warnings từ Git ở một số file. |
| supabase status | project supabase | blocked | NOT RUN/BLOCKED | Docker daemon unavailable; không chuyển sang remote. |
| Gemini provider | D09 | not run | NOT RUN | Không phát sinh chi phí/không gửi ảnh thật. |

Test mặc định có guard RUN_REMOTE_TESTS và loại 2 file integration remote. Đây là điểm tốt, nhưng không thay thế được DB test cô lập: test coverage hiện tại chủ yếu là mock/UI/pure helpers.

## Browser checks

Local URL: http://127.0.0.1:8080

| Case | Steps | Expected | Actual | Status |
|---|---|---|---|---|
| WEB-01 | Mở /login | Login page render | Render đúng, có Email, Mật khẩu, Đăng ký, Quên mật khẩu | PASS |
| WEB-02 | Login → click Đăng ký | Signup route render | /signup render đúng, có Họ tên, Email, Mật khẩu, xác nhận | PASS |
| WEB-03 | Login → click Quên mật khẩu | Forgot-password route render | /forgot-password render đúng | PASS |
| WEB-04 | Mở /dashboard khi chưa auth | Protected route về login | Redirect về /login | PASS |
| WEB-05 | Signup/authenticated onboarding | Tạo user, tạo ví, giao dịch đầu, reload | Không chạy; không có test DB/credential được phép | BLOCKED |
| WEB-06 | Giao dịch/transfer/debt/budget/goal/recurring/reports | Persist và đối chiếu DB | Không chạy; local DB blocked | BLOCKED |
| WEB-07 | Mobile 360/390px, keyboard, Escape | Hoàn thành core flows | Không chạy mobile authenticated E2E | BLOCKED |

## Security/static evidence

- web/.env.local có VITE_GEMINI_API_KEY không rỗng; chỉ ghi nhận length, không lưu giá trị.
- Sau npm run build, scan 8 JS/map files: exact key match = TRUE; literal AIza count = 2.
- Console local test đã emit key.length và key.prefix; evidence đã redact prefix.
- Worker proxy chỉ kiểm tra có env key; không thấy auth header validation, rate limit, payload-size guard hoặc model allowlist.
- list_accounts_with_balances(UUID, BOOLEAN) và get_monthly_history(UUID, INTEGER, TEXT) là SECURITY DEFINER, lọc theo p_user_id, nhưng không assert auth.uid().
- calculate_account_balance và get_budget_progress dùng status != voided thay vì posted.
- materialize_recurring_rules insert transaction không nêu status, trong khi transaction_status default là posted.

## Evidence index

- evidence/01_git_and_environment.md
- evidence/02_automated_checks.md
- evidence/03_browser_routes.md
- evidence/04_static_security_and_integrity.md
- evidence/05_bundle_scan.md

