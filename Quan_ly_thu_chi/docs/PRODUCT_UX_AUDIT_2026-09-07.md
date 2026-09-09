# Báo cáo Product / UX / Business Logic — Quản lý thu chi
Ngày đánh giá: 07/09/2026

## 1. Tổng quan sản phẩm

**Nhận định chính:** sản phẩm có phạm vi tính năng rộng, phù hợp làm sổ thu chi cá nhân có hỗ trợ nhập ảnh. Tuy nhiên, độ tin cậy của số liệu và tính liền mạch giữa giao dịch, công nợ, ngân sách, mục tiêu chưa đủ tốt để người dùng dựa vào đó quyết định chi tiêu hằng ngày.

Ứng dụng React/TypeScript dùng Supabase cho xác thực, dữ liệu và RPC; Worker hiện có chỉ phục vụ SPA. Có 11 màn hình nghiệp vụ/cài đặt sau đăng nhập, cùng đăng ký và đăng nhập.

| Nhóm đã có | Nhu cầu đang giải quyết | Giới hạn quan trọng |
|---|---|---|
| Thu/chi thủ công, sửa, hủy | Ghi sổ và sửa sai | Danh sách chỉ lấy 200 giao dịch; thiếu đường xem lại giao dịch đã hủy |
| Chuyển khoản giữa tài khoản, phí chuyển | Di chuyển tiền nội bộ | Không cho sửa; chỉ biểu diễn một phía tài khoản trong danh sách |
| Tiền mặt, ngân hàng, ví, tiết kiệm, thẻ tín dụng | Theo dõi nơi giữ tiền, số dư, điều chỉnh | Ngữ nghĩa số dư thẻ tín dụng và tổng tài sản có vấn đề |
| Danh mục cá nhân/hệ thống, cha/con, tìm kiếm khi chọn | Phân loại khoản thu/chi | Nhánh báo cáo/ngân sách chưa thống nhất cách tổng hợp |
| Ngân sách tuần/tháng/tùy chỉnh | Giới hạn chi | Form không gắn danh mục, không có sửa/dừng trong UI |
| Mục tiêu tiết kiệm, đóng góp, tạm dừng | Theo dõi tiến độ mục tiêu | Chưa liên kết dòng tiền; không nhập được khoản rút âm |
| Quy tắc định kỳ | Giảm nhập lặp | Chỉ tìm thấy nút sinh thủ công; lịch SQL chưa thực hiện đúng ngày đã chọn |
| Người quen, cho vay/đi vay, lịch sử trả | Nhớ công nợ | Tạo nợ, trả nợ và thu/chi chưa thành một nghiệp vụ nhất quán |
| OCR giao dịch, chia tài khoản/chia tiền, bill chi tiết | Giảm gõ dữ liệu, giữ chi tiết mua hàng | Lỗi xử lý thành công một phần, suy đoán đơn vị tiền, thao tác bổ sung dài |
| Dashboard, biểu đồ thu/chi, danh mục, heatmap ngày | Nhìn lại tình hình tài chính | Sai lệch kỳ/đơn vị, bỏ sót dữ liệu; ít chỉ dẫn hành động |
| Hồ sơ, múi giờ, tiền tệ, giao diện sáng/tối | Cá nhân hóa | Lựa chọn tiền tệ vượt quá khả năng thực thi hiện tại |

**Phạm vi bằng chứng:** đã lập danh mục project, đọc các màn hình, thành phần tương tác chính, lớp API, định dạng tiền/ngày, auth, OCR và các migration liên quan; lần theo luồng từ UI tới RPC. Không coi screenshot và báo cáo milestone cũ là bằng chứng runtime hiện tại. Đây là audit code và kiểm tra tự động, **chưa phải kiểm thử toàn bộ hành trình bằng trình duyệt trên desktop/mobile**; chưa đo thời gian nhập thực tế, tỷ lệ activation hay retention.

**Kiểm tra hiện tại:** production build và TypeScript thành công. Test: **79 đạt / 89**, 10 lỗi gồm 9 ca PaymentModal thiếu mock `listAccounts`, 1 ca OCR schema kỳ vọng từ chối số tiền 0. Lỗi mock không chứng minh UI thực tế crash; schema cho phép 0 cũng không đồng nghĩa lưu được giao dịch 0 vì form còn kiểm tra. Không dùng tỷ lệ test pass làm điểm chất lượng sản phẩm.

**Tác động của lần kiểm tra:** `npm test` hiện chạy cả test tích hợp Supabase với tài khoản demo, tạo người/khoản nợ/thanh toán, rồi gọi cleanup. Các test tích hợp đều đạt nhưng cleanup không kiểm tra đầy đủ lỗi trả về; chưa xác minh độc lập việc dọn sạch. Audit không sửa source nghiệp vụ hay deploy. Đây cũng là điểm cần tách biệt trong quy trình kiểm tra của team.

**Kiểm chứng cục bộ bổ sung (không gọi backend):** chạy trực tiếp schema bill hiện tại cho total 500.000 minor trả ra 50.000.000 minor, trong khi line_total vẫn 500.000. Tính biểu thức ngày với timezone Asia/Bangkok cho tháng 09/2026 trả start=2026-08-31, end=2026-09-29. Biểu thức tick cho 100.000.000 minor trả 1.000 trong khi giá trị đúng là 1.000.000 ₫. Hàm loại ký tự của input biến -100000 thành 100000. Các kiểm chứng này xác nhận F01, F07, F13 và phần nhập âm của F16 ở cấp xử lý cục bộ, không thay thế E2E.

## 2. User Flow hiện tại

