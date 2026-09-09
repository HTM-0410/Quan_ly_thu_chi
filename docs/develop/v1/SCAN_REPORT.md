# SCAN REPORT — Quản lý thu chi (VibeCode Kit v6.1)
Ngày thực hiện: 07/09/2026
Người thực hiện: THỢ (Builder) theo chỉ dẫn của THẦU (Contractor)
Workspace: `D:/Quản lý thu chi`
Ứng dụng web: `Quan_ly_thu_chi/web`

---

## 1. TECH_STACK

- **Language:** TypeScript 5.9.3 (Strict mode, `tsc --noEmit` đạt 0 lỗi)
- **Framework:** React 18.3.1, React Router DOM 6.26.2, Vite 5.4.8
- **Styling:** Tailwind CSS 3.4.13, PostCSS 8.4.47, Autoprefixer 10.4.20, Clsx 2.1.1
- **Database & Auth:** Supabase (`@supabase/supabase-js` 2.45.4), PostgreSQL 15+ (RLS, Triggers, RPC functions)
- **State Management:** React local state (`useState`, `useMemo`, `useCallback`, `useContext`)
- **Libraries:**
  - Date manipulation: `date-fns` 4.1.0
  - Charts: `recharts` 2.13.0
  - Validation: `zod` 3.25.76
  - Icons: `lucide-react` 1.28.0
  - Test runner: `vitest` 2.1.9, `@testing-library/react` 16.3.2, `jsdom` 25.0.1
  - Serverless / Edge: `wrangler` 4.118.0 (Cloudflare Worker SPA fallback)

---

## 2. EXISTING_MODULES

1. **Tài khoản (Accounts):**
   - Quản lý ví/ngân hàng/tiền mặt/thẻ tín dụng/tiết kiệm.
   - Đọc số dư qua RPC `list_accounts_with_balances` và `get_account_balance`.
   - Điều chỉnh số dư qua `adjust_account_balance`.
   - Lưu trữ ví qua `archiveAccount` (`is_archived = true`).
2. **Giao dịch (Transactions):**
   - Ghi thu/chi thủ công (`create_manual_transaction`).
   - Chuyển khoản nội bộ 2 phía (`create_transfer`).
   - Sửa giao dịch (`update_transaction`) và hủy giao dịch (`void_transaction`).
   - Tổng hợp thu/chi theo kỳ (`get_transactions_summary`).
3. **Ngân sách (Budgets):**
   - Tạo ngân sách theo tuần/tháng/tùy chỉnh.
   - Tính tiến độ ngân sách qua RPC `get_budget_progress`.
4. **Mục tiêu tích lũy (Goals):**
   - Tạo mục tiêu, đặt số tiền đích, hạn mục tiêu, liên kết ví.
   - Ghi nhận đóng góp qua RPC `add_goal_contribution`.
5. **Định kỳ (Recurring):**
   - Tạo quy tắc định kỳ (daily/weekly/monthly/yearly).
   - Nút kích hoạt thủ công "Sinh ngay" gọi RPC `materialize_recurring_rules`.
6. **Công nợ & Người quen (Debts & People):**
   - Quản lý danh bạ người quen (`people`).
   - Tạo khoản cho vay (`lend`) và đi vay (`borrow`).
   - Trả nợ qua `PaymentModal` (gọi `add_debt_payment` và `create_manual_transaction`).
   - Đánh dấu đã trả cho khoản đi vay (`mark_debt_paid`).
7. **OCR & Hóa đơn (OCR & Bills):**
   - Đọc sao kê / ảnh giao dịch qua Google Gemini (`gemini-3.5-flash-lite`).
   - Hóa đơn chi tiết mua sắm/siêu thị (`bills` và `bill_items`).
   - Tách khoản mua chung / trả hộ (`split_share`).
8. **Báo cáo & Dashboard (Reports & Dashboard):**
   - Thẻ tổng quan số dư tài sản ròng (`get_net_worth`), thu/chi tháng.
   - Biểu đồ cột thu/chi theo kỳ (Recharts BarChart).
   - Biểu đồ tròn danh mục chi tiêu (PieChart).
   - Bản đồ nhiệt chi tiêu theo ngày (`MonthHeatmap`).
9. **Cài đặt & Xác thực (Settings & Auth):**
   - Đăng ký, đăng nhập email/password bằng Supabase Auth.
   - Cài đặt tên hiển thị, tiền tệ (dropdown), múi giờ (dropdown).

---

## 3. PATTERNS_DETECTED

- **Sổ cái kép (Double-Entry Ledger Core):** Mỗi transaction ghi vào bảng `transactions` kèm các entries chi tiết trong `transaction_entries`. Transfer luôn có 2 entries tổng bằng 0.
- **Đơn vị tiền Minor Unit:** Toàn bộ tiền tệ trong DB và API được quy ước lưu dưới dạng minor unit (VND × 100).
- **RPC Encapsulation:** Các nghiệp vụ tài chính quan trọng sử dụng PostgreSQL RPC functions với security definer / search path bảo mật.
- **Client Modals:** Giao diện nhập liệu dùng chung pattern `Modal` với `Toast` feedback và `Confirm` dialog.

