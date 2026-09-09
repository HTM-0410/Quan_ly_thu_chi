# Báo Cáo Hoàn Thành TIP-004

- **Mã TIP:** TIP-004
- **Mã V1:** V1-04 (Báo Cáo Toàn Diện Server-side & Đồng Bộ Bộ Lọc)
- **Mã Lỗi Khắc Phục:** F06, F20
- **Người thực hiện:** THỢ (Builder)
- **Thời gian hoàn thành:** 2026-09-07T16:03:00+07:00

---

## 1. Tóm tắt công việc đã thực hiện

### 1.1. Migration RPC Tổng Hợp Chi Tiêu Danh Mục Server-side
- Tạo file migration `Quan_ly_thu_chi/supabase/migrations/20260810000008_category_expenses_breakdown_rpc.sql` (Mục 27 trong `MIGRATION_MANIFEST.md`):
  - **F06 (Khắc phục giới hạn 500 dòng):** Tạo RPC `get_category_expenses_breakdown(p_start_date, p_end_date, p_timezone)` thực hiện gom nhóm và tính tổng chi tiêu trực tiếp tại database. Không phụ thuộc vào số lượng giao dịch, không bị cắt cụt.
  - **Hỗ trợ Chưa phân loại & Khác:** Phân loại rõ các giao dịch chưa gắn danh mục thành `__uncategorized__` ("Chưa phân loại"). Hỗ trợ cả danh mục người dùng và danh mục dùng chung `global_categories`.
  - **Loại trừ nợ (D02, D03):** Lọc trạng thái `posted`, loại `expense`, và loại trừ các giao dịch mang cờ vốn nợ `is_debt_principal: true`.
  - **Múi giờ chính xác (F01):** Quy đổi ranh giới ngày `00:00:00` đến `23:59:59.999` theo timezone IANA của người dùng.

### 1.2. Mở rộng API Layer & Types
- Cập nhật `web/src/lib/database.types.ts`: Bổ sung kiểu cho RPC `get_category_expenses_breakdown`.
- Cập nhật `web/src/lib/api.ts`:
  - Thêm hàm `getCategoryExpensesBreakdown`: gọi RPC `get_category_expenses_breakdown` và cung cấp fallback client-side an toàn nếu chạy trong môi trường offline/mock.

### 1.3. Nâng cấp Giao diện Báo Cáo (`ReportsPage.tsx`)
- **Đồng bộ bộ lọc thời gian toàn trang (F20):**
  - Biểu đồ tròn (Pie Chart) sử dụng đúng khoảng thời gian của bộ lọc (`range.start` đến `range.end`), đồng bộ 100% với Thẻ KPI (Thu nhập / Chi tiêu) và Biểu đồ xu hướng (Bar Chart).
  - Chuẩn hóa nhãn preset: "Tháng này", "12 tháng gần nhất", "4 quý gần nhất", "5 năm gần nhất", "Tùy chỉnh".
  - Hiển thị khoảng ngày hiệu lực rõ ràng: `Hiệu lực: DD/MM/YYYY — DD/MM/YYYY`.
  - Tự động điều chỉnh mốc tháng xem Heatmap nếu tháng xem hiện tại nằm ngoài khoảng thời gian được chọn.
- **Phân bổ tỷ trọng & Gom nhóm thông minh (F06):**
  - Hiển thị Top 7 danh mục lớn nhất.
  - Hiển thị nhóm "Chưa phân loại" riêng biệt nếu có khoản chi chưa gắn danh mục.
  - Gom toàn bộ các danh mục nhỏ còn lại vào nhóm "Khác" (`__other__`). Tổng tỷ trọng của tất cả các phần luôn đạt đúng 100% chi tiêu.
  - Thêm bảng danh sách chi tiết danh mục (tên, màu, số giao dịch, số tiền VND, phần trăm %).
- **Modal Drilldown chi tiết giao dịch:**
  - Nhấp vào một lát cắt trên Pie Chart hoặc một dòng trong bảng mở Modal hiển thị toàn bộ giao dịch thuộc danh mục đó trong khoảng thời gian đã chọn.
  - Hỗ trợ lọc chính xác cho cả danh mục thông thường, danh mục Chưa phân loại và danh mục Khác.

---

## 2. Bằng chứng kiểm thử tự động

### 2.1. Vitest Suite
- Thêm file test `src/pages/ReportsPage.test.tsx` (5 test cases):
  - Kiểm tra render chuẩn các nhãn preset và khoảng ngày hiệu lực.
  - Kiểm tra đồng bộ thời gian giữa KPI, BarChart và PieChart.
  - Kiểm tra nhóm Chưa phân loại và nhóm Khác trong bảng phân bổ.
  - Kiểm tra chuyển đổi preset thời gian cập nhật tiêu đề biểu đồ và dữ liệu.
  - Kiểm tra click vào danh mục mở drilldown modal hiển thị đúng giao dịch.
- Kết quả chạy `npm test`:
  - **8 test files passed**, **89/89 tests passed** 100%.

### 2.2. Typecheck
- Kết quả chạy `npm run typecheck` (`tsc --noEmit`):
  - **0 errors**, hoàn toàn sạch lỗi kiểu dữ liệu.