| Luồng | Các bước thực tế | Đánh giá |
|---|---|---|
| Người mới | Đăng ký → xác nhận email nếu bật → đăng nhập → Dashboard → Tài khoản → tạo ví/số dư → Giao dịch → mở form → lưu | Có danh mục mặc định trong migration và empty state tạo tài khoản. Nhưng người mới phải tự nối các bước; không có wizard đưa tới giao dịch đầu tiên. |
| Ghi chi thường ngày | Dashboard “Giao dịch mới” → trang Giao dịch → nút “Giao dịch” → số tiền, ví, danh mục, ngày, đối tượng, ghi chú → lưu | Form mặc định chi, thời gian hiện tại, ví đầu tiên và ô tiền có autofocus là hợp lý. CTA ở Dashboard không mở form nên thêm một bước; chưa nhớ ví gần dùng. |
| Sửa/hủy | Danh sách → Sửa → lưu; hoặc Hủy → xác nhận → gọi RPC → tải lại | Có bảo vệ thao tác hủy và tính lại số dư. Không có lịch sử hủy/hoàn tác để người dùng tự kiểm tra; chuyển khoản phải hủy và tạo lại. |
| Nhập ảnh | Chọn/paste tối đa 10 ảnh → xử lý tuần tự → duyệt/sửa/chọn dòng → bổ sung ví/danh mục/kênh mua → import → có thể mở tiếp modal bill | Có preview và cảnh báo độ tin cậy. Luồng dài với mua sắm; lỗi một phần có thể làm mất dòng cần sửa hoặc gắn sai bill. |
| Ngân sách | Tạo tên, số tiền, chu kỳ, ngày → xem mức sử dụng | Chưa có bước chọn phạm vi chi tiêu; tên ngân sách dễ khiến người dùng hiểu sai phép tính. |
| Mục tiêu | Tạo mục tiêu, hạn, ví liên kết → đóng góp → xem tiến độ | Dễ hiểu ở mức sổ ghi tiến độ, nhưng liên kết ví chưa có tác dụng lên dòng tiền và thao tác rút bị chặn bởi input. |
| Công nợ | Chọn/thêm người ngay trong form → tạo nợ → xem chi tiết → cho vay: mở thanh toán; đi vay: đánh dấu đã trả | Thêm người tại chỗ tốt. Hai nhánh trả nợ khác nhau; nhánh đi vay bỏ qua form trả một phần và chọn tài khoản. |
| Định kỳ | Tạo quy tắc → “Sinh ngay” → giao dịch được ghi sổ → xem Báo cáo | Có giá trị giảm nhập lặp nhưng chưa chứng minh tự động chạy; thiếu bước phân biệt dự kiến và đã thanh toán. |
| Xem tài chính | Dashboard tổng hợp → Báo cáo → chọn kỳ → biểu đồ/heatmap → chi tiết danh mục/ngày | Có khả năng truy xuống chi tiết. Bộ chọn kỳ chỉ áp dụng một phần màn hình; chưa có vòng quay từ insight sang hành động sửa giao dịch/điều chỉnh ngân sách. |

Bằng chứng flow: [App.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/App.tsx:31>), [DashboardPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx:54>), [TransactionsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx:155>), [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:366>), [DebtDetailModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/DebtDetailModal.tsx:65>), [RecurringPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/RecurringPage.tsx:137>).

## 3. Điểm đang làm tốt

1. **Có lõi ghi sổ thực sự:** giao dịch và entries tách biệt; chuyển khoản ghi hai phía, phí ghi riêng; số dư loại giao dịch đã hủy. Đây là nền tảng tốt để tránh coi chuyển tiền nội bộ là thu nhập. Bằng chứng: [20260730000003_m1_rpc_functions.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000003_m1_rpc_functions.sql:71>), [20260730000001_m1_core_tables.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000001_m1_core_tables.sql:446>).
2. **Nhập tiền và chọn danh mục có đầu tư:** input số, dấu phân cách hàng nghìn, giữ vị trí con trỏ; picker có tìm kiếm, cha/con, đánh dấu mục đã chọn. Bằng chứng: [VNDInput.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/VNDInput.tsx:35>), [CategoryPicker.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/CategoryPicker.tsx:38>).
3. **OCR có người kiểm tra trước khi ghi:** ảnh được preview, sửa dòng, chọn ví, cảnh báo số tiền/độ tin cậy; không tự ghi ngay sau khi AI đọc ảnh. Bằng chứng: [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:366>).
4. **Chi tiết ngày giúp giải thích số tổng:** heatmap và DayDetail cho phép nhìn khoản chi trong một ngày; hàm nhóm ngày có xử lý múi giờ và loại giao dịch hủy. Bằng chứng: [daily.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/daily.ts:74>), [ReportsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx:271>).
5. **Công nợ hỗ trợ thêm người ngay tại chỗ:** không bắt rời form sang danh bạ rồi quay lại. Bằng chứng: [DebtFormModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/DebtFormModal.tsx:53>).
6. **Có xử lý trạng thái giao diện:** skeleton, thông báo lỗi/thử lại, toast, xác nhận hủy; modal có vai trò dialog và xử lý focus; có layout mobile và theme hệ thống. Đây là điểm tốt từ code, chưa khẳng định đạt đầy đủ accessibility. Bằng chứng: [Modal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/Modal.tsx:44>), [AppLayout.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/AppLayout.tsx:29>).

## 4. Các vấn đề cần cải thiện

Mức độ High = có thể sai số liệu, mất/nhầm dữ liệu, chặn nghiệp vụ cốt lõi hoặc ảnh hưởng niềm tin; Medium = tăng công sức hoặc giảm giá trị; Low = bất nhất nhỏ. P0/P1/P2 là thứ tự xử lý, không đồng nhất tuyệt đối với severity.

