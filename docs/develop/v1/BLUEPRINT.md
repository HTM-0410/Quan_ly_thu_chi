# BLUEPRINT v1 — Quản lý thu chi (VibeCode Kit v6.1)
Ngày thiết kế: 07/09/2026
Kiến trúc sư: THẦU (Contractor)
Phiên bản: 1.0 — Chờ phê duyệt một lần từ Chủ nhà (Homeowner)

---

## 1. PROJECT INFO & VISION

- **Tên dự án:** Quản lý thu chi cá nhân & Gia đình
- **Mục tiêu cốt lõi:** Biến ứng dụng thành một cuốn sổ thu chi trung thực, đáng tin cậy tuyệt đối về mặt số liệu tài chính; thao tác ghi nhanh tiện lợi và bảo vệ toàn vẹn dữ liệu người dùng khi có sự cố mạng.
- **Phạm vi phiên bản v1:** Giải quyết dứt điểm toàn bộ các vấn đề P0 và P1 (F01–F24, F26); chuyển các tính năng P2 (F25, F27) vào backlog.

```
                    KIẾN TRÚC TỔNG THỂ DÒNG DỮ LIỆU
  ┌─────────────────────────────────────────────────────────────────┐
  │                 GIAO DIỆN NGƯỜI DÙNG (REACT SPA)                │
  │  Dashboard  │  Transactions  │  Budgets  │  Debts  │  Reports   │
  │        ▲               ▲            ▲         ▲          ▲      │
  └────────┼───────────────┼────────────┼─────────┼──────────┼──────┘
           │               │            │         │          │
  ┌────────┴───────────────┴────────────┴─────────┴──────────┴──────┐
  │              TẦNG XỬ LÝ NGHIỆP VỤ (CLIENT LIB)                  │
  │  - format.ts (VND minor)        - daily.ts (UTC+7 ranges)       │
  │  - api.ts (RPC wrappers)        - exportCsv.ts (Safe sanitizer) │
  │  - ocr.ts / billOcr.ts (Normalized schemas & Row Mapping)       │
  └────────────────────────────────┬────────────────────────────────┘
                                   │
  ┌────────────────────────────────▼────────────────────────────────┐
  │                    SUPABASE BACKEND (DB & RPC)                  │
  │  - Sổ cái kép: transactions & transaction_entries               │
  │  - RPC nguyên tử: settle_debt_payment, record_split_share       │
  │  - RPC tính toán: calculate_net_worth, get_budget_progress      │
  │  - RPC phân trang: list_transactions_paginated                  │
  │  - Scheduler: materialize_recurring_rules (day_of_month aware)  │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 2. CÁC HỢP ĐỒNG KỸ THUẬT VÀ NGHIỆP VỤ (CONTRACTS)

### 2.1. Hợp đồng Tiền tệ, Múi giờ và Trạng thái
1. **Tiền tệ:** 100 minor unit = 1 VND. Toàn bộ tính toán và lưu trữ backend là số nguyên `BIGINT`. Không làm tròn số thập phân trôi nổi. Frontend nhập VND và quy đổi duy nhất tại biên giao tiếp.
2. **Múi giờ & Khoảng ngày:**
   - Sử dụng helper chuẩn hoá: `getTzMonthRange(date, timezone)` và `getTzCustomRange(start, end, timezone)`.
   - Kết quả trả về cặp `[startUtc, endUtcExclusive)` dạng ISO string.
   - Khi truy vấn SQL, khoảng thời gian luôn là `occurred_at >= startUtc AND occurred_at < endUtcExclusive`.
   - Ngày kết thúc trên UI luôn mang ngữ nghĩa "bao gồm cả ngày" (23:59:59.999 giờ địa phương).
3. **Trạng thái ghi sổ (Transaction Status):**
   - Chỉ các giao dịch `status = 'posted'` mới ảnh hưởng đến số dư tài khoản và các chỉ số báo cáo thu/chi.
   - Giao dịch `status = 'voided'` được bảo toàn trong cơ sở dữ liệu để tra cứu và kiểm toán, hỗ trợ bộ lọc riêng trên giao diện.
   - Lỗi mạng hoặc lỗi RPC phải trả trạng thái lỗi rõ ràng, tuyệt đối không quy đổi lỗi thành số `0`.

### 2.2. Hợp đồng Tài khoản & Tài sản ròng
1. **Quy ước Số dư có dấu:**
   - Tài sản (tiền mặt, tài khoản ngân hàng, ví điện tử, tiết kiệm): Số dư thông thường là số dương.
   - Thẻ tín dụng (`credit_card`): Số dư mang dấu âm khi đang nợ tiền ngân hàng.
2. **Tính toán Tài sản ròng (`calculate_net_worth`):**
   ```sql
   -- Sửa đổi logic F02: Áp dụng phép cộng đại số trực tiếp cho mọi loại tài khoản
   SELECT COALESCE(SUM(calculate_account_balance(fa.id)), 0)
   INTO v_total
   FROM financial_accounts fa
   WHERE fa.user_id = p_user_id
     AND fa.include_in_net_worth = TRUE
     AND fa.is_archived = FALSE;
   ```
   *Chứng minh:* Thẻ tín dụng có số dư -1.000.000 minor → Cộng vào tài sản ròng sẽ làm giảm 1.000.000 minor (đúng bản chất nợ).
3. **Vòng đời tài khoản:**
   - Tách biệt `is_hidden` (ẩn khỏi danh sách chọn nhanh) và `is_archived` (đóng tài khoản/loại trừ khỏi tổng tài sản).
   - Khi đóng tài khoản còn số dư, hiển thị cảnh báo và yêu cầu chuyển số dư trước khi đóng.
   - Cung cấp màn hình "Tài khoản đã lưu trữ" với nút "Khôi phục".

### 2.3. Hợp đồng Công nợ & Thanh toán nguyên tử
1. **Phân định nghiệp vụ nợ:**
   - **Khai báo nợ có sẵn:** Tạo bản ghi trong `debts` (`initial_balance`), không tạo giao dịch trong `transactions` (không tạo dòng tiền giả).
   - **Vay / Cho vay mới:** Tạo bản ghi `debts` đồng thời tạo giao dịch `transactions` với `transaction_entries` tương ứng trong cùng một transaction DB.
2. **Nguyên tắc Thu chi và Dòng tiền:**
   - Thu hồi nợ cho vay (`lend repayment`): Tạo dòng tiền vào tài khoản (+ cashflow) nhưng KHÔNG tạo `income` tiêu dùng.
   - Trả nợ đi vay (`borrow repayment`): Tạo dòng tiền ra khỏi tài khoản (- cashflow) nhưng KHÔNG tạo `expense` tiêu dùng.
   - Báo cáo tài chính phân tách rõ "Chi tiêu tiêu dùng" và "Dòng tiền công nợ".
3. **RPC Thanh toán Nguyên tử (`settle_debt_payment`):**
   - Nhận: `p_debt_id`, `p_account_id`, `p_amount_minor`, `p_payment_date`, `p_idempotency_key`.
   - Khóa bản ghi nợ bằng `SELECT ... FOR UPDATE` để chống race condition.
   - Kiểm tra: `p_amount_minor <= remaining_amount` (chặn trả vượt).
   - Ghi bản ghi `debt_payments`, cập nhật `remaining_amount`, tạo `transactions` và `transaction_entries` liên kết.
   - Trả về kết quả hoàn chỉnh; nếu có bất kỳ lỗi nào, toàn bộ nghiệp vụ rollback tự động.
   - Hỗ trợ chung giao diện thanh toán (chọn tài khoản, trả 1 phần, trả toàn bộ) cho cả 2 chiều `lend` và `borrow`.

### 2.4. Hợp đồng Ngân sách, Mục tiêu và Định kỳ
1. **Ngân sách:**
   - Cho phép chọn: "Toàn bộ chi tiêu" hoặc danh mục cụ thể (hỗ trợ chọn danh mục cha tự động mở rộng sang tất cả danh mục con mà không cộng trùng).
   - Giao diện có đầy đủ: Sửa ngân sách, Tạm dừng/Kích hoạt, Lưu trữ.
   - Progress hiển thị chính xác % thực tế (kể cả 200%, 300%), chỉ thanh tiến độ đồ họa bị giới hạn 100%.
2. **Mục tiêu tích lũy:**
   - Bản chất là phân bổ theo dõi sổ sách, không chuyển tiền vật lý giữa các tài khoản.
   - Cung cấp 2 nút riêng biệt: "Thêm tiền vào mục tiêu" và "Rút tiền khỏi mục tiêu" (nhập số tiền dương).
   - Rút tiền không được vượt quá số tiền hiện có trong mục tiêu.
3. **Định kỳ:**
   - Tính toán kỳ tiếp theo dựa trên `day_of_month` kết hợp xử lý ngày cuối tháng (ví dụ: ngày 31 tháng 1 → ngày 28/29 tháng 2 → ngày 31 tháng 3).
   - Trạng thái: Sinh khoản "Đến hạn / Chờ xác nhận" trên Dashboard; người dùng bấm xác nhận mới chuyển thành `posted`.

### 2.5. Hợp đồng OCR & Hóa đơn
1. **Ổn định Ánh xạ Row:**
   - Mỗi dòng quét từ ảnh gán một `client_row_id` duy nhất (UUID).
   - Kết quả lưu trữ trả về mapping theo `client_row_id -> transaction_id`.
   - Hóa đơn và khoản chia nợ chỉ gắn vào đúng `transaction_id` thành công của dòng tương ứng; tuyệt đối không dùng vị trí index mảng nén.
2. **Chuẩn hóa Đơn vị & Schema:**
   - Loại bỏ hoàn toàn các đoạn code tự nhân 100 theo ngưỡng (`< 100.000`, `< 1.000.000`).
   - Schema Zod yêu cầu `amount_minor` là số nguyên dương tính bằng minor unit (VND × 100).
   - Khi có dòng lỗi: Modal giữ nguyên danh sách, gắn cờ `failed` cho dòng lỗi kèm thông báo, cho phép người dùng sửa và "Thử lại dòng lỗi", không lưu trùng các dòng đã `saved`.
3. **Bảo mật API Key Gemini:**
   - Chuyển hướng gọi OCR qua backend proxy (Supabase Edge Function hoặc Worker endpoint) có auth và rate limiting.
   - Loại bỏ `VITE_GEMINI_API_KEY` khỏi bundle client.

### 2.6. Hợp đồng Bảo vệ Dữ liệu & Xuất File
1. **Cảnh báo mất dữ liệu:**
   - Mọi Form modal (Giao dịch, Ngân sách, Công nợ, Tài khoản) khi người dùng đã thay đổi dữ liệu (`isDirty = true`): nếu nhấn Escape hoặc click backdrop, hiển thị hộp thoại "Bạn có thay đổi chưa lưu. Bạn có chắc chắn muốn thoát?".
2. **Xuất CSV an toàn:**
   - Xuất đầy đủ toàn bộ giao dịch theo bộ lọc hiện tại của server (không giới hạn 200 trang hiển thị).
   - Xử lý mã hóa UTF-8 có BOM để hiển thị tiếng Việt chuẩn trên Excel.
   - Chống tấn công Spreadsheet Formula Injection: Mọi chuỗi bắt đầu bằng các ký tự `=`, `+`, `-`, `@` được prefix bằng dấu nháy đơn `'`.

