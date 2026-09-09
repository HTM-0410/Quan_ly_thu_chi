# Biên Bản Nghiệm Thu TIP-003

- **Mã TIP:** TIP-003
- **Mã V1:** V1-03 (Ngân sách Đúng & Quản lý Được Vòng Đời)
- **Mã Lỗi Khắc Phục:** F03, F04, F17
- **Người thẩm định:** THẦU (Contractor)
- **Thời gian nghiệm thu:** 2026-09-07T15:58:00+07:00
- **Kết quả:** **ACCEPTED**

---

## 1. Kiểm tra Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã AC | Tiêu chí | Kết quả | Ghi chú thẩm tra |
|---|---|---|---|
| **AC-03.1** | Chọn danh mục cha tự động tính chi tiêu của cả danh mục con mà không tính trùng lặp (F03). | **PASS** | Migration `20260810000007_budget_tree_and_lifecycle.sql` triển khai CTE đệ quy `WITH RECURSIVE target_categories` gộp tập hợp `UNION`, bảo đảm không bao giờ tính trùng kể cả khi cả cha và con đều được chọn. |
| **AC-03.2** | Hỗ trợ phạm vi "Toàn bộ chi tiêu" (All categories) (F04). Ngân sách cũ không có danh mục được hiển thị đúng với nhãn "Toàn bộ chi tiêu". | **PASS** | `BudgetsPage.tsx` có radio chọn "Toàn bộ chi tiêu"; thẻ hiển thị badge "Toàn bộ chi tiêu" màu xanh dương rõ ràng. |
| **AC-03.3** | Loại trừ các khoản gốc nợ (`is_debt_principal = true`) khỏi chi tiêu ngân sách. | **PASS** | RPC `get_budget_progress` bổ sung điều kiện `(t.metadata->>'is_debt_principal' IS NULL OR t.metadata->>'is_debt_principal' != 'true')`. |
| **AC-03.4** | Đầy đủ thao tác Sửa, Tạm dừng/Tiếp tục, Xóa ngân sách. Tab phân loại Đang chạy / Tạm dừng hoạt động mượt mà (F17). | **PASS** | Các nút Sửa, Tạm dừng/Tiếp tục, Xóa đã có trên mỗi thẻ; Modal hỗ trợ chỉnh sửa và xóa an toàn; các tab Đang chạy / Đã tạm dừng / Tất cả lọc đúng dữ liệu. |
| **AC-03.5** | Hiển thị phần trăm thực tế (kể cả vượt >150%). Thẻ lỗi hiển thị thông báo lỗi và nút thử lại, không tự gán bằng 0 (F17). | **PASS** | Bỏ hàm `Math.min(150, ...)`, giữ nguyên `realPct` hiển thị đến người dùng; `cardErrors` lưu trữ lỗi riêng cho từng thẻ kèm nút Thử lại. |
| **AC-03.6** | 100% tests pass offline, `tsc --noEmit` 0 lỗi. | **PASS** | 7/7 test files pass (84/84 tests), `tsc --noEmit` 0 errors. |

---

## 2. Bằng chứng kiểm thử độc lập
- **Vitest Suite:** 7/7 test files pass, 84/84 tests pass (100% offline).
- **Typecheck:** `tsc --noEmit` hoàn thành với 0 lỗi.
- **Tuân thủ D09:** Không ghi dữ liệu remote, kiểm thử hoàn toàn độc lập và an toàn.

---

## 3. Quyết định
THẦU chính thức nghiệm thu đạt TIP-003 (**ACCEPTED**). Cập nhật `CHECKPOINT.md` và tiếp tục chuyển tiếp sang ĐỢT 2: TIP-004 (Báo Cáo Toàn Diện Server-side & Đồng Bộ Bộ Lọc - F06, F20).