### F01 — Biên tháng Dashboard sai theo giờ Việt Nam
**Vấn đề →** tạo ngày đầu/cuối tháng ở giờ local rồi `toISOString().slice(0,10)`. Ở UTC+7, tháng 09/2026 tạo tham số 31/08 và 29/09 thay vì 01/09 và 30/09. SQL summary trong repo lại nhận DATE, không nhận timezone người dùng.  
**Ảnh hưởng →** giao dịch cuối tháng có thể bị bỏ, giao dịch tháng trước bị cộng; Dashboard và Báo cáo không đối chiếu được.  
**Mức độ → High · P0.**  
**Đề xuất →** dùng chung khoảng [đầu kỳ, đầu kỳ kế tiếp) theo múi giờ hồ sơ, truyền timestamp nhất quán. Kiểm chứng bằng giao dịch sát 00:00 ngày đầu/cuối tháng.  
**Bằng chứng →** [DashboardPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx:54>), [20260730000003_m1_rpc_functions.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000003_m1_rpc_functions.sql:407>). Sai tham số frontend là chắc chắn; hàm summary trên remote chưa được đối chiếu định nghĩa.

### F02 — Chi bằng thẻ tín dụng có thể làm tổng tài sản tăng
**Vấn đề →** RPC thủ công ghi expense thành entry âm cho mọi loại tài khoản; `calculate_net_worth` lại đổi dấu số dư tài khoản credit_card.  
**Ảnh hưởng →** với thẻ mở đầu bằng 0, chi 1 triệu tạo số dư -1 triệu nhưng được cộng +1 triệu vào tổng tài sản theo SQL hiện có. Chỉ tiêu quan trọng đi ngược bản chất nghiệp vụ.  
**Mức độ → High · P0.**  
**Đề xuất →** thống nhất biểu diễn dư nợ: chọn số dư có dấu hoặc số nợ dương và áp dụng xuyên suốt ghi chi, hoàn tiền, thanh toán thẻ, tổng tài sản.  
**Bằng chứng →** [20260730000003_m1_rpc_functions.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000003_m1_rpc_functions.sql:71>), [20260730000001_m1_core_tables.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000001_m1_core_tables.sql:446>). Cần chạy lại trên backend triển khai để xác nhận định nghĩa đang có.

### F03 — Ngân sách “Ăn uống” thực tế cộng toàn bộ chi tiêu
**Vấn đề →** form gợi ý tên “Ăn uống tháng này” nhưng không chọn danh mục; createBudget chỉ tạo ngân sách, không tạo budget_categories. SQL coi ngân sách không gắn danh mục là toàn bộ expense.  
**Ảnh hưởng →** mua đồ điện tử cũng làm vượt “Ăn uống”; nhiều ngân sách có cùng số đã chi dù tên khác nhau.  
**Mức độ → High · P0.**  
**Đề xuất →** bắt buộc chọn “Toàn bộ chi tiêu” hoặc danh mục; tổng hợp cha/con và cả danh mục hệ thống; công khai phạm vi ngay trên thẻ.  
**Bằng chứng →** [BudgetsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/BudgetsPage.tsx:25>), [20260801000001_m3_budgets_goals_recurring.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260801000001_m3_budgets_goals_recurring.sql:320>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:736>).

### F04 — Lỗi tải ngân sách bị trình bày thành chi tiêu bằng 0
**Vấn đề →** lỗi từng getBudgetProgress bị nuốt; UI thay undefined bằng 0. Phần trăm hiển thị còn bị giới hạn 150% dù thực tế có thể 300%.  
**Ảnh hưởng →** người dùng được báo sai là chưa chi hoặc đánh giá thấp mức vượt ngân sách.  
**Mức độ → High · P0.**  
**Đề xuất →** hiển thị “Không tải được”, retry riêng từng ngân sách; chỉ giới hạn chiều dài thanh tiến độ, giữ nguyên phần trăm thực.  
**Bằng chứng →** [BudgetsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/BudgetsPage.tsx:95>), [BudgetsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/BudgetsPage.tsx:195>).

### F05 — Danh sách “Tất cả” chỉ có 200 giao dịch gần nhất
**Vấn đề →** tải limit 200 rồi lọc phía client, không phân trang/tải tiếp. listTransactions chỉ lấy posted.  
**Ảnh hưởng →** người dùng lâu năm không tìm thấy giao dịch cũ; bộ lọc cho kết quả thiếu; không thể tự xem lại giao dịch đã hủy. Đây là thiếu hiển thị, không phải chứng cứ DB đã xóa dữ liệu.  
**Mức độ → High · P0.**  
**Đề xuất →** phân trang và lọc server-side; thêm tìm theo nội dung/khoảng ngày, tổng số kết quả và trạng thái đã hủy.  
**Bằng chứng →** [TransactionsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx:155>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:330>).

### F06 — Biểu đồ danh mục không đại diện đầy đủ chi tiêu
**Vấn đề →** lấy 500 expense, bỏ giao dịch không có danh mục, chỉ giữ top 8 mà không gom phần còn lại. Heatmap cũng giới hạn 1.000 giao dịch.  
**Ảnh hưởng →** tổng biểu đồ không khớp KPI; khoản chưa phân loại biến mất thay vì nhắc người dùng xử lý. Tỷ trọng pie là tỷ trọng tập bị cắt.  
**Mức độ → High · P0.**  
**Đề xuất →** tổng hợp đủ dữ liệu tại DB; có “Chưa phân loại”, “Các danh mục khác”; drill-down phân trang và đối chiếu tổng.  
**Bằng chứng →** [ReportsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx:271>), [ReportsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx:357>).

### F07 — Đơn vị trục Y sai 100 lần so với chú thích
**Vấn đề →** dữ liệu là VND ×100; tick chia 100.000 nhưng chú thích ghi đơn vị ×100.000 ₫.  
**Ảnh hưởng →** khoản 1 triệu đồng có raw 100 triệu, tick thành 1.000; theo chú thích người xem có thể đọc thành 100 triệu đồng. Tooltip formatVND vẫn đúng nên hai cách đọc mâu thuẫn.  
**Mức độ → High · P0.**  
**Đề xuất →** chuyển minor sang VND trước khi vẽ; dùng đơn vị nghìn/triệu đồng thống nhất cả tick, tooltip và chú thích.  
**Bằng chứng →** [ReportsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx:545>), [format.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/format.ts:32>).