---

## 3. CẤU TRÚC TỆP TIN VÀ FILE THAY ĐỔI DỰ KIẾN

```
web/src/
├── lib/
│   ├── api.ts              # Thêm phân trang server, settle_debt_payment RPC, voided filters
│   ├── format.ts           # Chuẩn hóa formatVND, tickFormatter trục Y
│   ├── daily.ts            # Chuẩn hóa getTzMonthRange, getTzCustomRange theo UTC+7
│   ├── ocrSchema.ts        # Loại bỏ auto-multiply 100x, sửa validation 0
│   ├── billOcrSchema.ts    # Loại bỏ auto-multiply 100x trên items và total
│   └── exportCsv.ts        # [NEW] Utility xuất CSV an toàn có escape formula
├── components/
│   ├── Modal.tsx           # Thêm cơ chế chặn thoát khi form dirty
│   ├── PaymentModal.tsx    # Chuyển sang gọi RPC nguyên tử, dùng chung lend/borrow
│   ├── DebtDetailModal.tsx # Nhánh borrow mở PaymentModal thay vì markDebtPaid trực tiếp
│   └── ocr/
│       └── ReceiptImportModal.tsx # Sửa row mapping, retry từng dòng lỗi, bảo toàn state
├── pages/
│   ├── DashboardPage.tsx   # Sửa biên tháng UTC+7, đổi nhãn "Chênh lệch thu-chi", 3 việc cần chú ý
│   ├── TransactionsPage.tsx# Phân trang server, bộ lọc đã hủy, nhớ ví gần nhất, xuất CSV
│   ├── ReportsPage.tsx     # Đồng bộ filter kỳ cho Pie/Heatmap, sửa trục Y x100
│   ├── BudgetsPage.tsx     # Chọn danh mục, hiển thị lỗi riêng, vòng đời sửa/dừng
│   ├── GoalsPage.tsx       # Tách Thêm/Rút tiền với số tiền dương
│   ├── RecurringPage.tsx   # Lịch theo day_of_month, preview 3 kỳ, xác nhận đến hạn
│   ├── AccountsPage.tsx    # Tách ẩn ví vs đóng ví, khôi phục tài khoản đã lưu trữ
│   ├── SettingsPage.tsx    # Thông báo VND-only
│   ├── LoginPage.tsx       # Bổ sung link Quên mật khẩu
│   ├── ForgotPasswordPage.tsx # [NEW] Trang gửi email đặt lại mật khẩu
│   └── ResetPasswordPage.tsx  # [NEW] Trang đặt lại mật khẩu mới
└── test/
    ├── helpers.ts          # Thêm cờ cô lập test local, mock Supabase client
    └── mocks/              # Mock fixtures cho offline unit/integration test
```