---

## 4. REUSABLE_COMPONENTS

- `VNDInput.tsx` — Input nhập số tiền VND tự động định dạng hàng nghìn.
- `CategoryPicker.tsx` — Dropdown chọn danh mục có tìm kiếm và hỗ trợ cây cha/con.
- `Modal.tsx` — Dialog chuẩn có ARIA accessibility, focus trap và xử lý phím Escape.
- `Toast.tsx` / `ConfirmProvider` — Hệ thống thông báo và hộp thoại xác nhận.
- `MonthHeatmap.tsx` & `DayDetail.tsx` — Trình trực quan hóa mật độ chi tiêu và danh sách giao dịch theo ngày.
- `AccountIcon.tsx` / `CategoryIcon.tsx` — Icon đại diện cho tài khoản và danh mục.
- `BillBadge.tsx` / `BillLineItemTable.tsx` — Component hiển thị chi tiết hóa đơn.

---

## 5. GAPS_DETECTED (Đối chiếu F01–F27 từ Audit)

| Mã | Phát hiện thực tế trong code | Vị trí file | Mức độ |
|---|---|---|---|
| **F01** | `DashboardPage.tsx` dùng `toISOString().slice(0, 10)` làm lệch ngày đầu/cuối tháng ở UTC+7 (tháng 9 biến thành 31/08 - 29/09). | `web/src/pages/DashboardPage.tsx:69-74` | High · P0 |
| **F02** | `calculate_net_worth` đổi dấu số dư `credit_card` (`-calculate_account_balance`), khiến chi tiêu thẻ tín dụng làm tăng tài sản ròng. | `Quan_ly_thu_chi/supabase/migrations/20260730000001_m1_core_tables.sql:452` | High · P0 |
| **F03** | Form tạo ngân sách không có trường chọn danh mục; RPC `get_budget_progress` tính toàn bộ chi tiêu cho mọi ngân sách. | `web/src/pages/BudgetsPage.tsx:57-72` | High · P0 |
| **F04** | Lỗi gọi `getBudgetProgress` bị nuốt và gán thành `0` spent; phần trăm bị giới hạn `Math.min(150, ...)`. | `web/src/pages/BudgetsPage.tsx:98-100, 197-198` | High · P0 |
| **F05** | `TransactionsPage.tsx` gọi `listTransactions({ limit: 200 })`; không phân trang server, không xem được giao dịch đã hủy. | `web/src/pages/TransactionsPage.tsx:150` | High · P0 |
| **F06** | `ReportsPage.tsx` giới hạn 500 dòng chi tiêu, chỉ lấy tháng hiện tại, bỏ qua chưa phân loại và cắt top 8 bỏ rơi phần còn lại. | `web/src/pages/ReportsPage.tsx:281-312` | High · P0 |
| **F07** | Trục Y biểu đồ chia `100.000` từ minor unit nhưng chú thích ghi `x 100.000 ₫` (sai lệch 100 lần so với thực tế). | `web/src/pages/ReportsPage.tsx:545, 558` | High · P0 |
| **F08** | Tạo nợ không ghi nhận giải ngân tài khoản; nhánh đi vay gọi `markDebtPaid` bỏ qua PaymentModal và chọn tài khoản. | `web/src/components/DebtDetailModal.tsx:78` | High · P0 |
| **F09** | Thu hồi gốc cho vay được ghi thành `income` tiêu dùng, trả gốc đi vay ghi thành `expense` tiêu dùng. | `web/src/components/PaymentModal.tsx:101` | High · P0 |
| **F10** | Thanh toán nợ gồm 2 request độc lập (payment + transaction) không nguyên tử; rollback thủ công không an toàn khi mạng lỗi. | `web/src/components/PaymentModal.tsx:87-119` | High · P0 |
| **F11** | `flatTxIds` trong OCR import nén mảng thành công, gây lệch offset khi gắn hóa đơn hoặc công nợ cho các dòng sau dòng lỗi. | `web/src/components/ocr/ReceiptImportModal.tsx:444-463` | High · P0 |
| **F12** | OCR import đóng modal khi có ít nhất 1 dòng thành công; không giữ lại danh sách lỗi để thử lại; thiếu idempotency key. | `web/src/components/ocr/ReceiptImportModal.tsx:429` | High · P1 |
| **F13** | `billOcrSchema.ts` tự nhân 100 nếu giá trị `< 100.000` hoặc `< 1.000.000`, làm sai lệch 100 lần số tiền đã ở dạng minor unit. | `web/src/lib/billOcrSchema.ts:28, 42, 64` | High · P0 |
| **F14** | `VITE_GEMINI_API_KEY` nằm trong frontend và `.env.local`; gọi trực tiếp API Gemini từ trình duyệt người dùng. | `web/src/lib/config.ts:50`, `web/.env.local:8` | High · P0 |
| **F15** | Quy tắc định kỳ chỉ kích hoạt khi nhấn nút "Sinh ngay"; SQL `materialize_recurring_rules` bỏ qua `day_of_month`. | `web/src/pages/RecurringPage.tsx:218`, SQL M3:398 | High · P1 |
| **F16** | Mục tiêu tiết kiệm hướng dẫn nhập số âm để rút tiền, nhưng `VNDInput` lọc bỏ toàn bộ dấu âm (`digitsOnly`). | `web/src/components/VNDInput.tsx:72`, `web/src/pages/GoalsPage.tsx:500` | High · P1 |
| **F17** | Ngân sách không có thao tác sửa, tạm dừng hoặc xem lịch sử các kỳ trước; kỳ tùy chỉnh tính thiếu ngày kết thúc. | `web/src/pages/BudgetsPage.tsx` | Medium · P1 |
| **F18** | Đăng ký xong tự chuyển trang sau 4 giây; không có luồng quên/đổi mật khẩu; thiếu wizard đưa người mới tới giao dịch đầu. | `web/src/pages/SignupPage.tsx:8, 33-41` | High · P1 |
| **F19** | CTA "Giao dịch mới" ở Dashboard chỉ điều hướng; form ưu tiên Chuyển khoản; không nhớ tài khoản vừa sử dụng. | `web/src/pages/DashboardPage.tsx`, `TransactionsPage.tsx:338` | Medium · P1 |
| **F20** | Bộ lọc thời gian ở ReportsPage không áp dụng cho PieChart và Heatmap (luôn cố định ở tháng hiện tại). | `web/src/pages/ReportsPage.tsx:281` | Medium · P1 |
| **F21** | Dashboard hiển thị "Còn lại" = Thu - Chi tháng gây hiểu nhầm là tiền có thể tiêu; thiếu danh sách việc cần xử lý. | `web/src/pages/DashboardPage.tsx:88` | Medium · P1 |
| **F22** | Lưu trữ tài khoản loại trừ khỏi net-worth nhưng modal chỉ thông báo "bị ẩn"; không có UI khôi phục tài khoản đã lưu trữ. | `web/src/pages/AccountsPage.tsx:176` | High · P1 |
| **F23** | Cài đặt cho phép chọn USD/EUR/JPY/SGD/THB nhưng toàn bộ logic hệ thống mặc định VND minor unit. | `web/src/pages/SettingsPage.tsx:122` | Medium · P1 |
| **F24** | Modal đóng khi click backdrop hoặc bấm Escape mà không cảnh báo dữ liệu đang nhập; chưa có tính năng xuất CSV. | `web/src/components/Modal.tsx:52, 104` | Medium · P1 |
| **F25** | Điều hướng mobile cuộn ngang 11 mục đồng cấp, không có nút thêm nhanh nổi (FAB). | `web/src/components/AppLayout.tsx:184` | Medium · P2 |
| **F26** | Migrations bị phân tán 2 nơi (`Quan_ly_thu_chi/supabase/migrations` và `supabase/migrations`); thiếu migration tạo bảng `global_categories` và RPC `mark_debt_paid`; `npm test` mặc định chạy integration test ghi vào Supabase demo. | Workspace structure, `web/src/test/helpers.ts:4` | High · P1 |
| **F27** | Dashboard ghi "8 mục mới nhất" nhưng gọi `recent.slice(0, 6)`. | `web/src/pages/DashboardPage.tsx:229, 255` | Low · P2 |