### F08 — Tạo nợ và hoàn trả không thống nhất với sổ tiền
**Vấn đề →** tạo nợ chỉ tạo bản ghi công nợ, không chọn tài khoản/ghi giải ngân. Trong DebtDetailModal, đi vay gọi markDebtPaid trực tiếp; chỉ nhánh cho vay mở PaymentModal.  
**Ảnh hưởng →** người dùng không biết đây là khai báo nợ cũ hay khoản mới; nhánh đi vay không có thao tác trả một phần/chọn ví như nhánh cho vay. API markDebtPaid có mặt trên remote theo test, nhưng repo thiếu định nghĩa nên chưa kết luận tác dụng tiền của RPC đó.  
**Mức độ → High · P0.**  
**Đề xuất →** tách “Nợ có sẵn” và “Vay/cho vay mới”; dùng chung flow thanh toán cả hai chiều, chọn tài khoản, ngày và số tiền. Liên kết từng payment với giao dịch.  
**Bằng chứng →** [DebtFormModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/DebtFormModal.tsx:53>), [20260803000003_m7_fix_create_debt_counterparty.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260803000003_m7_fix_create_debt_counterparty.sql:9>), [DebtDetailModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/DebtDetailModal.tsx:65>).

### F09 — Thu hồi gốc vay bị tính là thu nhập
**Vấn đề →** PaymentModal tạo income khi thu hồi cho vay; nhánh borrow của component tạo expense. Summary cộng mọi income/expense. Tổng tài sản chỉ cộng tài khoản, không tính công nợ độc lập.  
**Ảnh hưởng →** thu hồi 2 triệu gốc vay làm “thu nhập” tăng 2 triệu; phần chi hộ và hoàn trả có thể phóng đại cả thu lẫn chi. Người dùng khó đánh giá mức sống và khả năng tiết kiệm.  
**Mức độ → High · P0.**  
**Đề xuất →** phân biệt dòng tiền với thu nhập/chi tiêu tiêu dùng; tách gốc và lãi/phí. Dashboard ghi rõ “Tổng số dư tài khoản” nếu chưa tính đầy đủ tài sản và nghĩa vụ.  
**Bằng chứng →** [PaymentModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/PaymentModal.tsx:69>), [20260730000001_m1_core_tables.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000001_m1_core_tables.sql:446>), [20260730000003_m1_rpc_functions.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000003_m1_rpc_functions.sql:407>). Nhánh borrow trong PaymentModal không phải đường đi hiện tại từ DebtDetailModal.

### F10 — Thanh toán công nợ có thể thành công dở dang
**Vấn đề →** PaymentModal ghi payment rồi tạo giao dịch bằng hai request; rollback gồm nhiều request và không kiểm tra đầy đủ lỗi. Form “trả hộ” còn ghi chi → thu → payment, không rollback toàn bộ khi bước sau lỗi. Các giao dịch được tạo không có liên kết payment rõ ràng để hủy đồng bộ.  
**Ảnh hưởng →** mạng lỗi hoặc người dùng thử lại có thể khiến nợ giảm mà tiền chưa cập nhật, hoặc giao dịch trùng; hủy giao dịch tiền không tự đảo thanh toán.  
**Mức độ → High · P0.**  
**Đề xuất →** một RPC nguyên tử cho nghiệp vụ, khóa chống ghi đồng thời, khóa idempotency giữ nguyên khi retry; liên kết và đảo nghiệp vụ theo nhóm.  
**Bằng chứng →** [PaymentModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/PaymentModal.tsx:69>), [TransactionsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx:1150>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:402>).

### F11 — OCR lỗi một dòng có thể gắn bill nhầm giao dịch
**Vấn đề →** flatTxIds chỉ chứa ID lưu thành công, nhưng offset tính theo toàn bộ dòng gốc. Tạo khoản chia tiền cũng không kiểm tra giao dịch tương ứng có lưu thành công không.  
**Ảnh hưởng →** ví dụ A thất bại, B thành công: bill của A có thể dùng ID B; khoản phải thu có thể được tạo dù khoản chi thất bại. Đây là lỗi ánh xạ có thể suy ra trực tiếp từ code.  
**Mức độ → High · P0.**  
**Đề xuất →** giữ ánh xạ rowId → kết quả transaction(s) thay vì nén mảng ID; bill/nợ chỉ tạo sau thành công tương ứng và cùng transaction DB khi có thể.  
**Bằng chứng →** [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:444>), [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:513>).

### F12 — Import một phần thiếu đường sửa và chống nhập trùng
**Vấn đề →** chỉ cần có một success và không chờ bill, modal đóng cả khi còn dòng lỗi. Lần import sau tạo UUID mới; không có nhận diện cùng ảnh/cùng giao dịch đã nhập.  
**Ảnh hưởng →** người dùng phải chọn ảnh và xử lý lại; có nguy cơ nhập lại cả phần đã thành công.  
**Mức độ → High · P1.**  
**Đề xuất →** màn hình kết quả từng dòng, giữ các dòng lỗi, chỉ retry phần chưa lưu; khóa idempotency theo batch/row và cảnh báo giao dịch nghi trùng.  
**Bằng chứng →** [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:429>), [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:552>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:467>).

### F13 — OCR bill tự đoán đơn vị tiền từ độ lớn
**Vấn đề →** schema tự nhân 100 với unit_price/line_total nhỏ hơn 100.000 và total nhỏ hơn 1.000.000, trong khi hợp đồng AI đã là minor.  
**Ảnh hưởng →** total đúng 500.000 minor = 5.000 ₫ bị đổi thành 50.000.000 minor = 500.000 ₫. Giá lớn AI trả nhầm VND lại có thể không được sửa. Warning không thể thay thế hợp đồng đơn vị đúng.  
**Mức độ → High · P0.**  
**Đề xuất →** một đơn vị duy nhất trong schema và prompt, không tự suy đoán theo ngưỡng; nếu nghi sai, yêu cầu đối chiếu ảnh. Chưa chứng minh lỗi này tự đổi số tiền transaction, nhưng bill và chi tiết hàng hóa có thể sai.  
**Bằng chứng →** [billOcrSchema.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/billOcrSchema.ts:23>), [billOcr.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/billOcr.ts:216>).

