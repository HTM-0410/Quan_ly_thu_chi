# Biên Bản Nghiệm Thu TIP-002

- **Mã TIP:** TIP-002
- **Mã V1:** V1-02 (Truy cập Đầy đủ Lịch sử Giao dịch & Phân trang Server)
- **Mã Lỗi Khắc Phục:** F05
- **Người thẩm định:** THẦU (Contractor)
- **Thời gian nghiệm thu:** 2026-09-07T15:43:30+07:00
- **Kết quả:** **ACCEPTED**

---

## 1. Kiểm tra Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã AC | Tiêu chí | Kết quả | Ghi chú thẩm tra |
|---|---|---|---|
| **AC-02.1** | Hàm `listTransactionsPaginated` hỗ trợ `page`, `pageSize`, trả về `{ items, totalCount, page, pageSize, totalPages }`. Giao dịch thứ 201+ vẫn xem và phân trang được mượt mà. Sắp xếp ổn định theo `occurred_at DESC, id DESC`. | **PASS** | `api.ts` đã triển khai `range(fromIdx, toIdx)` với `count: 'exact'`, sắp xếp `occurred_at DESC, id DESC`. Thanh phân trang hiển thị đầy đủ tại `TransactionsPage.tsx`. |
| **AC-02.2** | Lọc theo loại, tài khoản, danh mục, ngày, số tiền, và tìm kiếm từ khóa (`search` trong payee hoặc note) thực thi trên server. | **PASS** | `listTransactionsPaginated` filter trực tiếp trên PostgREST, tìm kiếm `or(payee.ilike...,note.ilike...)` có debounce 350ms và sanitize ký tự đặc biệt. |
| **AC-02.3** | Hỗ trợ bộ lọc trạng thái `status`: `'posted'` (mặc định), `'voided'` (đã hủy), hoặc `'all'`. Giao dịch đã hủy hiển thị gạch ngang (line-through), badge `[Đã hủy]`, ẩn nút Sửa/Hủy. | **PASS** | Bộ lọc trạng thái hoạt động trực quan; giao dịch `voided` có badge và gạch ngang rõ ràng. |
| **AC-02.4** | Lấy đầy đủ `from_account_id` (entry âm) và `to_account_id` (entry dương) cho giao dịch `transfer`. UI hiển thị rõ ràng `{Tên ví nguồn} → {Tên ví đích}` trên cả mobile card và desktop table. | **PASS** | Domain type `Transaction` đã có `from_account_id` và `to_account_id`. Cả 2 giao diện mobile và desktop đều render `{fromAcc.name} → {toAcc.name}` kèm icon. |
| **AC-02.5** | Giữ hàm `listTransactions` làm wrapper cho các trang khác (`DashboardPage`, `ReportsPage`) để không làm gãy các chức năng hiện hữu. | **PASS** | `listTransactions` là wrapper gọi `listTransactionsPaginated` và trả về `items`. Toàn bộ app build và typecheck 0 lỗi. |

---

## 2. Bằng chứng kiểm thử độc lập
- **Vitest:** 6/6 test files pass, 78/78 tests pass.
- **Typecheck:** `tsc --noEmit` hoàn thành với 0 lỗi.
- **Tuân thủ D09:** Không vi phạm DB remote, kiểm thử hoàn toàn offline.

---

## 3. Quyết định
THẦU chính thức nghiệm thu đạt TIP-002 (**ACCEPTED**). Cập nhật `CHECKPOINT.md` và chuyển tiếp sang ĐỢT 2: TIP-005 (Công nợ Nguyên tử, F08, F09, F10).
