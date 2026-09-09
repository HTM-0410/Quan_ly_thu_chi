# Biên Bản Nghiệm Thu TIP-001

- **Mã TIP:** TIP-001
- **Mã V1:** V1-01 (Toán Học Thu Chi Cốt Lõi, Timezone & Hiển Thị Đơn Vị)
- **Mã Lỗi Khắc Phục:** F01, F02, F07, F23
- **Người thẩm định:** THẦU (Contractor)
- **Thời gian nghiệm thu:** 2026-09-07T15:33:30+07:00
- **Kết quả:** **ACCEPTED**

---

## 1. Kiểm tra Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã AC | Tiêu chí | Kết quả | Ghi chú thẩm tra |
|---|---|---|---|
| **AC-01.1** | Quẹt thẻ tín dụng nợ (-10tr) làm Net Worth giảm đúng 10tr; không còn hiện tượng tăng kép | **PASS** | Đã kiểm tra migration `20260810000004`: `calculate_net_worth` cộng trực tiếp signed balance `v_net_worth + calculate_account_balance(fa.id)`, loại bỏ dấu âm kép. |
| **AC-01.2** | RPC `get_transactions_summary` nhận `p_timezone`, tính trọn vẹn từ 00:00:00 ngày đầu tháng đến 23:59:59 ngày cuối tháng theo giờ địa phương user; loại trừ `status = 'voided'` | **PASS** | Migration `20260810000004` đã dùng `timestamp AT TIME ZONE p_timezone` và `status = 'posted'`. `api.ts` và `DashboardPage.tsx` đã truyền `timezone`. |
| **AC-01.3** | `DashboardPage.tsx` dùng `toLocalDateString` sinh YYYY-MM-DD local, không bị cắt cụt/lệch ngày cuối tháng về UTC | **PASS** | Code đã thay thế hoàn toàn `.toISOString().slice(0, 10)` bằng `toLocalDateString`. Đã có unit test kiểm tra ranh giới 01/09 và 30/09. |
| **AC-01.4** | Y-axis của Biểu đồ Thu / Chi tại `ReportsPage.tsx` dùng `compactVNDMinor`, khớp 100% với đơn vị thực tế; chú thích rõ ràng; `SettingsPage.tsx` khóa tiền tệ VND kèm giải thích | **PASS** | Y-axis dùng `compactVNDMinor`, chú thích khớp đơn vị. Settings khóa currency về VND và hiển thị hint. |

---

## 2. Bằng chứng kiểm thử độc lập
- **Vitest:** 5/5 test files pass, 74/74 tests pass.
- **Typecheck:** `tsc --noEmit` hoàn thành với 0 lỗi.
- **Không có vi phạm D09:** Không can thiệp DB remote, không phát sinh chi phí.

---

## 3. Quyết định
THẦU chính thức nghiệm thu đạt TIP-001 (**ACCEPTED**). Cập nhật `CHECKPOINT.md` và chuyển sang TIP-002 (Wave 1: V1-02 / F05).