### F14 — Khóa OCR nằm ở frontend, luồng chưa giải thích việc gửi ảnh ra ngoài
**Vấn đề →** VITE_GEMINI_API_KEY được client đọc và gọi Gemini trực tiếp. Trong luồng upload bình thường chưa thấy thông báo rõ bên xử lý ảnh; Worker không làm proxy OCR.  
**Ảnh hưởng →** khóa có thể bị trích từ bundle/network, ảnh hưởng hạn mức/chi phí/dịch vụ; người dùng không hiểu ảnh sao kê được gửi đi đâu. Không kết luận có sự cố lộ dữ liệu đã xảy ra.  
**Mức độ → High · P0 trước phát hành OCR công khai.**  
**Đề xuất →** backend có xác thực/hạn mức, giữ khóa ở server; nêu rõ xử lý ảnh ngay trước khi gửi và quy tắc lưu/xóa. Kiểm tra, thay khóa đã được đưa vào build công khai.  
**Bằng chứng →** [config.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/config.ts:50>), [ocr.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/ocr.ts:1>), [index.js](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/_worker.js/index.js:4>).

### F15 — Định kỳ có lời hứa tự động nhưng chưa có bằng chứng scheduler
**Vấn đề →** UI ghi “Tự động sinh giao dịch khi đến hạn”; nơi gọi materializeRecurring tìm thấy là nút “Sinh ngay”. SQL chỉ cộng interval, không dùng day_of_month; sửa start_date không cập nhật next_occurrence.  
**Ảnh hưởng →** người dùng nghĩ chi phí đã ghi tự động nhưng có thể chưa có; ngày chọn không chi phối lịch như mô tả. Quy tắc có thể ghi khoản chưa thực trả thành posted.  
**Mức độ → High · P1.**  
**Đề xuất →** xác minh scheduler remote; nếu chưa có, nói đúng hành vi. Thực hiện lịch theo ngày người dùng chọn, preview lần tới, phân biệt “đến hạn”/“đã ghi nhận”; chặn sinh trùng khi chạy đồng thời.  
**Bằng chứng →** [RecurringPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/RecurringPage.tsx:137>), [20260801000001_m3_budgets_goals_recurring.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260801000001_m3_budgets_goals_recurring.sql:373>). Không kết luận chắc chắn remote không có cron chỉ vì repo chưa có.

### F16 — Mục tiêu gắn ví nhưng chỉ là bộ đếm; rút tiền không nhập được
**Vấn đề →** linked_account_id được lưu nhưng addGoalContribution từ frontend không yêu cầu tạo giao dịch; SQL mặc định false. UI ghi “âm = rút” nhưng VNDInput gọi digitsOnly, loại dấu trừ.  
**Ảnh hưởng →** người dùng tưởng đã chuyển/cất tiền trong ví; không thể giảm tiến độ bằng cách nhập âm như hướng dẫn.  
**Mức độ → High · P1.**  
**Đề xuất →** hai nút “Thêm”/“Rút” với số tiền dương; ghi rõ đây là phân bổ theo dõi hay chuyển tiền thực; cho xem lịch sử đóng góp. Nếu liên kết ví thì không được phân bổ vượt tiền khả dụng mà không cảnh báo.  
**Bằng chứng →** [GoalsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/GoalsPage.tsx:500>), [20260801000001_m3_budgets_goals_recurring.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260801000001_m3_budgets_goals_recurring.sql:225>), [VNDInput.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/VNDInput.tsx:84>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:706>).

### F17 — Ngân sách thiếu quản lý vòng đời và kỳ thực tế
**Vấn đề →** UI chỉ tạo/xem; không sửa/dừng/xóa. Tuần/tháng luôn dùng kỳ hiện tại, không kẹp theo start/end; kỳ tùy chỉnh có end dùng mốc đầu ngày trong điều kiện loại trừ.  
**Ảnh hưởng →** nhập nhầm giới hạn không sửa được; ngân sách bắt đầu giữa tháng vẫn có thể tính giao dịch trước ngày bắt đầu; ngày kết thúc tùy chỉnh có thể bị bỏ.  
**Mức độ → Medium · P1.**  
**Đề xuất →** sửa/dừng/lưu trữ, hiển thị ngày kỳ đang tính; quy định rõ kỳ lịch hay kỳ cá nhân, ngày cuối inclusive trên UI.  
**Bằng chứng →** [BudgetsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/BudgetsPage.tsx:25>), [20260801000001_m3_budgets_goals_recurring.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260801000001_m3_budgets_goals_recurring.sql:320>).

### F18 — Onboarding chưa dẫn người mới tới giá trị đầu tiên
**Vấn đề →** đăng ký chuyển Dashboard; không có flow tạo ví → số dư đầu → chi đầu. onBoarding_completed chỉ được bật khi lưu cài đặt. Chưa có route quên mật khẩu/gửi lại xác nhận; màn xác nhận tự rời sau 4 giây.  
**Ảnh hưởng →** người mới đối mặt với nhiều chức năng trước khi thấy lợi ích; có thể mở form giao dịch không có tài khoản và phải quay ra tự tạo; người quên mật khẩu bị kẹt.  
**Mức độ → High · P1.**  
**Đề xuất →** onboarding ngắn 2–3 bước có bỏ qua, tạo ví tại chỗ, phục hồi mật khẩu và gửi lại email. Giữ màn hướng dẫn xác nhận cho tới khi người dùng chủ động rời.  
**Bằng chứng →** [SignupPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/SignupPage.tsx:10>), [App.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/App.tsx:31>), [SettingsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/SettingsPage.tsx:12>), [DashboardPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx:54>).

