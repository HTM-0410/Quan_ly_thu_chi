# Báo Cáo Nghiệm Thu TIP-006: OCR Ánh Xạ Hàng Ổn Định, Safe Retry, Chuẩn Đơn Vị & Bảo Mật Khóa

## 1. Thông Tin Nghiệm Thu
- **TIP:** TIP-006 (V1-06 / F11, F12, F13, F14: OCR Ổn Định & Toàn Vẹn).
- **Vai trò:** THẦU (Contractor).
- **Ngày kiểm định:** 2026-09-07.
- **Trạng thái:** **ACCEPTED (CHẤP THUẬN NGHIỆM THU)**.

---

## 2. Đối Chiếu Tiêu Chí Nghiệm Thu (Acceptance Criteria)

| Tiêu Chí | Yêu Cầu | Kết Quả Thẩm Định | Đánh Giá |
| :--- | :--- | :--- | :--- |
| **AC-006-1** | **F11 — Stable Row Mapping:** Ánh xạ ổn định `rowId -> SubTx -> results`. Hóa đơn (`createBillWithItems`) và nợ (`createDebt`) chỉ được tạo khi giao dịch tương ứng thành công 100%, không dùng offset nén mảng sai lệch. | ĐÃ ĐẠT: `commitImport` loại bỏ hoàn toàn `flatTxIds[offset]`, nhóm kết quả theo `rowStatusMap` dùng `rowId`. Bill và nợ liên kết chuẩn xác vào ID giao dịch tương ứng; giao dịch thất bại tuyệt đối không tạo bill/nợ mồ côi. | **PASS** |
| **AC-006-2** | **F12 — Safe Partial Retry:** Khi lưu thất bại một phần, modal không tự đóng. Lọc bỏ dòng thành công (tránh nhập trùng), giữ lại dòng lỗi kèm `import_error` từ RPC. Nút "Thử lại X dòng lỗi" cho phép sửa và retry. Có idempotency key `client_generated_id`. | ĐÃ ĐẠT: Khi có dòng lỗi, modal ở lại bước `preview`; `jobs.rows` chỉ giữ các dòng thất bại; hiển thị lỗi trực tiếp trên thẻ; `onSaved()` kích hoạt đồng bộ nền. | **PASS** |
| **AC-006-3** | **F13 — Single Minor Unit Contract:** Xóa bỏ logic tự đoán `* 100` theo ngưỡng phỏng đoán (`n < 100_000`, `n < 1_000_000`). Schema và prompt thống nhất một đơn vị duy nhất (minor unit). | ĐÃ ĐẠT: `billOcrSchema.ts` chỉ thực hiện `Math.round(n)`. `BILL_SYSTEM_PROMPT` chuẩn hóa ví dụ JSON số tiền minor. Fixture `bill.json` và `billOcr.test.ts` đạt 16/16 tests PASS. | **PASS** |
| **AC-006-4** | **F14 — Key Proxy & Transparency:** Proxy router `/api/ocr` và `/api/bill-ocr` trong `_worker.js/index.js` bảo vệ `GEMINI_API_KEY` ở server-side; client có fallback thông minh; banner minh bạch quyền riêng tư hiển thị trước khi tải ảnh. | ĐÃ ĐẠT: Worker proxy endpoint đã tạo; `ocr.ts` / `billOcr.ts` hỗ trợ gọi proxy; banner "Bảo vệ dữ liệu & quyền riêng tư" hiển thị rõ ràng tại bước tải ảnh. | **PASS** |

---

## 3. Bằng Chứng Tự Động Hóa
- `tsc --noEmit` & `npm run build`: PASS 100%, không lỗi linter/compiler.
- Vitest: 10 test files, 92/92 tests PASS (100% offline).
  - `src/components/ocr/ReceiptImportModal.test.tsx` (3 tests PASS)
  - `src/lib/billOcr.test.ts` (16 tests PASS)
  - `src/lib/ocrSchema.test.ts` (20 tests PASS)
  - Toàn bộ suite tests ứng dụng hoạt động ổn định.

---

## 4. Kết Luận & Chuyển Tiếp
THẦU chính thức nghiệm thu đạt TIP-006 (**ACCEPTED**).
Cập nhật `CHECKPOINT.md` và `REQUIREMENTS_MATRIX.md`.
Tiếp tục chuyển tiếp sang TIP tiếp theo trong Đợt 3: **TIP-007 (V1-07 / F15: Lịch Định Kỳ & Chống Sinh Trùng Lặp)**.
