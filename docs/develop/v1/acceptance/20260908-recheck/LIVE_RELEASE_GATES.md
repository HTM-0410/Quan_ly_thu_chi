# Các bước còn lại để nghiệm thu trên DB chính

Đích đã được người dùng xác nhận: qphevhmaczuazsvhbwfb. Nguồn chỉ để đối soát: kldtrthnslpdhqrwlglg. Dữ liệu public đã đối soát khớp; xem DATA_RECONCILIATION.md.

1. Có backup schema và dữ liệu đích trước khi áp dụng. Không chạy copy-supabase-data.ps1: helper có thao tác truncate và tạo lại Auth, không phải công cụ nâng cấp schema.
2. Inventory migration/RPC của đích và so sánh canonical; chuẩn bị bản nâng cấp tăng dần, không replay seed demo hoặc toàn bộ 37 migration trên DB đang có dữ liệu.
3. Cần áp dụng các định nghĩa hardening và RPC mới cùng dependency schema (recurring_rules.global_category_id và các bảng operation). Sau apply phải kiểm tra lại ownership, grants, posted-only, overload cũ, tiền gốc và số liệu trước/sau.
4. Triển khai Worker kèm Durable Object OCR_QUOTA và secret Worker đúng project đích. Build frontend không chứa provider key; rotate provider key từng bị bundle qua quy trình quản trị.
5. Chạy authenticated E2E desktop/mobile, ghi giao dịch trong tài khoản QA riêng được cho phép, timeout/retry/reload, OCR với provider mock hoặc môi trường kiểm thử phù hợp. Chỉ sau đó đóng gate live.

Phiên hiện tại được cấp quyền triển khai local và đọc/đối soát hai DB; chưa apply/deploy remote. CLI còn linked project nguồn: không sửa URL env sang đích nhưng giữ nguyên credential nguồn. Preflight cố ý chặn trạng thái không thống nhất.
