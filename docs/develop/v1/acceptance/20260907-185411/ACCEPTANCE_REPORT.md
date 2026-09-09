# ACCEPTANCE REPORT — Quản lý thu chi

Ngày nghiệm thu: 2026-09-07 (UTC+7)  
Vai trò: Contractor kiêm Senior QA, UX Auditor và Business Analyst  
Phạm vi: V1 P0/P1 theo spec_v1.md, D01–D09, F01–F27, QA-01–QA-17  
Revision kiểm tra: main tại a1f5a21dfe54742bf3e8867a413a36a5a90b6fd1, cộng toàn bộ thay đổi chưa commit trong working tree.

## Kết luận

**REJECTED — không đủ điều kiện nghiệm thu.**

Lý do chính:

- F14/REQ-014 bị **FAIL xác nhận**: production bundle hiện chứa đúng Gemini API key từ web/.env.local; code còn nhánh gọi Gemini trực tiếp từ trình duyệt và ghi prefix key ra console.
- QA-15 bị **FAIL xác nhận từ code**: các RPC SECURITY DEFINER như list_accounts_with_balances và get_monthly_history nhận p_user_id nhưng không ràng buộc p_user_id với auth.uid().
- Hợp đồng trạng thái bị vi phạm: calculate_account_balance, get_monthly_history và get_budget_progress dùng status != 'voided', nên pending có thể đi vào số dư/báo cáo/ngân sách dù spec yêu cầu chỉ posted ảnh hưởng số liệu thực.
- F15/REQ-015 bị **FAIL xác nhận từ code**: materialize_recurring_rules insert transaction mà không đặt status pending; schema mặc định là posted, trái D04.
- Đường fallback thanh toán nợ ở client quay về nhiều request không nguyên tử khi RPC không tồn tại; createManualTransaction còn đổi idempotency key khi gặp conflict, trái hợp đồng retry cùng key.
- Bằng chứng DB cô lập và E2E authenticated chưa chạy được vì Docker Desktop/Supabase local không khởi động; mobile E2E chưa chạy.
- Hồ sơ phê duyệt mâu thuẫn: spec_v1.md và DECISIONS.md đều còn trạng thái DRAFT/Chờ xác nhận, dù DECISIONS.md đồng thời ghi đã đồng ý toàn bộ. Vì vậy trạng thái phê duyệt chính thức vẫn cần BLOCKED ở cấp hồ sơ.

Có test xanh không làm đóng các lỗi trên. Báo cáo FINAL_VERIFY_REPORT.md và các TIP verify được dùng để truy vết, không được dùng làm bằng chứng duy nhất.

## Phạm vi và trạng thái kiểm tra

Đã đọc:

- docs/develop/spec_v1.md
- docs/develop/prompt_execute_v1.md
- docs/develop/v1/DECISIONS.md, BLUEPRINT.md, REQUIREMENTS_MATRIX.md, TASK_GRAPH.md
- docs/develop/v1/tips/ và docs/develop/v1/reports/
- docs/develop/v1/FINAL_VERIFY_REPORT.md
- Quan_ly_thu_chi/docs/PRODUCT_UX_AUDIT_2026-09-07.md
- VibeCode Kit v6.1 và references/qa-protocol.md

Working tree đã dirty trước khi nghiệm thu; không reset, checkout, commit, push hoặc sửa code nghiệp vụ. Lượt này chỉ chạy kiểm tra và tạo thư mục acceptance mới.

Môi trường:

- Windows/PowerShell; source app: Quan_ly_thu_chi/web.
- Local dev server: Vite tại http://127.0.0.1:8080.
- Supabase local: NOT RUN/BLOCKED vì Docker Desktop không có daemon.
- Remote Supabase: không gọi test ghi dữ liệu và không dùng tài khoản demo.
- Gemini thật: không gọi; OCR chỉ được kiểm tra bằng mock/unit/static scan.
- Browser: đã kiểm tra route login, signup, forgot-password và protected-route redirect ở local. Authenticated E2E, persistence và nghiệp vụ ghi dữ liệu: BLOCKED vì không có fixture DB cô lập/credential test được phép.

## Kết quả kiểm tra tổng hợp

| Nhóm | Kết quả độc lập | Đánh giá nghiệm thu |
|---|---|---|
| TypeScript | npm run typecheck: exit 0 | PASS kỹ thuật |
| Production build | npm run build: exit 0; 2.716 modules; có warning dynamic/static import api.ts | PASS kỹ thuật, không phải release sign-off |
| Unit/component | 15 test files, 131 tests PASS | PASS offline; có React act warnings |
| Lint | package.json không có script lint/config lint | NOT CONFIGURED |
| DB migrations/RPC | Không chạy được local DB | BLOCKED; static review tìm thấy lỗi |
| Browser desktop unauthenticated | Login/signup/forgot-password render; /dashboard redirect về /login | PASS cho guard/route |
| Browser desktop authenticated | Không chạy | BLOCKED |
| Browser mobile 360/390px | Không chạy | BLOCKED |
| Security cross-user | Static FAIL; runtime 2-user chưa chạy | REJECTED |
| OCR production security | Bundle scan exact-match key = TRUE | FAIL |

Chi tiết command, exit code và output đã được ghi trong evidence/02_automated_checks.md.

## Đối chiếu audit ban đầu

Hồ sơ triển khai đánh dấu F01–F27 là DONE/PASS. Nghiệm thu độc lập không chấp nhận các claim đó ở những điểm chưa có DB/E2E evidence. F14 bị bác bỏ trực tiếp bởi bundle scan; F15 bị bác bỏ bởi status mặc định trong migration; F26 chưa đạt vì hai thư mục migration và project-ref vẫn không đồng nhất; QA-15 bị bác bỏ từ contract của SECURITY DEFINER RPC.

## Trạng thái migration/deploy

Không có bằng chứng apply remote hoặc deploy production trong lượt này. Không được coi build local là deploy. Có nhiều migration mới chưa commit và còn thư mục supabase/migrations ở root chỉ chứa một phần file; project Supabase source trong .env, web/.env.local, supabase/.temp/project-ref và supabase/config.toml không cùng một project ref. Không được chạy script copy dữ liệu hoặc db push để “lấp” bằng chứng.

## Điều kiện để nghiệm thu lại

1. Sửa và verify toàn bộ ISSUE-ACC-001 đến ISSUE-ACC-008.
2. Chốt lại trạng thái D01–D09 trong một nguồn chính thức; cập nhật spec khỏi DRAFT chỉ khi có bằng chứng phê duyệt thật.
3. Khởi động DB test cô lập, chạy QA-01–QA-13, QA-15–QA-17 với fixture tổng hợp và fault injection; không dùng demo/production.
4. Chạy authenticated browser E2E đúng route, desktop và mobile; xác nhận reload/persist.
5. Bàn giao diff mới, rồi chạy regression theo FIX_TIPS.md. Completion Report của thợ không tự đóng issue.

