# Evidence 03 — Browser route checks

Environment: local Vite server at http://127.0.0.1:8080, Codex in-app browser, desktop viewport, unauthenticated.

Observed accessibility states:

1. /login rendered title “Đăng nhập · Quản lý thu chi”; Email, Mật khẩu, Đăng nhập, Quên mật khẩu and Đăng ký were present.
2. Clicking Đăng ký navigated to /signup; Họ tên, Email, Mật khẩu, xác nhận mật khẩu and Tạo tài khoản were present.
3. Clicking Đăng nhập then Quên mật khẩu navigated to /forgot-password; email field and Gửi liên kết đặt lại mật khẩu were present.
4. Direct navigation to /dashboard without a session redirected to /login.

Not executed:

- Signup submission, email confirmation, login with a test user.
- Creating wallet, first transaction, transfer, debt, OCR, budget, goal, recurring, reports or CSV persistence.
- Reload/persistence after authenticated writes.
- Mobile 360px/390px, keyboard-only authenticated flows, network fault injection.

Reason: no isolated Supabase DB/fixture was available; using remote/demo financial data or sending credentials was out of scope.

