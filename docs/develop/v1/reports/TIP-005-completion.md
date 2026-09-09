# Báo Cáo Hoàn Thành TIP-005

- **Mã TIP:** TIP-005
- **Mã V1:** V1-05 (Sửa Chữa Sâu Nghiệp Vụ Công Nợ & Trả Nợ Nguyên Tử)
- **Mã Lỗi Khắc Phục:** F08, F09, F10
- **Người thực hiện:** THỢ (Builder)
- **Thời gian hoàn thành:** 2026-09-07T15:52:00+07:00

---

## 1. Tóm tắt công việc đã thực hiện

### 1.1. Migration RPC Nguyên tử `settle_debt_payment`
- Tạo file migration `Quan_ly_thu_chi/supabase/migrations/20260810000006_settle_debt_payment_rpc.sql` (Mục 25 trong `MIGRATION_MANIFEST.md`):
  - Khóa dòng công nợ bằng `SELECT ... FROM debts WHERE id = p_debt_id FOR UPDATE` để ngăn ngừa race condition.
  - Hỗ trợ `p_idempotency_key` (UUID): nếu trùng key, trả lại kết quả giao dịch và payment trước đó mà không thực hiện lại.
  - Kiểm tra số tiền trả không vượt quá `remaining_amount`.
  - Ghi bản ghi vào `debt_payments`. Nhờ trigger `update_debt_remaining_on_payment()` đã có từ migration `m10`, số dư `remaining_amount` trên `debts` được trừ tự động một cách nhất quán (không trừ tay tránh double deduction).
  - Tự động tạo bản ghi `transactions` (ghi sổ `posted`) và `transaction_entries` tương ứng với tài khoản ví:
    - Khoản cho vay (`lend`): tạo giao dịch thu về ví (`income`), ghi nhận tiền về tài khoản.
    - Khoản đi vay (`borrow`): tạo giao dịch trả tiền đi (`expense`), trừ tiền khỏi tài khoản.
    - Đánh dấu cờ metadata `is_debt_principal: true` để các báo cáo thu chi tiêu dùng loại trừ dòng vốn gốc này.

### 1.2. Mở rộng API Client-side & Types (`api.ts`, `database.types.ts`)
- Cập nhật `web/src/lib/api.ts`:
  - Thêm hàm `settleDebtPayment`: gọi RPC `settle_debt_payment` và cung cấp fallback an toàn gắn cờ `is_debt_principal: true` vào metadata giao dịch nếu RPC chưa áp dụng ở môi trường offline/mock.
  - Nâng cấp hàm `createDebt`: thêm tham số `disburse_account_id?: string | null` (F08). Nếu người dùng chọn tài khoản giải ngân/nhận tiền, hệ thống sẽ tạo giao dịch liên kết tức thì; nếu không chọn, khoản nợ chỉ được lưu dưới dạng theo dõi nợ mở đầu (opening debt) mà không làm sai lệch số dư tài khoản.
- Cập nhật `web/src/lib/database.types.ts`:
  - Bổ sung định nghĩa kiểu cho RPC `settle_debt_payment` trong `Database['public']['Functions']`.

### 1.3. Đồng bộ Đối xứng Giao diện Vay và Cho vay (`PaymentModal.tsx`, `DebtDetailModal.tsx`)
- Cập nhật `web/src/components/PaymentModal.tsx`:
  - Thay thế toàn bộ đoạn code rollback 2 bước không an toàn bằng cuộc gọi duy nhất tới `settleDebtPayment`.
  - Hiển thị nhãn động theo loại nợ:
    - Cho vay (`lend`): Tiêu đề "Ghi nhận thu tiền", nhãn tài khoản "Tài khoản nhận tiền", thông báo "Đã thu hồi hết khoản nợ" / "Đã ghi nhận thu tiền".
    - Đi vay (`borrow`): Tiêu đề "Ghi nhận trả nợ", nhãn tài khoản "Tài khoản trả tiền", thông báo "Đã trả hết khoản nợ" / "Đã ghi nhận trả nợ".
- Cập nhật `web/src/components/DebtDetailModal.tsx`:
  - Loại bỏ luồng gọi tắt `markDebtPaid` đơn phương cho khoản `borrow`. Cả `lend` và `borrow` đều kích hoạt `PaymentModal` để người dùng chọn tài khoản trích tiền/nhận tiền và trả một phần hoặc trả hết.
  - Nút thanh toán hiển thị theo trạng thái: "Ghi nhận thu tiền" (`lend`) hoặc "Ghi nhận trả nợ" (`borrow`). Nếu khoản nợ đã trả hết (`remaining_amount <= 0`), nút được ẩn để tránh thao tác thừa.
  - Lịch sử trả nợ hiển thị ký hiệu trực quan: `+` màu xanh lá cho tiền thu về (`lend`), `-` màu cam cho tiền xuất trả (`borrow`).

### 1.4. Tùy chọn Dòng tiền khi Tạo Nợ Mới (`DebtFormModal.tsx` - F08)
- Cập nhật `web/src/components/DebtFormModal.tsx`:
  - Tải danh sách ví/tài khoản khả dụng qua `listAccounts()`.
  - Thêm checkbox tùy chọn: *"Trừ tiền ngay từ tài khoản (xuất tiền cho vay)"* hoặc *"Cộng tiền ngay vào tài khoản (nhận tiền đi vay)"*.
  - Mặc định là không tích chọn để người dùng nhập các khoản nợ cũ hoặc nợ theo dõi ngoài mà không làm sai lệch số dư ví.
  - Khi tích chọn, dropdown chọn tài khoản hiển thị để người dùng chỉ định nguồn ví liên kết.

---

## 2. Bằng chứng kiểm thử tự động

### 2.1. Vitest Suite
- Cập nhật `web/src/components/PaymentModal.test.tsx`:
  - Mock `settleDebtPayment` từ `api.ts`.
  - Kiểm tra flow trả một phần, trả hết, validation số tiền và xử lý lỗi RPC.
- Kết quả chạy `npm test`:
  - **6 test files passed**, **78/78 tests passed** 100%.

### 2.2. Typecheck
- Kết quả chạy `npm run typecheck` (`tsc --noEmit`):
  - **0 errors**, hoàn toàn sạch lỗi kiểu dữ liệu.