### F19 — Nhập chi thường xuyên chưa được ưu tiên đúng
**Vấn đề →** Dashboard “Giao dịch mới” chỉ điều hướng; trang Giao dịch nhấn mạnh Chuyển khoản bằng btn-primary, nhập thu/chi dùng btn-secondary. Ví mặc định luôn accounts[0]; bill thủ công chỉ thêm khi sửa và đúng tên nhóm danh mục. Nhập OCR mua sắm lại bắt bổ sung kênh/cửa hàng dù người dùng chỉ muốn ghi chi.  
**Ảnh hưởng →** thao tác thường xuyên phải thêm bước; dễ lưu nhầm ví; việc giữ bill trở thành rào cản ghi sổ.  
**Mức độ → Medium · P1.**  
**Đề xuất →** CTA chung mở thẳng form chi; nhớ ví gần dùng; thu gọn trường phụ; ảnh/bill là phần tùy chọn ngay khi tạo, không dựa vào tên danh mục cứng.  
**Bằng chứng →** [DashboardPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx:54>), [TransactionsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx:338>), [TransactionsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx:1023>), [ReceiptImportModal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/ocr/ReceiptImportModal.tsx:366>).

### F20 — Bộ chọn thời gian không chi phối toàn bộ Báo cáo
**Vấn đề →** KPI/bar dùng range đã chọn; pie cố định tháng hiện tại và heatmap dùng tháng riêng. Pie có ghi “tháng này”, nên không phải hoàn toàn thiếu nhãn; nhưng bộ lọc đặt ở đầu trang dễ bị hiểu là toàn cục. Preset “Tháng” thực tế là 12 tháng, “Năm” là 5 năm.  
**Ảnh hưởng →** người dùng chọn năm ngoái nhưng vẫn thấy danh mục tháng này; khó so sánh cùng một kỳ.  
**Mức độ → Medium · P1.**  
**Đề xuất →** cùng kỳ cho tất cả khối hoặc tách bộ lọc từng khối rõ ràng; tên preset thể hiện đúng phạm vi.  
**Bằng chứng →** [ReportsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx:49>), [ReportsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/ReportsPage.tsx:271>).

### F21 — Dashboard thiếu câu trả lời “Tôi nên làm gì hôm nay?”
**Vấn đề →** chỉ có số dư, tổng thu/chi, tài khoản và giao dịch gần đây; chưa có ngân sách sắp vượt, giao dịch chưa phân loại, khoản đến hạn hay tiến độ mục tiêu. “Còn lại” là thu trừ chi tháng, không phải tiền khả dụng.  
**Ảnh hưởng →** người có số dư đầu kỳ lớn nhưng chưa nhận lương có thể thấy “còn lại” âm; người vừa nhận lương tưởng phần chênh lệch là số có thể chi tự do. Người dùng phải tự mở nhiều trang để ra quyết định.  
**Mức độ → Medium · P1.**  
**Đề xuất →** đổi nhãn thành “Chênh lệch thu–chi”; thêm tối đa ba việc cần chú ý từ dữ liệu đáng tin; chưa gọi số nào là “có thể chi” nếu chưa tính nghĩa vụ và tiền đã dành mục tiêu.  
**Bằng chứng →** [DashboardPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx:54>).

### F22 — Lưu trữ tài khoản làm thay đổi tổng tài sản mà thông báo chỉ nói “ẩn”
**Vấn đề →** xác nhận nói tài khoản bị ẩn và khôi phục trong DB; net-worth loại tài khoản archived. Danh sách tài khoản cũng chỉ tải chưa archived.  
**Ảnh hưởng →** lưu trữ ví còn 5 triệu làm tổng tài sản giảm 5 triệu dù không phát sinh chi; người dùng không tự khôi phục được.  
**Mức độ → High · P1.**  
**Đề xuất →** tách ẩn khỏi giao diện và loại khỏi tổng tài sản; cảnh báo số dư, đề nghị chuyển hết trước khi đóng; có danh sách lưu trữ/khôi phục.  
**Bằng chứng →** [AccountsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/AccountsPage.tsx:166>), [20260730000001_m1_core_tables.sql](<D:/Quản lý thu chi/Quan_ly_thu_chi/supabase/migrations/20260730000001_m1_core_tables.sql:446>).

### F23 — Cài đặt tiền tệ tạo kỳ vọng chưa được đáp ứng
**Vấn đề →** cho chọn USD/EUR/JPY/SGD/THB nhưng form/API chủ yếu hard-code VND, KPI formatVND và không có quy đổi.  
**Ảnh hưởng →** người dùng tưởng chọn USD sẽ thay đổi cách nhập/tổng hợp; app có thể tiếp tục hiển thị VND hoặc cộng số không cùng ngữ nghĩa.  
**Mức độ → Medium · P1.**  
**Đề xuất →** giới hạn rõ VND cho giai đoạn này; chỉ mở đa tiền tệ khi có hợp đồng đơn vị, tỷ giá và nguyên tắc tổng hợp đầy đủ.  
**Bằng chứng →** [SettingsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/SettingsPage.tsx:12>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:413>), [format.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/format.ts:32>).

### F24 — Dễ mất bản nhập; lịch sử chưa có lối xuất dữ liệu
**Vấn đề →** form chủ yếu giữ state trong component; modal đóng bằng click nền/Escape, không có bản nháp hoặc cảnh báo khi đã sửa. Trong các route và API hiện tại chưa thấy chức năng xuất giao dịch cho người dùng.  
**Ảnh hưởng →** nhập dài/OCR bị gián đoạn phải làm lại; khó kiểm tra dữ liệu ngoài app và tăng cảm giác phụ thuộc ứng dụng.  
**Mức độ → Medium · P1 cho bảo vệ bản nhập; P2 cho mở rộng import file.**  
**Đề xuất →** cảnh báo bỏ thay đổi, bản nháp phục hồi phù hợp tính riêng tư; xuất CSV theo kỳ có đủ ID, trạng thái, ví và danh mục.  
**Bằng chứng →** [Modal.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/Modal.tsx:44>), [TransactionsPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx:155>), [App.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/App.tsx:31>).

