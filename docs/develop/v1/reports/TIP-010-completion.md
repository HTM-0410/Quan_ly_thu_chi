# Báo Cáo Hoàn Thành TIP-010: Dashboard Insights, Chênh Lệch Thu-Chi, 6 Mục Mới Nhất & Xuất CSV An Toàn

## 1. Kết Quả Thực Thi
THỢ đã hoàn thành toàn bộ các yêu cầu kỹ thuật và tiêu chí nghiệm thu của TIP-010 (F21, F25, F27):

### AC-010-1 (F21 - Chênh Lệch Thu–Chi & Actionable Insights): ĐẠT
- Thẻ Chi tiêu tháng tại `DashboardPage.tsx`:
  - Nhãn đã được thay đổi từ "Còn lại: X ₫" sang **"Chênh lệch thu–chi: +X ₫ / -X ₫"**, chuẩn xác theo nguyên lý kế toán và dòng tiền cá nhân (tránh gây hiểu nhầm với số dư còn lại trong ví).
- Khối **"Cần chú ý"** (Actionable Insights) tự động xuất hiện trên Dashboard khi phát hiện các sự kiện tài chính quan trọng:
  1. *Ngân sách cảnh báo*: Quét các ngân sách đang hoạt động (`is_active`) có tỷ lệ chi tiêu >= 80% (cảnh báo vàng) hoặc >= 100% (vượt trần đỏ), cung cấp đường dẫn chuyển thẳng sang `/budgets`.
  2. *Giao dịch định kỳ đến hạn*: Quét các quy tắc định kỳ (`recurring_rules`) đang hoạt động đến ngày thực thi (`next_occurrence <= today`), hiển thị cảnh báo và đường dẫn chuyển sang `/recurring`.
  3. *Giao dịch chưa phân loại*: Quét các giao dịch chưa được gắn danh mục (`category_id IS NULL`), thông báo số lượng và cung cấp đường dẫn sang `/transactions` để phân loại ngay.
- Khối insights giới hạn tối đa 3 thẻ ưu tiên cao nhất, hiển thị trực quan và có đường dẫn hành động rõ ràng.

### AC-010-2 (F27 - Khớp Số Lượng Giao Dịch Gần Đây): ĐẠT
- Hàm `load()` tại `DashboardPage.tsx` đã điều chỉnh truy vấn: `listTransactions({ limit: 6 })` thay vì 8.
- Tiêu đề phụ của thẻ Giao dịch gần đây được cập nhật khớp chính xác với số lượng thẻ thực tế:
  `{recent.length > 0 ? `${Math.min(recent.length, 6)} mục mới nhất` : '6 mục mới nhất'}`.
- Danh sách giao dịch render đúng tối đa 6 mục thông qua `.slice(0, 6)`.

### AC-010-3 (F25 - Secure CSV Export with UTF-8 BOM): ĐẠT
- Tạo module `web/src/lib/exportCsv.ts`:
  - Hàm `sanitizeCsvCell`:
    - Bảo vệ chống tấn công Spreadsheet Formula Injection (CSV Injection): Tự động phát hiện và thêm tiền tố nháy đơn `'` cho các ô văn bản bắt đầu bằng một trong các ký tự nguy hiểm `=, +, -, @, \t, \r`.
    - Escape an toàn các ký tự nháy kép `"` thành `""` và bao bọc bằng cặp ngoặc kép khi chuỗi chứa dấu phẩy `,`, xuống dòng `\n`, `\r`.
  - Hàm `generateTransactionsCsv`:
    - Chèn tiền tố **UTF-8 Byte Order Mark (`\uFEFF`)** ở đầu file, đảm bảo Microsoft Excel và các phần mềm bảng tính mở file hiển thị đúng 100% tiếng Việt có dấu mà không bị lỗi font (Mojibake).
    - Xuất đầy đủ các cột dữ liệu: `Mã giao dịch`, `Thời gian`, `Loại giao dịch`, `Số tiền (VND)`, `Tài khoản`, `Danh mục`, `Đối tác / Người nhận`, `Ghi chú`, `Trạng thái`.
  - Hàm `downloadCsvFile`:
    - Tạo Blob `text/csv;charset=utf-8;` và kích hoạt tải xuống file `giao-dich-YYYYMMDD.csv` an toàn trên trình duyệt.
- Tích hợp tại `TransactionsPage.tsx`:
  - Thêm nút **"Xuất CSV"** trên header giao diện giao dịch.
  - Tải toàn bộ giao dịch thỏa mãn các bộ lọc đang chọn (loại giao dịch, tài khoản, danh mục, ngày, số tiền, tìm kiếm) lên đến 10.000 dòng và xuất file tức thì.

## 2. Kết Quả Kiểm Thử & Build
- `src/lib/exportCsv.test.ts`: 8/8 tests PASS (UTF-8 BOM, Formula injection, escape quotes & commas).
- `src/pages/DashboardPage.test.tsx`: 4/4 tests PASS (F21 Chênh lệch thu-chi, F27 6 mục mới nhất, Actionable Insights, F19 Onboarding banner).
- Toàn bộ test suite: 15 test files, 131/131 tests PASS (100% GREEN).
- `npm run typecheck`: 0 lỗi.
- `npm run build`: Production bundle thành công trong 12.07s.
