# Tái nghiệm thu ngày 08/09/2026

## Kết luận: REJECTED — chưa đủ điều kiện đóng nghiệm thu

Đối chiếu bản sửa hiện tại với ISSUES.md, FIX_TIPS.md của đợt 20260907-185411 và REQUIREMENTS_MATRIX.md. Giữ nguyên mã nguồn có sẵn; chỉ thêm báo cáo và script tái hiện offline. Không apply migration, ghi remote, gọi Gemini, deploy, commit hoặc push.

## Lỗi còn tồn tại

1. **P1 / ACC-004: Retry từ form giao dịch vẫn có thể tạo trùng.** `web/src/pages/TransactionsPage.tsx:1452` không truyền `client_generated_id`; `web/src/lib/api.ts:522` tạo UUID mới mỗi lần gọi hàm. Khóa chỉ được giữ trong vòng lặp retry nội bộ. Nếu server commit nhưng cả ba phản hồi đều timeout, người dùng bấm Lưu lại sẽ tạo operation mới. Script `reproduce-manual-retry.cjs` chạy thân hàm thật với RPC giả lập, kết quả: 4 calls, retry nội bộ cùng khóa, submit tiếp theo khác khóa, 2 giao dịch giả lập được commit. Đây là bằng chứng offline, không phải fault injection DB thật. Cần giữ khóa tại form cho tới khi đối soát được kết quả nghiệp vụ.

2. **P1 / REQ-009, REQ-010, ACC-004: Luồng trả hộ vẫn ghi nhiều request độc lập.** `web/src/pages/TransactionsPage.tsx:1452`, `:1466`, `:1477` lần lượt tạo giao dịch chính, giao dịch thu và payment. Payment thất bại không rollback các giao dịch đã tạo. Giao dịch thu cũng không có metadata `is_debt_principal`, nên không được loại khỏi thống kê theo cơ chế lọc gốc nợ hiện tại. Cần đưa toàn bộ nghiệp vụ vào RPC nguyên tử và kiểm tra lại tổng thu nhập. Phát hiện từ mã nguồn; chưa chạy trên DB.

3. **P1 / REQ-012, ACC-004: OCR mất khả năng retry phần hóa đơn/công nợ lỗi.** `web/src/components/ocr/ReceiptImportModal.tsx:529`, `:565` chỉ toast cảnh báo khi bước tạo bill/debt thất bại; không cập nhật rowStatusMap. Tại `:582`, dòng vẫn được đánh dấu thành công dựa vào transaction, sau đó bị loại khỏi danh sách retry hoặc modal đóng. RPC mới chỉ bao trùm các split giao dịch, chưa bao trùm bill/debt. Cần trạng thái kết quả cho toàn bộ dòng và retry an toàn từng bước, hoặc một RPC nguyên tử. Phát hiện từ mã nguồn.

4. **ACC-006 vẫn BLOCKED:** preflight exit 1. Canonical config/web env là `qphevhmaczuazsvhbwfb`, project env/CLI state là `kldtrthnslpdhqrwlglg`. Chặn sai môi trường hoạt động, nhưng yêu cầu thống nhất môi trường chưa hoàn thành.

5. **ACC-007 còn giới hạn quota:** Worker dùng Map trong từng isolate (`web/_worker.js/index.js:19`), chưa có quota dùng chung cho cùng người dùng. Test hiện tại chỉ chứng minh giới hạn trong một instance. Không đóng yêu cầu quota toàn dịch vụ bằng test này.

## Đối chiếu các issue cũ

| Issue | Kết quả tái kiểm tra |
|---|---|
| ACC-001 | Client/proxy và bundle pattern scan đạt local; chưa kiểm chứng network/console authenticated hoặc trạng thái rotation key cũ |
| ACC-002 | Migration thêm auth.uid guard và thu hồi overload; chưa đạt bằng chứng hai user/anonymous trên DB |
| ACC-003 | Migration đã bổ sung posted-only; chưa đối soát fixture DB xuyên account/dashboard/report/budget |
| ACC-004 | FAIL: retry form và luồng trả hộ/OCR còn thiếu như trên |
| ACC-005 | Có pending, confirm/skip và khóa trong migration; chưa kiểm chứng scheduler, concurrency, lưu sau reload trên DB |
| ACC-006 | Manifest đạt; identity và clean reset chưa đạt |
| ACC-007 | Auth/body/schema/model guard có test local; quota chỉ trong isolate, deployed E2E chưa chạy |
| ACC-008 | Đã bỏ fallback trong helper, bắt buộc secret, dry-run đạt; chưa chạy copy trên disposable target |

## Kết quả chạy mới

Web cwd: `D:\Quản lý thu chi\Quan_ly_thu_chi\web`.

| Kiểm tra | Kết quả |
|---|---|
| RUN_REMOTE_TESTS=false; npm test -- --reporter=verbose | Exit 0; 16 files, 137 tests PASS; 65.39 giây; có cảnh báo React act |
| npm run build | Exit 0; gồm tsc --noEmit; 2716 modules transformed |
| node --check _worker.js/index.js | Exit 0 |
| git diff --check | Exit 0; cảnh báo LF/CRLF |
| Scan 8 dist JS/map | 0 match với VITE_GEMINI_API_KEY, provider hostname, mẫu API key; không phải exact-secret scan |
| Manifest so với migration canonical | 33 file, 0 khác biệt |
| copy-supabase-data.ps1 -DryRun | Exit 0, không network/write |
| preflight-supabase.ps1 | Exit 1, project refs chưa thống nhất |
| supabase status | Exit 1, Docker Linux engine pipe không tồn tại |
| node docs/develop/v1/acceptance/20260908-recheck/reproduce-manual-retry.cjs (repo root) | Script exit 0, kết quả assertion nghiệp vụ FAIL: uiResubmitKeepsKey=false, simulatedCommittedTransactions=2 |

## Bằng chứng còn thiếu trước khi chấp nhận

- Reset migration từ đầu trên DB cô lập, inventory RPC/schema và hai-user/anonymous RLS.
- Fixture posted/pending/voided, gốc nợ, số dư và đối soát thống kê.
- Fault injection/concurrency cho giao dịch, settlement, trả hộ, OCR; scheduler ngày 31 và confirm đúng một lần.
- Authenticated desktop/mobile E2E, network OCR và persist sau reload. Không lấy unit/mock tests thay thế các bước này.
- Sửa trạng thái hồ sơ: CHECKPOINT.md ghi 11/11 ACCEPTED và 27/27 hoàn tất; REQUIREMENTS_MATRIX.md ghi DONE toàn bộ, trái với kết quả hiện tại và báo cáo Builder PARTIAL/BLOCKED. Không dùng những tuyên bố này làm bằng chứng sign-off.

Không yêu cầu quyền remote trong lượt tái kiểm tra này; các kiểm tra DB/E2E nêu trên chưa hoàn tất, không được tính PASS.
