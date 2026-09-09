# Báo Cáo Hoàn Thành TIP-009: Auth Onboarding, Khôi Phục Tài Khoản & Bảo Vệ Form Chống Mất Dữ Liệu

## 1. Kết Quả Thực Thi
THỢ đã hoàn thành toàn bộ các yêu cầu kỹ thuật và tiêu chí nghiệm thu của TIP-009 (F18, F19, F22, F24):

### AC-009-1 (F18 - Signup Email Confirmation & Resend): ĐẠT
- Đã loại bỏ hoàn toàn bộ đếm tự động chuyển trang 4 giây (`REDIRECT_DELAY_MS`) gây biến mất thông báo khi người dùng chưa kịp đọc.
- Thẻ thông báo xác nhận email hiển thị cố định và rõ ràng địa chỉ email đã gửi kèm hướng dẫn kiểm tra thư rác.
- Thêm nút "Gửi lại email xác nhận" tích hợp hàm `resendConfirmation(email)` gọi `supabase.auth.resend({ type: 'signup', email })`.
- Cung cấp nút chủ động "Đến trang Đăng nhập" để người dùng điều hướng khi sẵn sàng.
- Bổ sung trang Quên mật khẩu `ForgotPasswordPage.tsx` (`/forgot-password`) kèm đường dẫn trên `LoginPage.tsx` và hàm `resetPassword` trong `lib/auth.tsx`.
- Bản địa hóa thông điệp lỗi xác thực sang tiếng Việt (`translateAuthError`).

### AC-009-2 (F22 - Account Archive Warning & Restore Interface): ĐẠT
- Tạo migration `20260810000011_account_archive_and_balance_check.sql` (#30 trong `MIGRATION_MANIFEST.md`):
  - Cập nhật hàm RPC `list_accounts_with_balances(p_user_id, p_include_archived)` cho phép lấy cả tài khoản đã lưu trữ khi cần.
- Bổ sung hàm API `unarchiveAccount(id)` trong `web/src/lib/api.ts` cập nhật `is_archived: false`.
- Tại `AccountsPage.tsx`:
  - Thêm 2 Tab rõ ràng: **"Đang hoạt động"** và **"Đã lưu trữ"** kèm bộ đếm số lượng tài khoản theo từng tab.
  - Cảnh báo tài chính trước khi lưu trữ tài khoản:
    - Nếu số dư > 0: Hiển thị cảnh báo số tiền còn lại và nguy cơ không còn theo dõi được số dư trong danh sách hoạt động.
    - Nếu số dư < 0: Cảnh báo dư nợ chưa giải quyết.
    - Nếu số dư = 0: Thông báo tài khoản sẽ ẩn đi và có thể khôi phục bất kỳ lúc nào.
  - Tab "Đã lưu trữ" hiển thị danh sách các tài khoản đã ẩn kèm nhãn "Đã lưu trữ" và nút hành động **"Khôi phục tài khoản"** gọi `unarchiveAccount`.

### AC-009-3 (F19 - Fast Expense Entry & Last Used Account): ĐẠT
- Nút "Giao dịch mới" trên Header của `DashboardPage.tsx` liên kết trực tiếp tới `/transactions?action=new`.
- Tại `TransactionsPage.tsx`:
  - Tự động nhận diện tham số query URL `action=new` khi mount hoặc điều hướng và tự động mở modal `ManualTransactionModal` với chế độ mặc định là `expense` (chi tiêu).
  - Tự động dọn dẹp query param `action` sau khi mở để không bị lặp lại.
  - Quản lý khóa `last_used_account_id` trong `localStorage`:
    - Ghi nhớ tài khoản được sử dụng lần gần nhất khi lưu giao dịch hoặc chuyển khoản.
    - Khi mở modal tạo giao dịch mới hoặc chuyển khoản, tự động chọn sẵn tài khoản đã dùng gần nhất (nếu còn hoạt động), fallback về tài khoản hoạt động đầu tiên.
- Tại `DashboardPage.tsx`: Khi người dùng mới chưa có tài khoản nào (`accounts.length === 0`), hiển thị Onboarding Banner nổi bật hướng dẫn và cung cấp nút CTA "Thiết lập tài khoản ngay" dẫn sang `/accounts`.

### AC-009-4 (F24 - Dirty Form Guard Protection): ĐẠT
- Component `Modal.tsx` được bổ sung prop `isDirty?: boolean` và `loading?: boolean`.
- Khi người dùng đã nhập liệu (`isDirty === true`) mà bấm phím Escape, click ra ngoài nền tối (backdrop), hoặc bấm nút đóng "×", hệ thống sẽ bật hộp thoại xác nhận: *"Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy bỏ không?"*. Nếu người dùng chọn Cancel, modal sẽ không bị đóng và toàn bộ dữ liệu đang nhập được giữ nguyên.
- Khi đang submit (`loading === true`), phím Escape và click backdrop bị vô hiệu hóa hoàn toàn để ngăn chặn lỗi race condition hoặc hủy request giữa chừng.
- Đã tích hợp `isDirty` cho các modal chính: `AccountsPage` (tạo/sửa tài khoản), `TransactionsPage` (`ManualTransactionModal`, `TransferModal`).

## 2. Kết Quả Kiểm Thử & Build
- `npm run typecheck` (`tsc --noEmit`): 0 lỗi.
- `src/pages/AccountsPage.test.tsx`: 4/4 tests PASS (F22 Archive, Balance warning, Restore tab, Unarchive flow).
- Toàn bộ test suite: 13 test files, 119/119 tests PASS (100% GREEN).
- `npm run build`: Production build thành công sạch sẽ (10.78s).
