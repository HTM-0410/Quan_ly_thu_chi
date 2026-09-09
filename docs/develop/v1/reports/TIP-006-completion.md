# Báo Cáo Hoàn Thành TIP-006: OCR Ánh Xạ Hàng Ổn Định, Safe Retry, Chuẩn Đơn Vị & Bảo Mật Khóa

## 1. Kết Quả Thực Thi
THỢ đã hoàn thành toàn bộ các yêu cầu kỹ thuật và tiêu chí nghiệm thu của TIP-006 (F11, F12, F13, F14):

### AC-006-1 (F11 - Stable Row Mapping): ĐẠT
- Tái cấu trúc hàm `commitImport` trong `ReceiptImportModal.tsx`:
  - Mỗi hàng `PreviewRow` mang stable ID (`r.id`) và `client_generated_id`.
  - Khi mở rộng `splits` thành nhiều giao dịch con, mỗi giao dịch con liên kết chặt chẽ với `rowId` gốc thông qua cấu trúc `SubTx`.
  - Kết quả trả về từ `importOcrTransactions` được nhóm thành `rowStatusMap` (theo `rowId`).
  - Hóa đơn (`createBillWithItems`) và công nợ chia tiền (`createDebt`) chỉ được tạo khi giao dịch của dòng tương ứng thành công 100%. Nếu giao dịch thất bại, tuyệt đối không tạo bill/nợ mồ côi và không sử dụng ID của dòng khác.

### AC-006-2 (F12 - Safe Partial Retry): ĐẠT
- Khi batch import xảy ra lỗi một phần:
  - Modal KHÔNG tự đóng (`onClose` chỉ kích hoạt khi 100% dòng đã chọn thành công và không chờ scan bill).
  - Các dòng đã lưu thành công được loại bỏ khỏi `jobs.rows` để ngăn chặn hoàn toàn việc lưu trùng.
  - Các dòng thất bại được giữ lại trên bảng xem trước, gắn cờ lỗi chi tiết `import_error` từ RPC.
  - Bổ sung hiển thị `import_error` trực tiếp trên thẻ giao dịch và danh sách cảnh báo của `ReceiptPreviewTable.tsx`.
  - Nút hành động chính cập nhật thông minh: "Thử lại X dòng lỗi" cho phép người dùng sửa tài khoản/danh mục/số tiền rồi thử lại ngay.
  - Giao dịch nền được làm mới kịp thời qua `onSaved()`.

### AC-006-3 (F13 - Single Minor Unit Contract): ĐẠT
- `billOcrSchema.ts`: Xóa bỏ hoàn toàn các điều kiện tự nhân 100 theo ngưỡng phỏng đoán (`n < 100_000` và `n < 1_000_000`). Schema chỉ làm tròn số nguyên (`Math.round(n)`).
- `billOcr.ts`: Cập nhật toàn bộ các ví dụ JSON trong `BILL_SYSTEM_PROMPT` sang chuẩn minor unit (35.000đ → 3500000, 140.000đ → 14000000) để AI không bị mâu thuẫn chỉ thị.
- Fixture `bill.json` và suite kiểm thử `billOcr.test.ts` được cập nhật: 16/16 tests PASS, bảo vệ các giao dịch giá trị nhỏ (vd: 50.000 minor unit không bị phóng đại).

### AC-006-4 (F14 - Key Proxy & Transparency Disclosure): ĐẠT
- `web/_worker.js/index.js`: Bổ sung proxy router `/api/ocr` và `/api/bill-ocr` bảo vệ `GEMINI_API_KEY` ở server-side worker, không để lộ vào client JS bundle trong môi trường production.
- `ocr.ts` và `billOcr.ts`: Hỗ trợ linh hoạt gọi qua proxy `/api/ocr` hoặc direct key trong dev; ném lỗi `MissingOcrConfigError` chuẩn xác khi chưa cấu hình.
- `ReceiptImportModal.tsx`: Bổ sung banner thông báo minh bạch trong bước upload:
  > **Bảo vệ dữ liệu & quyền riêng tư:** Ảnh chỉ được gửi đến Google Gemini để trích xuất thông tin giao dịch khi bạn bấm nút "Phân tích". Hệ thống không lưu trữ ảnh gốc vĩnh viễn trên máy chủ. Bạn luôn có bước xem trước, chỉnh sửa thông tin trước khi quyết định lưu vào sổ.

## 2. Kết Quả Kiểm Thử & Build
- `npm run typecheck` (`tsc --noEmit`): 0 lỗi.
- `npm test`: 9 test files, 92/92 tests PASS (100% GREEN):
  - `src/components/ocr/ReceiptImportModal.test.tsx` (3 tests PASS - F11, F12, F14)
  - `src/lib/billOcr.test.ts` (16 tests PASS - F13)
  - `src/lib/ocrSchema.test.ts` (20 tests PASS)
  - Toàn bộ các suite khác: PASS.
- `npm run build`: Build thành công (1.45s).
