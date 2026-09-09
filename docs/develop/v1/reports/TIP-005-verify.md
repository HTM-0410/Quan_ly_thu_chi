# Biên Bản Nghiệm Thu TIP-005

- **Mã TIP:** TIP-005
- **Mã V1:** V1-05 (Sửa Chữa Sâu Nghiệp Vụ Công Nợ & Trả Nợ Nguyên Tử)
- **Mã Lỗi Khắc Phục:** F08, F09, F10
- **Người thẩm định:** THẦU (Contractor)
- **Thời gian nghiệm thu:** 2026-09-07T15:53:00+07:00
- **Kết quả:** **ACCEPTED**

---

## 1. Kiểm tra Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã AC | Tiêu chí | Kết quả | Ghi chú thẩm tra |
|---|---|---|---|
| **AC-05.1** | Tách bạch nợ cũ mở đầu vs khoản vay mới giải ngân qua ví (F08). Khi tạo nợ mới, nếu không chọn ví thì không sinh transaction và không ảnh hưởng số dư tài khoản; nếu chọn ví thì giải ngân và ghi nhận metadata `is_debt_principal: true`. | **PASS** | `DebtFormModal.tsx` cung cấp checkbox tùy chọn giải ngân ví (mặc định không tích chọn). `createDebt` trong `api.ts` xử lý điều kiện chính xác và gắn tag `is_debt_principal: true`. |
| **AC-05.2** | Đối xứng hoàn toàn giữa hai luồng `lend` (cho vay) và `borrow` (đi vay) (F09). Cả hai luồng đều hỗ trợ trả một phần hoặc trả hết qua `PaymentModal`, chọn tài khoản trích/nhận tiền rõ ràng. | **PASS** | `DebtDetailModal.tsx` đã xóa lệnh gọi tắt `markDebtPaid` của `borrow`, chuyển cả 2 sang `PaymentModal`. Nhãn giao diện hiển thị chính xác "Ghi nhận thu tiền" (`lend`) và "Ghi nhận trả nợ" (`borrow`). |
| **AC-05.3** | Trả nợ nguyên tử tại database (F10), loại bỏ cơ chế rollback thủ công 2 bước phía client. Sử dụng RPC `settle_debt_payment` với row lock `FOR UPDATE`, bảo toàn tính nhất quán giữa công nợ và số dư tài khoản. | **PASS** | Migration `20260810000006_settle_debt_payment_rpc.sql` thực hiện transaction nguyên tử trong DB, có idempotency key và trigger-safe remaining deduction. `PaymentModal.tsx` gọi trực tiếp `settleDebtPayment`. |
| **AC-05.4** | Các giao dịch phát sinh từ trả nợ mang cờ metadata `is_debt_principal: true` để phân biệt với thu chi tiêu dùng thông thường. | **PASS** | RPC và API fallback đều gán `is_debt_principal: true` trong `metadata` của transaction. |

---

## 2. Bằng chứng kiểm thử độc lập
- **Vitest Suite:** 6/6 test files pass, 78/78 tests pass (100% offline).
- **Typecheck:** `tsc --noEmit` hoàn thành với 0 lỗi.
- **Tuân thủ D09:** Không ghi dữ liệu remote, kiểm thử hoàn toàn độc lập và an toàn.

---

## 3. Quyết định
THẦU chính thức nghiệm thu đạt TIP-005 (**ACCEPTED**). Cập nhật `CHECKPOINT.md` và tiếp tục chuyển tiếp sang ĐỢT 2: TIP-003 (Ngân sách & Cây Danh mục - F03, F04, F17).