---

## 6. CODE_HEALTH

- **Type Safety:** 100% Type-checked (`npm run typecheck` đạt 0 lỗi).
- **Linting:** NOT CONFIGURED (không có script `lint` hay cấu hình ESLint trong `Quan_ly_thu_chi/web`).
- **Tests Hiện tại (7 files):**
  - Đạt: `src/lib/format.test.ts`, `src/lib/daily.test.ts`, `src/lib/billOcr.test.ts`.
  - Lỗi:
    - `src/lib/ocrSchema.test.ts`: 1 lỗi do schema cho phép số tiền 0 (`.nonnegative()`) trong khi test yêu cầu từ chối (`rejects zero amount`).
    - `src/components/PaymentModal.test.tsx`: 9 lỗi do `vi.mock('../lib/api')` không mock `listAccounts` và `createManualTransaction`.
  - Rủi ro môi trường: `src/lib/api-debt.test.ts` và `src/lib/debt-flow.test.ts` import `helpers.ts` thực hiện đăng nhập và ghi/xóa dữ liệu trực tiếp trên Supabase demo (`kldtrthnslpdhqrwlglg.supabase.co`).
- **Debug Artifacts:** Phát hiện `console.log` trong `config.ts`, `ReceiptImportModal.tsx`, `PaymentModal.tsx`.

---

## 7. ESTIMATED_SIZE

- Số file mã nguồn: ~43 files (.ts, .tsx)
- Quy mô mã nguồn: ~12.000 dòng code
- Số trang (Pages): 13
- Số components: 29
- Số file migrations: 21 files (17 file trong `Quan_ly_thu_chi/supabase/migrations`, 4 file trong `supabase/migrations`)
- Số RPC functions backend đang sử dụng: 27 functions

---
Báo cáo hoàn tất và bàn giao cho THẦU phân tích RRI và lập BLUEPRINT.