### F25 — Điều hướng mobile quá nhiều mục đồng cấp
**Vấn đề →** cả 11 mục sidebar được đưa vào thanh ngang phải cuộn ở mobile; không có hành động ghi chi cố định toàn app.  
**Ảnh hưởng →** tính năng ở cuối khó thấy; người dùng phải nhớ vị trí và di chuyển nhiều để ghi/xem số liệu. Đây là đánh giá heuristic từ layout, chưa phải kết quả đo usability trên thiết bị.  
**Mức độ → Medium · P2.**  
**Đề xuất →** 3–4 điểm vào thường dùng và “Thêm”; gộp quản trị danh mục/người quen vào ngữ cảnh nghiệp vụ, giữ CTA ghi chi dễ chạm.  
**Bằng chứng →** [AppLayout.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/AppLayout.tsx:29>), [AppLayout.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/components/AppLayout.tsx:184>).

### F26 — Phạm vi backend trong repo chưa tái tạo được đầy đủ
**Vấn đề →** có hai thư mục migration ở workspace; bản m9–m12 nằm ngoài repo con. Frontend dùng global_categories và tham số global_category_id nhưng chưa tìm thấy migration tạo nền tảng tương ứng; mark_debt_paid có trên backend theo test nhưng không có định nghĩa trong các migration đã liệt kê.  
**Ảnh hưởng →** team khó tái hiện lỗi và triển khai môi trường mới giống môi trường người dùng; sửa UX ở một nơi chưa chắc chạy ở nơi khác.  
**Mức độ → High · P1; là điều kiện kiểm chứng các P0.**  
**Đề xuất →** gom nguồn migration chuẩn, đối chiếu schema/RPC triển khai, chạy tạo DB sạch; tách unit test khỏi test tích hợp demo. Không suy ra backend hiện tại hỏng chỉ từ thiếu migration.  
**Bằng chứng →** [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:164>), [api.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/lib/api.ts:413>), [migration ngoài repo](<D:/Quản lý thu chi/supabase/migrations/20260809000001_m12_bills.sql>), [helpers.ts](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/test/helpers.ts:1>).

### F27 — Nhãn số lượng giao dịch gần đây không khớp
**Vấn đề →** Dashboard ghi “8 mục mới nhất” nhưng render recent.slice(0,6).  
**Ảnh hưởng →** bất nhất nhỏ, giảm cảm giác hoàn thiện.  
**Mức độ → Low · P2.**  
**Đề xuất →** dùng cùng một hằng số cho query, render và nhãn.  
**Bằng chứng →** [DashboardPage.tsx](<D:/Quản lý thu chi/Quan_ly_thu_chi/web/src/pages/DashboardPage.tsx:219>).

## 5. Tính năng thiếu hoặc nên cải thiện

Ưu tiên hoàn thiện giá trị đã hứa trước khi mở rộng danh sách chức năng:

| Nâng cấp có giá trị | Nhu cầu thực | Phạm vi tối thiểu |
|---|---|---|
| Khởi động nhanh | Ghi khoản chi đầu tiên mà không tự tìm cấu hình | Một ví + số dư hiện tại + một giao dịch; tạo ví ngay trong form |
| Ghi nhanh và phục hồi bản nhập | Ghi chi ngay sau thanh toán | Mở form một chạm, ví gần dùng, trường phụ thu gọn, bản nháp |
| Đối chiếu số liệu | Tin rằng các màn hình nói cùng một sự thật | Cùng kỳ, cùng trạng thái, cùng đơn vị; tổng danh mục = tổng chi |
| Vòng đời công nợ | Nhớ và thanh toán đúng khoản đã ứng/vay | Nợ cũ/mới, trả một phần, liên kết giao dịch, đảo nghiệp vụ |
| Kiểm soát ngân sách | Biết khoản nào sắp vượt và còn bao nhiêu | Phạm vi danh mục, sửa/dừng, số còn lại, danh sách khoản chi gây vượt |
| Theo dõi định kỳ và hạn trả | Không quên nghĩa vụ | Danh sách sắp đến hạn, xác nhận đã trả, nhắc theo lựa chọn người dùng |
| Xuất dữ liệu | Đối chiếu, sao lưu, chuyển ứng dụng | CSV giao dịch và công nợ với định nghĩa trường rõ ràng |

Chưa nên ưu tiên AI tư vấn tài chính, đồng bộ ngân hàng diện rộng, đầu tư, mạng xã hội, huy hiệu/streak hoặc thêm nhiều dashboard. Các chức năng đó không sửa được lỗi số tiền và độ tin cậy của quy trình hiện tại.

## 6. Đánh giá Retention

**Động lực quay lại đã có:** ghi chi mỗi ngày, kiểm tra số dư; cuối tuần xem heatmap; đầu/tháng kiểm tra ngân sách; khi nhận/trả tiền mở công nợ; theo dõi mục tiêu. OCR và quy tắc định kỳ có thể giảm công nhập liệu. Đây là tiềm năng sản phẩm, chưa có dữ liệu chứng minh retention thực tế.

**Điểm đứt hiện tại:**

- Công sức đầu vào cao: setup ví tách khỏi giao dịch, CTA qua thêm trang, mua sắm nhập ảnh yêu cầu thông tin phụ.
- Phần thưởng sau nhập còn yếu: chủ yếu thấy “đã lưu” và số tổng, chưa thấy “ngân sách ăn uống còn bao nhiêu”.
- Số liệu mâu thuẫn làm người dùng phải tự kiểm tra bằng công cụ khác.
- Ghi đủ lâu lại gặp giới hạn 200 giao dịch; người dùng gắn bó lâu chịu ảnh hưởng nhiều hơn.
- Quy tắc định kỳ chưa có bằng chứng tự động chạy; mục tiêu không phản ánh tiền thực, khó hình thành thói quen tin cậy.
- Dashboard không tổng hợp những việc đang chờ nên người dùng phải nhớ quay lại từng trang.

