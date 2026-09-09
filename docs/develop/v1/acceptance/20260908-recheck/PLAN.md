# Kế hoạch sửa và kiểm tra độc lập

Yêu cầu 08/09/2026: chia task và giao subagent GPT-5.6 Luna, reasoning xhigh; root kiểm tra lại sau khi hoàn tất.

| Task | Người thực hiện | Phạm vi | Điều kiện hoàn tất |
|---|---|---|---|
| T1 | financial_retry — Luna xhigh | Retry form, RPC trả hộ, test | Retry cùng operation không trùng; trả hộ rollback toàn bộ và gốc nợ không vào thu nhập |
| T2 | ocr_atomic — Luna xhigh | OCR row, bill/debt/split, test | Cả dòng nguyên tử; lỗi còn để retry; unknown result không tạo trùng |
| T3 | ocr_quota — Luna xhigh | Worker, shared quota, test/config | Quota dùng chung; thiếu binding fail closed; lỗi/rate/body được chặn |
| T4 | Root | Môi trường, DB cô lập, manifest, hồ sơ nghiệm thu | Kiểm tra độc lập DB và test/build; ghi rõ PASS/FAIL/BLOCKED |

Các agent sở hữu file riêng, dùng module API riêng để tránh ghi đè api.ts; migration mới được đánh số 20260908000001 và 20260908000002. Root tích hợp manifest và sửa các điểm phát hiện khi kiểm tra. Không ghi remote/deploy/commit/push hoặc gọi Gemini thật. Giữ dirty baseline.

Verification: test hành vi targeted → review code/RPC → apply chain vào PostgreSQL cô lập nếu khả dụng → fixture ownership, accounting, retry, rollback, recurring → full unit suite/build → cập nhật kết luận. PostgreSQL với auth shim không được báo là Supabase Auth/PostgREST E2E.
