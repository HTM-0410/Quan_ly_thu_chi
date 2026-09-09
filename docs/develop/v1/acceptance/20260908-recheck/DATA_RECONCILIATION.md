# Đối soát DB gốc → DB web ngày 08/09/2026

Nguồn: `kldtrthnslpdhqrwlglg` (CLI linked, SQL READ ONLY).
Đích người dùng xác nhận: `qphevhmaczuazsvhbwfb` (Dashboard đăng nhập, SQL READ ONLY).
Không copy lại, không sửa dữ liệu hoặc apply migration trong bước đối soát.

## Kết quả dữ liệu nghiệp vụ

- 22/22 bảng public khớp số dòng. Có 2 Auth users ở mỗi DB, hash tập email giống nhau.
- 17/22 bảng khớp hash toàn bộ nội dung sau chuẩn hóa owner theo email và profile ID được remap.
- budgets, debt_payments, global_categories khớp sau loại các cột mới chỉ có ở đích: category_id/currency, note, display_order.
- recurring_rules khớp nội dung các cột chung. Đích thiếu global_category_id; cả 4 dòng nguồn có cột này NULL nên chưa có giá trị lịch sử bị mất, nhưng schema chưa tương thích đầy đủ.
- audit_logs khớp sau chuẩn hóa old_data/new_data.occurred_at thành thời điểm epoch. Hash chung `5192bb1173e9d8ff0903b32206ec6677`; khác biệt ban đầu chỉ do biểu diễn timestamp JSON.
- Không có profile hoặc transaction mất liên kết Auth ở đích (0 orphan).
- Kiểm tra thêm Storage/Auth: cả hai DB đều 0 bucket, 0 object và 2 auth.identities; nguồn không có file Storage để chuyển.

| Bảng | Nguồn | Đích |
|---|---:|---:|
| audit_logs |64|64|
| bank_accounts |0|0|
| bank_connections |0|0|
| bank_events |0|0|
| bill_items |37|37|
| bills |16|16|
| budget_categories |0|0|
| budgets |5|5|
| categories |180|180|
| debt_audit_log |69|69|
| debt_payments |69|69|
| debts |79|79|
| financial_accounts |6|6|
| global_categories |133|133|
| goal_contributions |0|0|
| people |8|8|
| profiles |2|2|
| recurring_rules |4|4|
| saving_goals |3|3|
| transaction_entries |248|248|
| transaction_splits |0|0|
| transactions |248|248|

| Tổng kiểm tra (minor) | Nguồn và đích |
|---|---:|
| transactions.amount_minor |6494254901|
| transaction_entries.amount_minor |-812154899|
| debts.original_amount |344250000|
| debts.remaining_amount |92000000|
| debt_payments.amount |92250000|

Kết luận: các bản ghi nghiệp vụ trong 22 bảng public đã khớp theo số lượng, nội dung chuẩn hóa và tổng tiền. Đây không phải xác nhận schema/RPC mới đã triển khai. Không so sánh password hash, phiên Auth, Storage object hoặc cấu hình Edge Functions. Hai snapshot lấy tuần tự, không có khóa snapshot chung xuyên project.

Nguồn evidence: source-counts.json, source-fingerprints.json, source-financial-summary.json, source-audit-columns.json, source-audit-payload.json; các truy vấn target được đọc trực tiếp từ kết quả Dashboard trong phiên. SQL chuẩn hóa audit được lưu ở audit-normalized.sql.

## Schema/RPC đích chưa theo bản sửa

Kiểm tra pg_proc trực tiếp trên DB mới: chưa có create_paying_for_operation, create_ocr_transaction_row_atomic, create_ocr_transaction_row, confirm_recurring_transaction, skip_recurring_transaction. get_monthly_history còn cả overload 2 và 3 tham số. Dò definition cho thấy hai overload này không có chuỗi auth.uid(); summary không có marker is_debt_principal; materialize không có pending. Đây là kiểm tra inventory/definition, chưa là exploit hay E2E. Chưa apply bản migration local lên DB chính trong phiên.
