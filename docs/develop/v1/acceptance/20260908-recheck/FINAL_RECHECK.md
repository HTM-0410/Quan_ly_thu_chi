# Kết quả sửa và kiểm tra lại — 08/09/2026

## Kết luận

Đã hoàn thành bản sửa local và các kiểm tra dưới đây. Chưa nghiệm thu release trên DB chính: RPC mới chưa được apply và Worker chưa deploy. Không dùng kết quả local để đóng gate live.

## Công việc

- Ba subagent GPT-5.6 Luna / xhigh triển khai retry/trả hộ, OCR nguyên tử và quota dùng chung. Các agent chạm giới hạn tài khoản trước khi bàn giao cuối; root tiếp quản, review, chỉnh các phần còn thiếu và chạy lại độc lập.
- Retry form giữ operation key. Trả hộ dùng một RPC, giữ nguyên khoản chi tiêu ban đầu; chỉ phần hoàn gốc không vào thu nhập.
- OCR dùng một RPC cho splits, bill/items, person và debt. Dòng lỗi được giữ để retry. Sửa global category prefix và tạo person bên trong transaction.
- Worker dùng SQLite Durable Object theo user, fail closed khi thiếu binding; body được giới hạn khi đọc stream.
- Root sửa thêm principal trong summary/monthly/heatmap, trạng thái ended của recurring, bổ sung type RPC, manifest và preflight từ chối cả cấu hình thiếu.
- Hồ sơ 100% ACCEPTED cũ đã được đánh dấu superseded.

## Kiểm chứng độc lập

| Kiểm tra | Kết quả |
|---|---|
| Unit/component suite | 19 files, 152/152 PASS; final-unit-tests.txt |
| Build gồm TypeScript | PASS; final-build.txt |
| Migration từ DB trắng | 37/37 PASS; acceptance_20260908111522-results.txt |
| SQL accounting | PASS: hai-user account isolation, anonymous RPC denied, posted-only, same-key retry/payload mismatch, principal exclusion |
| SQL recurring | PASS: 31/01 → 28/02 → 31/03, pending không đổi ví, confirm/skip idempotent, ended |
| SQL OCR | PASS: bill consistency, rollback cả người mới, global category, retry và cross-user rejection |
| SQL trả hộ | PASS: same-key retry, payload mismatch, overpayment rollback, balance và consumer totals |
| Hai request trả hộ đồng thời | PASS: 1 operation, 1 payment, 2 cashflow transactions, remaining=600; final-concurrency.txt |
| Durable Object local workerd | PASS: 20 concurrent requests → 10 allowed/10 denied; đọc SQLite counter; reset cửa sổ; request thứ 61 bị quota ngày chặn |
| DO restart persistence | NOT RUN: getPlatformProxy không instantiate internal class; không lấy 2 phản hồi allowed làm bằng chứng persistence |
| Bundle scan exact secret + pattern | PASS: 8 JS/map, 0 key matches |
| git diff --check | PASS |

Evidence quota: ../../reports/evidence/20260908-ocr-quota-local-runtime.json. Script runtime đã bỏ thử nghiệm getPlatformProxy không phù hợp. PostgreSQL fixture cluster được dừng sau kiểm tra, dữ liệu fixture giữ trong thư mục temp; không đụng production.

## DB chính và chuyển dữ liệu

Đã đọc cả nguồn kldtrthnslpdhqrwlglg và đích qphevhmaczuazsvhbwfb. 22/22 bảng public khớp số lượng và nội dung chuẩn hóa; tổng tiền khớp. 2 users/2 identities mỗi DB; 0 Storage buckets/objects; 0 orphan profiles/transactions ở đích. Chi tiết DATA_RECONCILIATION.md.

DB mới chưa có create_paying_for_operation, create_ocr_transaction_row_atomic, create_ocr_transaction_row, confirm/skip_recurring_transaction; recurring_rules thiếu global_category_id (cả 4 dòng nguồn NULL nên không mất giá trị lịch sử). Vì vậy migration dữ liệu đạt phạm vi đối soát, nhưng schema/RPC chưa theo bản sửa.

## Gate chưa đóng

- Nâng cấp tăng dần DB chính sau backup và quyền apply rõ ràng, không replay seed hoặc script copy có truncate.
- Deploy Worker với binding/secrets đúng đích, xử lý key từng bị bundle.
- Authenticated desktop/mobile E2E, timeout/reload và fault injection trên môi trường release.
- CLI/env vẫn phân biệt nguồn và đích, preflight migration hiện chặn mismatch; không đổi URL để dùng nhầm credential nguồn.

Chưa commit/push/deploy hoặc ghi dữ liệu tài chính remote. Xem LIVE_RELEASE_GATES.md để tiếp tục release.