**Vòng sử dụng nên xây:** ghi một khoản → thấy số dư và ngân sách cập nhật đúng → biết việc cần xử lý tiếp → rà soát tuần ngắn. Thông báo chỉ nên gửi theo lựa chọn của người dùng, cho nghĩa vụ/biến động có ý nghĩa; không dùng thông báo để bù cho giá trị yếu.

**Đo sau khi sửa:** tỷ lệ tạo ví và giao dịch đầu trong phiên đầu; thời gian và tỷ lệ hoàn tất nhập thủ công; tỷ lệ OCR cần sửa/nhập lại; tỷ lệ đối chiếu số liệu thành công; người dùng ghi và rà soát qua nhiều tuần. Theo dõi retention tuần 1/4 trên cohort đã activation, tách người nhập tay và OCR. Không đặt mục tiêu số tùy tiện khi chưa có baseline; event analytics không cần lưu số tiền, tên đối tượng hay nội dung ảnh.

## 7. Ưu tiên phát triển

### P0: Cần sửa ngay

- F01/F02/F07: ngày, đơn vị tiền và cách tính thẻ tín dụng.
- F03/F04/F06: ngân sách đúng phạm vi, không biến lỗi thành số 0, báo cáo không bỏ dữ liệu.
- F05: truy cập đầy đủ lịch sử giao dịch.
- F08/F09/F10: mô hình công nợ và cập nhật tiền/nợ nguyên tử; tránh ghi sai thu nhập.
- F11/F13: OCR không gắn nhầm dữ liệu, không tự đổi đơn vị theo độ lớn.
- F14: bảo vệ khóa trước khi mở OCR công khai.

**Điều kiện nghiệm thu:** các màn hình đối chiếu được trên cùng một tập giao dịch; chi thẻ làm tài sản ròng thay đổi đúng; thanh toán thất bại không để lại một nửa nghiệp vụ; batch OCR A lỗi/B thành công không gắn bill/nợ của A sang B; giao dịch số 201 vẫn tìm được.

### P1: Quan trọng

- F12: kết quả import từng dòng và retry an toàn.
- F15/F16/F17: hoàn thiện định kỳ, thêm/rút mục tiêu, sửa/dừng ngân sách.
- F18/F19: activation và ghi nhanh.
- F20/F21: một kỳ báo cáo rõ ràng, Dashboard đưa ra việc cần làm.
- F22/F23/F24: lưu trữ có phục hồi, tiền tệ đúng khả năng, giữ bản nhập và xuất dữ liệu.
- F26: nguồn migration và kiểm tra môi trường tái lập.

**Điều kiện nghiệm thu:** người mới tạo ví và ghi chi không phải tự đi tìm chức năng; thao tác lưu/thử lại không tạo trùng; đổi kỳ áp dụng đúng nhãn; không quảng bá hành vi tự động chưa vận hành.

### P2: Có thể làm sau

- F25/F27: điều hướng mobile gọn hơn và bất nhất nhỏ.
- So sánh kỳ trước, gợi ý mức đóng góp mục tiêu, mẫu giao dịch hay dùng.
- Import CSV có ánh xạ cột/chống trùng, sau khi xuất dữ liệu và ledger đã ổn định.

## 8. Kết luận

Chấm theo khả năng hỗ trợ người dùng phổ thông, tính đúng nghiệp vụ, công sức thao tác và vòng sử dụng thực tế; không lấy số lượng màn hình làm độ hoàn thiện. Điểm UX là đánh giá heuristic từ code; retention là tiềm năng, không phải tỷ lệ đo được.

| Tiêu chí | Điểm /10 | Lý do |
|---|---:|---|
| Feature completeness | 6,5 | Bao phủ rộng nhưng ngân sách, công nợ, mục tiêu và định kỳ thiếu vòng đời/liên kết |
| UX | 5,5 | Có component, feedback và nhập tiền tốt; còn nhiều bước phụ, nguy cơ mất bản nhập và lựa chọn gây hiểu sai |
| User flow | 5,0 | Luồng cơ bản chạy theo cấu trúc code nhưng các nhánh liên chức năng thiếu nhất quán |
| Product value | 6,0 | Sổ thu chi + OCR + công nợ hữu ích; lỗi số liệu làm giảm khả năng tin dùng |
| Retention potential | 5,5 | Có nhu cầu lặp lại tự nhiên nhưng vòng nhập → hiểu → hành động chưa hoàn chỉnh |

**Đánh giá chung: 5,7/10.** Có nền tảng để thành công cụ cá nhân hữu ích; chưa nên xem bản hiện tại là nguồn số liệu tài chính duy nhất trước khi xử lý P0.

**5 việc quan trọng nhất team nên làm tiếp theo:**

1. **Chuẩn hóa một nguồn tính số liệu:** đơn vị tiền, dấu số dư, múi giờ, trạng thái giao dịch; sửa thẻ tín dụng, trục Y và đối chiếu Dashboard–Reports–Budgets.
2. **Sửa nghiệp vụ công nợ end-to-end:** nợ cũ/mới, gốc/lãi, trả hai chiều, liên kết payment–transaction và lưu/đảo nguyên tử.
3. **Làm OCR an toàn khi lưu một phần:** mapping theo row ID, bỏ suy đoán đơn vị, giữ dòng lỗi, chống nhập trùng và đưa khóa ra server.
4. **Rút ngắn hành trình từ mở app tới ghi chi:** onboarding ngắn, CTA mở thẳng form, tạo ví tại chỗ, nhớ ví gần dùng, bill tùy chọn và bảo vệ bản nháp.
5. **Hoàn thiện vòng kiểm soát tài chính:** lịch sử đầy đủ, ngân sách có phạm vi/sửa/dừng, định kỳ đúng lịch; Dashboard chỉ ra ngân sách sắp vượt và khoản đến hạn từ dữ liệu đã kiểm chứng.