---

## 4. TASK DECOMPOSITION PREVIEW

- **TIP-000:** Baseline Schema Consolidation & Isolated Test Environment (P0)
- **TIP-001:** Standardize Currency, Date Intervals & Credit Card Accounting (P0)
- **TIP-002:** Full Transaction History, Server-side Pagination & Void Audit (P0)
- **TIP-003:** Accurate Budget Scoping, Progress Lifecycle & Error States (P0/P1)
- **TIP-004:** Comprehensive Reporting, Unified Range & Full Aggregation (P0/P1)
- **TIP-005:** Atomic Debt Settlement, Dual-Flow Repayment & Ledger Integrity (P0)
- **TIP-006:** Robust OCR Row ID Mapping, Safe Partial Retry & Key Protection (P0/P1)
- **TIP-007:** Reliable Recurring Schedule, Day-of-Month & Pending Confirmation (P1)
- **TIP-008:** Savings Goals Clarification, Bi-directional Flow & Limit Enforcement (P1)
- **TIP-009:** Seamless Onboarding, Password Recovery, Account Lifecycle & Fast Entry (P1)
- **TIP-010:** Actionable Dashboard Insights, Formula-Safe CSV Export & Final Polish (P1)

---

## 5. CHECKPOINT XÁC NHẬN

- [ ] Bản vẽ kiến trúc phản ánh đầy đủ nhu cầu của Chủ nhà và đặc tả trong `spec_v1.md`.
- [ ] Các hợp đồng tiền tệ, ngày giờ, số dư thẻ, công nợ, OCR đã được định nghĩa minh bạch.
- [ ] Không còn sự mập mờ trong phương án kỹ thuật triển khai.
