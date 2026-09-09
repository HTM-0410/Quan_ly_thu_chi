# REQUIREMENT COVERAGE — Independent Acceptance

Quy ước:

- PASS (isolated): chỉ chứng minh được helper/schema/export/component mock; chưa đủ để đóng E2E/DB.
- PARTIAL: có evidence local hoặc static nhưng thiếu một phần AC bắt buộc.
- FAIL: có lỗi xác nhận từ code/bundle.
- BLOCKED: chưa thể chạy do môi trường/fixture/credential; không tính là PASS.

Không có REQ nào đạt trạng thái “fully accepted” trong lượt này. Bảng dưới map đủ 27 REQ trong matrix hiện hành.

| F-ID | REQ-ID | QA-ID | Trạng thái độc lập | Evidence / lý do |
|---|---|---|---|---|
| F26 | REQ-026 | QA-17 | FAIL | Hai thư mục migration vẫn tồn tại; root supabase/migrations chỉ có 4 file, project có chain khác; local DB không chạy. |
| F01 | REQ-001 | QA-01 | PARTIAL | daily.test.ts pass boundary helper; RPC/DB và dashboard authenticated chưa chạy; calculate_account_balance còn tính pending. |
| F02 | REQ-002 | QA-02 | BLOCKED | Static sign fix có mặt, nhưng chưa có DB fixture cho credit-card transaction và net-worth đối chiếu. |
| F07 | REQ-007 | QA-01 | PARTIAL | format/chart unit coverage có; chưa có browser chart với dữ liệu DB thật. |
| F23 | REQ-023 | QA-01 | PARTIAL | Code/UI có VND-only hint; chưa kiểm tra authenticated Settings route. |
| F05 | REQ-005 | QA-03, QA-04 | BLOCKED | Pagination helper test pass; chưa chạy fixture >200, voided lookup và transfer hai ví qua DB/browser. |
| F03 | REQ-003 | QA-05 | FAIL | get_budget_progress lọc status != voided, cho phép pending đi vào ngân sách; DB tree fixture chưa chạy. |
| F04 | REQ-004 | QA-05 | PARTIAL | BudgetsPage mock test pass; chưa fault-inject RPC trên DB/browser. |
| F17 | REQ-017 | QA-05 | PARTIAL | UI lifecycle test có; chưa xác minh inclusive date và history bằng DB. |
| F06 | REQ-006 | QA-03 | BLOCKED | Reports mock test pass; chưa fixture 1.205 giao dịch, 12 danh mục, uncategorized và đối chiếu tổng. |
| F20 | REQ-020 | QA-01, QA-03 | PARTIAL | Reports mock đồng bộ range; chưa authenticated browser kiểm tra heatmap kỳ dài. |
| F08 | REQ-008 | QA-06 | PARTIAL | PaymentModal borrow/lend mock pass; DB settlement và remaining chưa chạy. |
| F09 | REQ-009 | QA-02, QA-06 | BLOCKED | Chưa có DB/report fixture chứng minh thu gốc không vào income. |
| F10 | REQ-010 | QA-06, QA-07 | FAIL | Fallback client nhiều request khi RPC 42883; retry conflict đổi client_generated_id; concurrency/rollback chưa chạy. |
| F11 | REQ-011 | QA-08 | PARTIAL | OCR mapping mock pass; chưa lưu batch qua DB/bill/debt thật. |
| F12 | REQ-012 | QA-08, QA-09 | PARTIAL | Partial retry mock pass; chưa fault-inject create transaction/bill/debt với persistence. |
| F13 | REQ-013 | QA-09 | PASS (isolated) | billOcr.test.ts và schema test chứng minh minor unit; chưa gọi provider thật theo D09. |
| F14 | REQ-014 | QA-17 | FAIL | dist chứa exact Gemini key; client có direct URL; log dev in key prefix. |
| F15 | REQ-015 | QA-10 | FAIL | materialize_recurring_rules insert không set status; schema transaction mặc định posted, trái pending/chờ xác nhận. |
| F16 | REQ-016 | QA-11 | PARTIAL | GoalsPage mock pass; chưa DB lock/reload/ledger fixture. |
| F18 | REQ-018 | QA-12 | PARTIAL | Signup/forgot-password route render; không tạo user hoặc xác nhận email trong môi trường test. |
| F19 | REQ-019 | QA-14 | BLOCKED | Chưa authenticated Dashboard → Transactions CTA và last-used account. |
| F22 | REQ-022 | QA-13 | PARTIAL | AccountsPage mock pass; RPC user isolation và archived balance chưa runtime. |
| F24 | REQ-024 | QA-14 | PARTIAL | Modal/Accounts tests có; chưa browser keyboard/backdrop/reload trên authenticated route. |
| F21 | REQ-021 | QA-01, QA-10 | PARTIAL | Dashboard mock test pass; chưa dữ liệu thật và route links. |
| F25 | REQ-025 | QA-16 | PARTIAL | exportCsv 8/8 pass; chưa export >1 page từ server filter và mở file thực tế. |
| F27 | REQ-027 | QA-01 | PASS (isolated) | DashboardPage test kiểm tra 6 item label/render; chưa browser authenticated. |

## Coverage summary

- Requirements in matrix: 27/27 mapped.
- Source-level claims from implementation reports: 27/27 DONE, not accepted as proof.
- Fully accepted requirements in this independent pass: 0/27.
- Isolated-only PASS: 2/27.
- Confirmed FAIL: REQ-003, REQ-010, REQ-014, REQ-015, REQ-026.
- Remaining PARTIAL/BLOCKED: 22/27.

