# Báo Cáo Hoàn Thành TIP-001

- **Mã TIP:** TIP-001
- **Mã V1:** V1-01 (Toán Học Thu Chi Cốt Lõi, Timezone & Hiển Thị Đơn Vị)
- **Mã Lỗi Khắc Phục:** F01, F02, F07, F23
- **Người thực hiện:** THỢ (Builder)
- **Thời gian hoàn thành:** 2026-09-07T15:33:00+07:00

---

## 1. Tóm tắt công việc đã thực hiện

### 1.1. Sửa Lỗi F02 (Credit Card Balance Inversion trong Net Worth)
- Tạo migration `20260810000004_fix_net_worth_and_tz_summary.sql`:
  - Trong hàm `calculate_net_worth(p_user_id)`:
    - Loại bỏ dấu âm kép `-calculate_account_balance(fa.id)` với tài khoản `credit_card`.
    - Dư nợ thẻ tín dụng bản chất là số âm (nợ phải trả). Khi tính Net Worth (Tài sản ròng = Tài sản có + Tài sản nợ), ta cộng đại số trực tiếp `v_net_worth := v_net_worth + calculate_account_balance(fa.id);`.
    - Kết quả: Khi quẹt thẻ tín dụng nợ 10tr (-10tr), Net Worth giảm 10tr thay vì tăng 10tr như trước.

### 1.2. Sửa Lỗi F01 (Timezone Boundary Drop trong get_transactions_summary & Dashboard)
- Trong migration `20260810000004_fix_net_worth_and_tz_summary.sql`:
  - Thêm tham số `p_timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh'` vào RPC `get_transactions_summary`.
  - Cắt mốc thời gian theo timezone địa phương của user:
    - `v_start_ts := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE p_timezone;`
    - `v_end_ts := (p_end_date || ' 23:59:59.999999')::timestamp AT TIME ZONE p_timezone;`
  - Thêm điều kiện `status = 'posted'` (loại trừ `voided`).
- Trong `web/src/lib/api.ts`:
  - Cập nhật hàm `getTransactionsSummary` nhận `timezone?: string` và truyền `p_timezone` vào RPC.
- Trong `web/src/pages/DashboardPage.tsx`:
  - Dùng `toLocalDateString` để sinh chuỗi YYYY-MM-DD theo local calendar thay vì `toISOString().slice(0, 10)` làm lệch ngày cuối tháng về UTC.
  - Lấy `timezone` từ user profile truyền vào `getTransactionsSummary`.

### 1.3. Sửa Lỗi F07 (Lệch Đơn Vị Trục Y Biểu Đồ Thu/Chi & Chú Thích)
- Trong `web/src/pages/ReportsPage.tsx`:
  - Cập nhật Y-axis `tickFormatter` dùng hàm `compactVNDMinor` chuẩn (hiển thị 1tr, 2tr, 10tr... hoặc k, tỷ).
  - Cập nhật chú thích biểu đồ: "Trục Y hiển thị số tiền thu / chi theo VND (đơn vị rút gọn: k = nghìn, tr = triệu, tỷ = tỷ ₫)."

### 1.4. Sửa Lỗi F23 (Currency Mismatch)
- Trong `web/src/pages/SettingsPage.tsx`:
  - Khóa ô chọn Tiền tệ về `VND` (`disabled`, kèm `hint="Phiên bản v1 hiện chỉ hỗ trợ hạch toán VND."`).

---

## 2. Bằng chứng kiểm thử tự động

### 2.1. Vitest Suite
- Đã thêm 2 test cases trong `src/lib/daily.test.ts`:
  - `formats local date components without UTC day-shift anomaly` (kiểm tra 01/09 và 30/09)
  - `computes monthRangeInTz for Asia/Ho_Chi_Minh correctly (covers full local month)`
- Kết quả chạy `npm test`:
  - **5 test files passed** (74/74 tests pass, 100% offline)
  - `src/lib/daily.test.ts`: 19 tests PASS
  - `src/components/PaymentModal.test.tsx`: 9 tests PASS
  - `src/lib/billOcr.test.ts`: 16 tests PASS
  - `src/lib/ocrSchema.test.ts`: 20 tests PASS
  - `src/lib/format.test.ts`: 10 tests PASS

### 2.2. Typecheck
- Chạy `npm run typecheck` (`tsc --noEmit`):
  - **0 errors**, compile thành công 100%.

---

## 3. Danh sách file thay đổi
1. `Quan_ly_thu_chi/supabase/migrations/20260810000004_fix_net_worth_and_tz_summary.sql` (NEW)
2. `Quan_ly_thu_chi/web/src/lib/api.ts` (MODIFIED)
3. `Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx` (MODIFIED)
4. `Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx` (MODIFIED)
5. `Quan_ly_thu_chi/web/src/pages/SettingsPage.tsx` (MODIFIED)
6. `Quan_ly_thu_chi/web/src/lib/daily.test.ts` (MODIFIED)

THỢ bàn giao kết quả cho THẦU nghiệm thu.
