# Báo Cáo Hoàn Thành TIP-003

- **Mã TIP:** TIP-003
- **Mã V1:** V1-03 (Ngân sách Đúng & Quản lý Được Vòng Đời)
- **Mã Lỗi Khắc Phục:** F03, F04, F17
- **Người thực hiện:** THỢ (Builder)
- **Thời gian hoàn thành:** 2026-09-07T15:57:00+07:00

---

## 1. Tóm tắt công việc đã thực hiện

### 1.1. Migration Cây Danh mục & Vòng đời Ngân sách
- Tạo file migration `Quan_ly_thu_chi/supabase/migrations/20260810000007_budget_tree_and_lifecycle.sql` (Mục 26 trong `MIGRATION_MANIFEST.md`):
  - **F03 (Cây danh mục):** Cập nhật RPC `get_budget_progress` sử dụng CTE đệ quy `WITH RECURSIVE target_categories`. Khi chọn danh mục cha, toàn bộ danh mục con cháu tự động được gộp tính chi tiêu mà không bao giờ bị tính trùng (nhờ phép toán tập hợp `UNION`).
  - **F04 (Toàn bộ chi tiêu):** Khi ngân sách không gán danh mục cụ thể (`v_has_categories = false`), hệ thống tự động tổng hợp chi tiêu toàn bộ danh mục (`type = 'expense'`).
  - **Loại trừ nợ (D02, D03):** Bổ sung điều kiện loại trừ các giao dịch mang cờ `is_debt_principal: true` khỏi chi tiêu ngân sách.
  - **F17 (Vòng đời ngân sách):** Bổ sung các RPC:
    - `create_budget_with_categories`: Tạo ngân sách và liên kết danh mục nguyên tử.
    - `update_budget`: Cập nhật thông tin ngân sách và đồng bộ lại quan hệ `budget_categories`.
    - `toggle_budget_active`: Bật/tắt trạng thái hoạt động (`is_active`).
    - `delete_budget`: Xóa ngân sách và cascade xóa liên kết.

### 1.2. Mở rộng Domain Model & API Layer
- Cập nhật `web/src/lib/domain.ts`:
  - Thêm thuộc tính `category_ids?: string[]` vào type `Budget`.
- Cập nhật `web/src/lib/database.types.ts`:
  - Định nghĩa đầy đủ chữ ký kiểu cho các RPC: `create_budget_with_categories`, `update_budget`, `toggle_budget_active`, `delete_budget`.
- Cập nhật `web/src/lib/api.ts`:
  - `listBudgets(options)`: Nhận diện và parse `category_ids` từ bảng quan hệ `budget_categories(category_id)`. Hỗ trợ tùy chọn `includeInactive: true` để lấy cả ngân sách đã tạm dừng.
  - `createBudget`: Hỗ trợ lưu danh sách `category_ids`.
  - `updateBudget`: Hỗ trợ chỉnh sửa thông tin và cập nhật lại danh mục.
  - `toggleBudgetActive`: Cập nhật cờ `is_active`.
  - `deleteBudget`: Xóa ngân sách khỏi hệ thống.

### 1.3. Nâng cấp Giao diện Ngân Sách (`BudgetsPage.tsx`)
- **Phạm vi chi tiêu (F03, F04):**
  - Trong Modal Tạo/Sửa: Cung cấp tùy chọn rõ ràng giữa "Toàn bộ chi tiêu (All categories)" và "Chọn danh mục cụ thể".
  - Hiển thị danh mục theo phân cấp cha - con với hướng dẫn trực quan. Khi tích danh mục cha, tự động đánh dấu bao gồm toàn bộ danh mục con.
  - Trên thẻ ngân sách: Gắn badge "Toàn bộ chi tiêu" hoặc tên danh mục cụ thể (kèm số lượng danh mục con nếu có). Các ngân sách cũ không có danh mục được hiển thị minh bạch "Toàn bộ chi tiêu".
- **Không chặn trần phần trăm (F17):**
  - Hiển thị phần trăm thực tế (ví dụ: `130% đã dùng`, `320% đã dùng`).
  - Thanh tiến độ hiển thị trực quan (tối đa 100% visual width) với dải màu cảnh báo đỏ khi vượt quá 100%.
  - Hiển thị rõ số tiền "Còn lại" hoặc "Vượt ngân sách: +X đ".
- **Tabs lọc trạng thái & Thao tác vòng đời (F17):**
  - Thêm 3 tab: "Đang chạy" (kèm số lượng), "Đã tạm dừng" (kèm số lượng), "Tất cả".
  - Bổ sung nút thao tác trực tiếp trên từng thẻ: Tạm dừng/Kích hoạt lại (Pause/Resume), Sửa (Edit), Xóa (Delete).
- **Xử lý lỗi tải tiến độ độc lập:**
  - Nếu một thẻ bị lỗi RPC `get_budget_progress`, giao diện hiển thị cảnh báo lỗi và nút "Thử lại" riêng cho thẻ đó, không âm thầm nuốt lỗi thành 0.

---

## 2. Bằng chứng kiểm thử tự động

### 2.1. Vitest Suite
- Thêm file test `src/pages/BudgetsPage.test.tsx` (6 test cases):
  - Kiểm tra hiển thị badge Toàn bộ chi tiêu vs Danh mục cụ thể.
  - Kiểm tra tính toán và hiển thị phần trăm vượt trần (>100%, không bị cap ở 150%).
  - Kiểm tra lọc danh sách qua các tab Đang chạy / Đã tạm dừng / Tất cả.
  - Kiểm tra xử lý lỗi riêng cho từng thẻ và nút thử lại khi RPC lỗi.
  - Kiểm tra luồng tạm dừng / kích hoạt lại ngân sách (`toggle active`).
  - Kiểm tra tạo ngân sách mới với phạm vi Toàn bộ chi tiêu (`category_ids: []`).
- Kết quả chạy `npm test`:
  - **7 test files passed**, **84/84 tests passed** 100%.

### 2.2. Typecheck
- Kết quả chạy `npm run typecheck` (`tsc --noEmit`):
  - **0 errors**, hoàn toàn sạch lỗi kiểu dữ liệu.
