# Biên Bản Nghiệm Thu TIP-004

- **Mã TIP:** TIP-004
- **Mã V1:** V1-04 (Báo Cáo Toàn Diện Server-side & Đồng Bộ Bộ Lọc)
- **Mã Lỗi Khắc Phục:** F06, F20
- **Người thẩm định:** THẦU (Contractor)
- **Thời gian nghiệm thu:** 2026-09-07T16:04:00+07:00
- **Kết quả:** **ACCEPTED**

---

## 1. Kiểm tra Tiêu chí Nghiệm thu (Acceptance Criteria)

| Mã AC | Tiêu chí | Kết quả | Ghi chú thẩm tra |
|---|---|---|---|
| **AC-04.1** | Biểu đồ tròn (Pie Chart) và thẻ KPI cùng dùng chung khoảng thời gian đã chọn (`range.start` đến `range.end`), không bị lệch về tháng hiện tại khi xem Quý hay Năm (F20). | **PASS** | `ReportsPage.tsx` đã xóa bỏ việc query cố định theo tháng hiện tại; Pie Chart và breakdown dùng chung `range.start` và `range.end` với KPI và BarChart. |
| **AC-04.2** | Các khoản chi tiêu chưa gắn danh mục hiển thị rõ ràng dưới mục "Chưa phân loại", không bị âm thầm loại bỏ khỏi tỷ trọng (F06). | **PASS** | RPC `get_category_expenses_breakdown` và giao diện tổng hợp gom `category_id IS NULL` thành mục `Chưa phân loại` (`__uncategorized__`) với màu xám chuẩn mực và tính đầy đủ số tiền. |
| **AC-04.3** | Các danh mục ngoài Top 7 được gom vào mục "Khác", tổng tỷ trọng của tất cả các phần luôn đạt đúng 100% tổng chi tiêu (F06). | **PASS** | Danh mục sau Top 7 được gộp thành mục "Khác" (`__other__`), tổng phần trăm và số tiền chi tiêu khớp 100% với thẻ KPI Chi tiêu. |
| **AC-04.4** | Nhãn các preset thời gian rõ nghĩa ("12 tháng gần nhất", "4 quý gần nhất", "5 năm gần nhất") và hiển thị khoảng ngày hiệu lực (F20). | **PASS** | `PRESET_LABELS` đã cập nhật chuẩn xác; thanh banner ngày hiệu lực `Hiệu lực: DD/MM/YYYY – DD/MM/YYYY` hiển thị ngay cạnh bộ chọn preset. |
| **AC-04.5** | 100% tests pass offline, `tsc --noEmit` 0 lỗi. | **PASS** | 8/8 test files pass (89/89 tests), `tsc --noEmit` 0 errors. |

---

## 2. Bằng chứng kiểm thử độc lập
- **Vitest Suite:** 8/8 test files pass, 89/89 tests pass (100% offline).
- **Typecheck:** `tsc --noEmit` hoàn thành với 0 lỗi.
- **Tuân thủ D09:** Không ghi dữ liệu remote, kiểm thử hoàn toàn độc lập và an toàn.

---

## 3. Quyết định
THẦU chính thức nghiệm thu đạt TIP-004 (**ACCEPTED**). Cập nhật `CHECKPOINT.md` và tiếp tục chuyển tiếp sang ĐỢT 3: TIP-006 (OCR Ổn Định & Toàn Vẹn: F11–F14).
