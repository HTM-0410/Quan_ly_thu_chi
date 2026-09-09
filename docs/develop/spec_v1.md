# Spec v1 — Cải thiện độ tin cậy và trải nghiệm Quản lý thu chi

- Ngày: 07/09/2026.
- Trạng thái: **DRAFT — CHỜ NGƯỜI DÙNG XÁC NHẬN MỘT LẦN**.
- Vai trò: Product specification + backlog triển khai + tiêu chí nghiệm thu.
- Root project: `D:/Quản lý thu chi`; source ứng dụng: `Quan_ly_thu_chi/web`.
- Nguồn: [Product / UX Audit](<D:/Quản lý thu chi/Quan_ly_thu_chi/docs/PRODUCT_UX_AUDIT_2026-09-07.md>).
- F01–F27 bên dưới tham chiếu đúng mã vấn đề trong audit.
- Việc viết spec đã được yêu cầu. Các phương án sửa trong spec là đề xuất, **chưa được duyệt và chưa triển khai**.

## 1. Mục tiêu và giới hạn

### 1.1. Mục tiêu

1. Người dùng đối chiếu được giao dịch, số dư, ngân sách và báo cáo.
2. Lỗi mạng/thử lại không tạo bản ghi trùng, thiếu một nửa nghiệp vụ hoặc gắn sai bill.
3. Người mới tạo ví và ghi khoản đầu tiên theo một luồng liền mạch.
4. Nhập thu/chi hằng ngày nhanh, có bảo vệ dữ liệu đang nhập.
5. Ngân sách, công nợ, mục tiêu và định kỳ có vòng đời rõ ràng.
6. Dashboard giúp nhận biết việc cần xử lý từ dữ liệu đáng tin.

### 1.2. Không nằm trong v1

Đồng bộ ngân hàng diện rộng, đầu tư, AI tư vấn tài chính, mạng xã hội, streak/huy hiệu, đa tiền tệ có quy đổi và app native. Không đổi đơn vị lưu tiền hàng loạt chỉ để sửa giao diện.

Spec không tự cho phép chỉnh dữ liệu tài chính lịch sử, gọi OCR trả phí, chạy test ghi vào tài khoản demo, apply migration remote hoặc deploy. Các bước này có phạm vi riêng trong mục xác nhận.

### 1.3. Độ chắc chắn của hiện trạng

- Đã xác nhận cục bộ: lệch biên tháng UTC+7; trục biểu đồ sai đơn vị; schema bill nhân lại số đã là minor; input loại dấu âm; giới hạn/lọc dữ liệu trong frontend.
- Đã thấy trong code: ngân sách không chọn danh mục; payment và giao dịch dùng nhiều request; OCR ánh xạ sai khi một phần thất bại; luồng borrow bỏ qua PaymentModal.
- Cần đối chiếu backend trước thiết kế migration: định nghĩa RPC đang triển khai, quy ước số dư thẻ, global categories, scheduler định kỳ, mark_debt_paid.
- Chưa có E2E browser toàn hành trình hoặc baseline activation/retention.
- Audit trước ghi nhận build đạt, test 79/89 đạt; đó không phải kết quả chạy lại trong lượt viết spec này.

## 2. Phân tích điểm yếu hiện tại

| Nhóm | Điểm yếu và tác động | Mức độ | Audit | Hướng xử lý |
|---|---|---|---|---|
| Số liệu | Biên tháng lệch, trục Y sai đơn vị, credit card có thể đảo dấu sai | High | F01, F02, F07 | Chung hợp đồng tiền/ngày/số dư |
| Ngân sách | Tên như “Ăn uống” nhưng cộng mọi expense; lỗi tải hiện 0; thiếu sửa/dừng và kỳ đúng | High/Medium | F03, F04, F17 | Chọn phạm vi, trạng thái lỗi riêng, vòng đời đầy đủ |
| Lịch sử | “Tất cả” chỉ có 200 giao dịch; không xem lại đã hủy | High | F05 | Query server-side, phân trang, trạng thái |
| Báo cáo | Cắt 500/1.000 dòng, bỏ chưa phân loại/top ngoài 8; các khối dùng kỳ khác nhau | High/Medium | F06, F20 | Aggregate đầy đủ, chung bộ lọc |
| Công nợ | Khai báo nợ và giải ngân lẫn nhau; trả hai chiều khác flow; gốc vay thành income | High | F08, F09 | Tách nghiệp vụ nợ, cashflow và thu nhập thực |
| Tính toàn vẹn | Ghi payment/giao dịch rời rạc; rollback không chắc; retry không ổn định | High | F10 | Một nghiệp vụ DB nguyên tử, có liên kết và idempotency |
| OCR | Sai ánh xạ bill/nợ khi lưu lỗi; mất dòng lỗi; đoán đơn vị; khóa ở client | High | F11–F14 | Row ID ổn định, retry từng dòng, chuẩn đơn vị, proxy backend |
| Định kỳ | Chưa chứng minh chạy tự động; day_of_month không điều khiển lịch SQL | High | F15 | Preview lịch, trạng thái đến hạn, chống sinh trùng |
| Mục tiêu | Ví liên kết chỉ là metadata; không nhập rút âm được | High | F16 | Làm rõ phân bổ tiền; thêm/rút bằng lựa chọn riêng |
| Activation | Chưa dẫn tới ví/giao dịch đầu, thiếu khôi phục mật khẩu | High | F18 | Onboarding ngắn, phục hồi tài khoản |
| Ghi nhanh | CTA thêm bước, ưu tiên chuyển khoản, bill có trường bắt buộc không cần thiết | Medium | F19 | Mở thẳng form, nhớ ví, bill tùy chọn |
| Giá trị hằng ngày | “Còn lại” dễ bị hiểu là tiền có thể chi; thiếu việc cần chú ý | Medium | F21 | Nhãn đúng và hành động có căn cứ |
| Tài khoản | Lưu trữ làm tổng thay đổi nhưng chỉ thông báo ẩn; không tự khôi phục | High | F22 | Tách ẩn, đóng và phạm vi tổng hợp |
| Cài đặt | Cho đổi tiền tệ nhưng nghiệp vụ vẫn VND | Medium | F23 | VND-only có thông báo rõ |
| Dữ liệu đang nhập | Đóng modal có thể mất nội dung; chưa có xuất dữ liệu | Medium | F24 | Cảnh báo mất thay đổi, export |
| Điều hướng | 11 mục ngang mobile; nhãn 8 giao dịch render 6 | Medium/Low | F25, F27 | Ưu tiên tác vụ thường dùng, sửa bất nhất |
| Khả năng tái lập | Migration phân tán/thiếu; npm test trộn test ghi remote | High | F26 | Baseline schema chuẩn và môi trường test riêng |

## 3. Các quyết định cần xác nhận — một lượt duy nhất

**Cách duyệt:** người dùng có thể trả lời “Đồng ý toàn bộ D01–D09” hoặc liệt kê mã cần đổi cùng phương án muốn dùng. Không suy diễn im lặng là đồng ý. Các chi tiết kỹ thuật giữ đúng quyết định đã duyệt không cần hỏi lại.

| Mã | Phương án đề xuất cần duyệt | Tác động / lựa chọn khác |
|---|---|---|
| D01 — Phạm vi v1 | Làm P0 và P1 theo thứ tự trong spec; P2 chỉ ghi backlog. V1 chỉ hỗ trợ VND, giữ lưu trữ VND ×100, lấy timezone hồ sơ làm chuẩn; tuần bắt đầu thứ Hai. | Nếu muốn đa tiền tệ, tuần Chủ nhật hoặc chỉ P0, cần ghi rõ ngay trong lượt duyệt. |
| D02 — Sổ tiền và công nợ | Số dư có dấu: tài sản dương, dư nợ thẻ âm. Tách gốc vay/hoàn gốc khỏi thu nhập và chi tiêu tiêu dùng; lãi/phí vẫn là thu/chi. Tách “nợ có sẵn” với “vay/cho vay mới”; trả một phần/toàn bộ cả hai chiều. | Báo cáo mới phản ánh tiêu dùng thực; số thu/chi có thể khác cách cũ. Không tự phân loại lại lịch sử nếu thiếu chứng cứ. |
| D03 — Ngân sách và báo cáo | Ngân sách chọn “Toàn bộ” hoặc danh mục; chọn cha bao gồm con, không cộng trùng. Cùng kỳ cho KPI, pie và heatmap; thêm nhóm chưa phân loại và phần còn lại. | Các ngân sách cũ không có danh mục vẫn giữ phạm vi toàn bộ, gắn nhãn để người dùng sửa; không đoán từ tên. |
| D04 — Định kỳ | Mặc định tạo khoản “đến hạn/chờ xác nhận”, chỉ ảnh hưởng số dư sau xác nhận đã nhận/trả. Cho bật tự ghi sổ riêng từng quy tắc sau khi scheduler và chống trùng được kiểm chứng. | Khác lời hứa tự động hiện tại. Nếu muốn tất cả tự ghi sổ ngay đến hạn, cần đổi quyết định này. Quy tắc cũ không bị chuyển chế độ âm thầm. |
| D05 — Mục tiêu | V1 là phân bổ tiền để theo dõi, không tự chuyển giữa các ví. Dùng nút “Thêm tiền”/“Rút tiền”, lịch sử và liên kết ví có nhãn rõ; không tính phân bổ thành expense. | Nếu muốn chuyển tiền thật sang ví tiết kiệm mỗi lần đóng góp, cần mở thêm flow chọn ví nguồn/đích và nghiệm thu chuyển khoản. |
| D06 — Onboarding và thao tác | Onboarding ví → số dư → giao dịch đầu, có bỏ qua. CTA mở form chi ngay; nhớ ví gần dùng; bill/kênh/cửa hàng là tùy chọn khi ghi chi. Cho xem trạng thái đã hủy và xuất CSV. | V1 giữ form bằng cảnh báo bỏ thay đổi; chưa lưu bản nháp tài chính bền vững vào localStorage. Bản nháp qua reload để P2. |
| D07 — OCR | Tiếp tục dùng Gemini qua backend có auth/hạn mức; khóa không ở client. Chỉ gửi ảnh sau thao tác chủ động và thông báo; không lưu ảnh gốc mặc định. Preview bắt buộc, retry từng dòng, không đoán đơn vị và không tự ghi nợ nếu giao dịch thất bại. | Nếu không muốn gửi ảnh sang Gemini, chọn tạm tắt OCR trong v1. Hạn mức và môi trường khóa là cấu hình vận hành, chưa có quyền phát sinh chi phí mới. |
| D08 — Tài khoản và Dashboard | Tách ẩn ví khỏi loại trừ số liệu; đóng ví yêu cầu xử lý số dư, có khôi phục. Dùng nhãn “Tổng số dư tài khoản” và “Chênh lệch thu–chi”; chưa công bố “Tiền có thể chi”. Thêm tối đa 3 việc cần chú ý. | Tránh hứa hẹn chỉ số tài chính chưa đủ dữ liệu. Chỉ hiển thị tài sản ròng khi đã đối chiếu được tài khoản và công nợ không trùng. |
| D09 — Quyền thực hiện sau duyệt | Xác nhận spec cho phép triển khai local, viết migration và test trên môi trường cô lập. Mặc định **không apply DB remote, không sửa dữ liệu lịch sử, không deploy/commit/push**. | Nếu muốn cấp thêm quyền ngay một lần, ghi rõ môi trường/project được phép và hành động. Không dùng quyền duyệt spec để tự suy ra quyền live-write. |

### 3.1. Nhật ký quyết định

| Trường | Giá trị |
|---|---|
| Người xác nhận | Người dùng (Homeowner) |
| Thời điểm | 2026-09-07T15:25:24+07:00 |
| Mã được duyệt | **ĐỒNG Ý TOÀN BỘ D01–D09, BLUEPRINT v1 & TASK GRAPH v1** |
| Ngoại lệ / thay đổi | Không có |
| Quyền môi trường | Local development, viết migration, test cô lập (D09). Không remote/deploy/live. |
| Trạng thái triển khai | **ĐÃ DUYỆT — ĐANG TRIỂN KHAI LIÊN TỤC** |

Sau khi nhận trả lời, cập nhật đúng quyết định người dùng vào bảng này rồi mới thực hiện công việc tương ứng. Nếu gặp điều kiện chưa được cấp quyền, hoàn tất phần local và ghi blocked cho phần live, không hỏi lặp lại các quyết định đã duyệt.

## 4. Hợp đồng nghiệp vụ đề xuất

Toàn bộ mục này phụ thuộc D01–D08 được duyệt.

### 4.1. Tiền, ngày và trạng thái

- Tiền lưu số nguyên minor, 100 minor = 1 VND; biên API kiểm tra giới hạn số nguyên an toàn. UI nhập VND và chuyển đổi đúng một lần.
- Giao dịch thường nhập số tiền dương; chiều thu/chi quyết định dấu entries. Không dùng dấu người dùng gõ để suy đoán loại nghiệp vụ.
- Khoảng query là [start, endExclusive) trong UTC, được dựng từ ngày người dùng chọn theo timezone hồ sơ. UI thể hiện ngày cuối bao gồm cả ngày.
- Thay timezone đổi cách nhóm ngày, không đổi timestamp đã lưu.
- Chỉ posted ảnh hưởng số dư/thống kê đã thực hiện. Pending và voided vẫn tra cứu được nhưng không cộng vào thực tế.
- Tổng hợp đầy đủ ở server; phân trang chỉ ảnh hưởng danh sách hiển thị, không cắt dữ liệu tính tổng.
- Không biến loading/error thành số 0. Giá trị 0 chỉ xuất hiện khi request thành công và kết quả thực là 0.

### 4.2. Thu chi, chuyển khoản, công nợ

- Chuyển nội bộ không tăng income/expense; phí chuyển là expense riêng, thuộc cùng nhóm nghiệp vụ để đảo đúng.
- Số dư thẻ âm biểu diễn đang nợ; không đổi dấu lần nữa khi cộng số dư có dấu.
- Nợ cũ: ghi opening debt, không tự tạo cashflow tại ngày khai báo.
- Vay/cho vay mới: một lần lưu tạo debt và entries tiền tương ứng.
- Thanh toán: một lần lưu cập nhật payment, remaining và entries; trả vượt bị chặn trong DB, kể cả hai request đồng thời.
- Principal repayment không được coi là thu nhập/tiêu dùng. Phần chi hộ được tách khỏi phần người dùng thực chi khi có khai báo rõ.
- Mỗi nghiệp vụ có ID ổn định và quan hệ tới giao dịch/payment; retry cùng ID trả kết quả cũ.
- Hủy thanh toán đảo cả hai phía; không cho hủy riêng một giao dịch liên kết rồi bỏ lại payment.
- Không suy đoán khoản lịch sử là gốc/lãi/chi hộ chỉ dựa vào payee hoặc ghi chú.

### 4.3. Ngân sách, mục tiêu, định kỳ

- Ngân sách có phạm vi, số tiền, chu kỳ, thời gian hiệu lực và trạng thái; phần trăm có thể trên 100/150, chỉ thanh vẽ bị giới hạn.
- Kỳ ngân sách được giao với start/end hiệu lực; custom end là ngày cuối được tính.
- Danh mục cha/con và user/global được resolve thống nhất; chọn cha và con đồng thời không cộng hai lần.
- Mục tiêu là phân bổ, không phải giao dịch chi. Rút không vượt số đã phân bổ; rút dưới target từ trạng thái hoàn thành đưa về đang thực hiện.
- V1 cho cảnh báo phân bổ lớn hơn tiền trong ví liên kết; ghi rõ đây là đối chiếu, không phong tỏa tiền.
- Định kỳ có occurrence ID theo rule + thời điểm kỳ; mỗi occurrence tối đa một posted transaction.
- Ngày 31 dùng ngày cuối tháng ngắn, kỳ sau quay về ngày 31; không trôi vĩnh viễn sang ngày 28.
- Sửa quy tắc chỉ áp dụng cho kỳ chưa posted; phải preview lần tiếp theo. Tiếp tục sau tạm dừng cho xem các kỳ bỏ lỡ, không tự ghi bù hàng loạt.

### 4.4. OCR

- Batch ID và row ID không đổi khi sửa/retry; mỗi row có pending/saving/saved/failed và kết quả riêng.
- Nếu chia một row cho nhiều ví, tất cả entries và metadata phụ thuộc của row được lưu nguyên tử.
- Các row độc lập có thể thành công riêng; không đóng modal khi còn failed.
- Bill và debt chỉ gắn qua row ID tới kết quả của chính row đó, không dùng index sau khi lọc success.
- Schema khai báo đơn vị duy nhất; số nhỏ không tự nhân thêm. Sai tổng được cảnh báo và cho đối chiếu ảnh.
- Ảnh/row nghi trùng được cảnh báo, không tự loại bỏ giao dịch thật chỉ vì cùng số tiền/ngày.
- Retry request chưa rõ kết quả dùng cùng idempotency key; không đổi UUID để vượt lỗi conflict.
- Backend kiểm tra auth, payload, kích thước, quota; không log ảnh, khóa hoặc nội dung tài chính đầy đủ.

## 5. Backlog triển khai có tiêu chí nghiệm thu

Mỗi task gồm vấn đề, công việc, khu vực sửa, đầu ra và tiêu chí. Trạng thái ban đầu của tất cả task: **TODO — chờ duyệt**. Phụ thuộc môi trường live không được bỏ qua.

### V1-00 — Chuẩn hóa baseline và kiểm tra (P0 hỗ trợ; F26)

**Phụ thuộc:** D09.  
**Công việc:**
- [ ] Đối chiếu hai thư mục migrations với các bảng/RPC frontend đang dùng; ghi manifest thứ tự và phần thiếu.
- [ ] Xác minh read-only schema/RPC/scheduler đang triển khai khi có quyền truy cập; phân biệt bản local và remote.
- [ ] Tạo môi trường DB test cô lập có fixture; không dùng tài khoản demo tài chính.
- [ ] Tách test unit/UI khỏi integration; integration yêu cầu opt-in và kiểm tra đúng project test.
- [ ] Sửa mock listAccounts; thống nhất schema OCR zero với validation nghiệp vụ, không chỉ sửa assertion cho xanh.
- [ ] Cleanup test chỉ đúng dữ liệu test và kiểm tra lỗi/kết quả.

**Khu vực:** migrations ở root và Quan_ly_thu_chi; web/src/test, *.test.ts(x), package.json.  
**Đầu ra:** manifest schema, lệnh test rõ phạm vi, DB fixture tái lập.  
**Nghiệm thu:** chạy lệnh test mặc định không đăng nhập/ghi remote; dựng DB sạch đủ mọi RPC trong api.ts; lỗi setup phải hiện rõ.

### V1-01 — Chuẩn tiền, kỳ và credit card (P0; F01, F02, F07, F23)

**Phụ thuộc:** V1-00, D01/D02.  
**Công việc:**
- [ ] Viết một helper dựng kỳ theo timezone, dùng cả Dashboard/Reports/Budgets.
- [ ] Sửa RPC nhận biên timestamp; định nghĩa rõ hàm tổng thu/chi đã thực hiện.
- [ ] Chuẩn hóa số dư có dấu cho thẻ, hoàn tiền và thanh toán thẻ; không tự đảo dữ liệu cũ.
- [ ] Sửa trục Y và tooltip cùng đơn vị; loại lựa chọn tiền tệ chưa hỗ trợ khỏi thao tác mới.
- [ ] Giữ currency cũ nếu gặp dữ liệu khác VND, hiển thị cảnh báo chưa hỗ trợ tổng hợp; không đổi nhãn thành VND.

**Khu vực:** format.ts, DashboardPage, ReportsPage, SettingsPage, RPC balance/summary.  
**Nghiệm thu:** tháng 9 UTC+7 tính đủ ngày 01–30; boundary 00:00 vào đúng kỳ; chi thẻ 1 triệu từ 0 làm balance -1 triệu; biểu đồ 1 triệu đồng hiển thị đúng; timezone khác/DST được kiểm tra.

### V1-02 — Lịch sử đầy đủ và chuyển khoản rõ ràng (P0; F05)

**Phụ thuộc:** V1-01.  
**Công việc:**
- [ ] Server-side filter theo loại, ví, danh mục, ngày, số tiền, nội dung và trạng thái.
- [ ] Phân trang ổn định theo occurred_at + id; trả tổng count theo cùng filter.
- [ ] Account filter theo entries thực, không chỉ account đầu tiên của transaction.
- [ ] Hiện cả ví nguồn → ví đích của transfer và liên kết phí.
- [ ] Có tab/filter đã hủy; hướng sửa transfer bằng đảo/tạo thay thế có liên kết nếu chưa hỗ trợ edit trực tiếp.

**Khu vực:** api.ts/listTransactions, TransactionsPage, RPC/query.  
**Nghiệm thu:** giao dịch thứ 201 vẫn tìm được; chuyển khoản tìm thấy ở cả hai ví; phân trang không lặp/mất dòng khi cùng timestamp; hủy vẫn truy lại được.

### V1-03 — Ngân sách đúng và quản lý được (P0/P1; F03, F04, F17)

**Phụ thuộc:** V1-01, D03.  
**Công việc:**
- [ ] UI/API lưu scope toàn bộ/danh mục, hỗ trợ cây và danh mục global.
- [ ] Tính chi theo định nghĩa tiêu dùng đã duyệt; loại phần gốc nợ/chi hộ xác định được.
- [ ] Hiện kỳ đang tính, số còn lại/vượt, số % thật; lỗi từng thẻ có retry riêng.
- [ ] Cho sửa, tạm dừng/lưu trữ và xem ngân sách cũ.
- [ ] Ngân sách cũ thiếu scope được đánh dấu toàn bộ và gợi ý sửa, không tự phân loại từ tên.

**Khu vực:** BudgetsPage, api.ts, budget_categories, get_budget_progress.  
**Nghiệm thu:** chi mua sắm không tăng ngân sách chỉ ăn uống; chọn cha/con không đếm trùng; 300% hiện 300%; RPC lỗi không hiện 0; chi trước hiệu lực/ngày sau kết thúc không được tính.

### V1-04 — Reports cùng kỳ và không mất dữ liệu (P0/P1; F06, F20)

**Phụ thuộc:** V1-01, V1-02, D03.  
**Công việc:**
- [ ] Aggregate toàn bộ tại server, không lấy sample 500/1.000 để cộng.
- [ ] Pie có chưa phân loại, top N + nhóm còn lại; drill-down đầy đủ có phân trang.
- [ ] Đồng bộ filter thời gian cho KPI, bar, pie, heatmap; kỳ dài cho heatmap duyệt các tháng thuộc kỳ.
- [ ] Đổi tên preset đúng phạm vi (12 tháng, 4 quý, 5 năm); hiển thị khoảng ngày hiệu lực.
- [ ] Chặn response cũ ghi đè khi đổi filter nhanh.

**Nghiệm thu:** fixture >1.000 giao dịch, >8 danh mục và có chưa phân loại: tổng các nhóm bằng KPI chi trên cùng phạm vi; đổi kỳ không còn khối dùng tháng hiện tại ngoài ý muốn.

### V1-05 — Công nợ nguyên tử và đúng bản chất (P0; F08, F09, F10)

**Phụ thuộc:** V1-00/01, D02.  
**Công việc:**
- [ ] Thiết kế schema operation/payment/transaction linkage, opening debt và principal/interest/fee.
- [ ] RPC tạo mới, thanh toán và đảo nghiệp vụ nguyên tử; khóa row debt và khóa idempotency.
- [ ] Dùng chung form nhận/trả cho lend và borrow; số tiền, ngày, ví, trả một phần/toàn bộ.
- [ ] Thay nhánh markDebtPaid trực tiếp trong UI bằng flow đã duyệt.
- [ ] Sửa “trả hộ” và chia tiền để tiền chi/thu, phần cá nhân và nợ có nghĩa rõ.
- [ ] Chặn hủy riêng giao dịch có liên kết; hiển thị ảnh hưởng trước khi đảo.
- [ ] Ghi dữ liệu lịch sử chưa phân loại là legacy/unresolved; không tự tạo cashflow bù.

**Khu vực:** DebtFormModal, DebtDetailModal, PaymentModal, TransactionsPage, api.ts, migrations.  
**Nghiệm thu:** lend/borrow đều trả một phần; thu gốc không tăng thu nhập tiêu dùng; lỗi giữa chừng không đổi bất kỳ phía nào; hai request không trả vượt; retry chỉ có một payment; đảo khôi phục đúng số nợ và số dư.

### V1-06 — OCR lưu đúng, retry an toàn và bảo vệ khóa (P0/P1; F11–F14)

**Phụ thuộc:** V1-00/01/05 cho khoản chia tiền; D07/D09.  
**Công việc:**
- [ ] Chuẩn schema/prompt minor; bỏ tất cả suy đoán nhân 100 theo ngưỡng.
- [ ] Thiết kế row result giữ mapping ổn định gồm splits, bill, debt.
- [ ] Lưu nguyên tử mỗi row và giữ kết quả theo ID; retry chỉ phần chưa thành công.
- [ ] Giữ modal có lỗi, cung cấp tổng kết saved/failed và thao tác sửa; không nhập lại row saved.
- [ ] Bill/kênh/cửa hàng không chặn giao dịch thường; chỉ validate khi người dùng chọn lưu bill.
- [ ] Proxy Gemini có auth/quota, không để khóa vào bundle; có thông báo gửi ảnh.
- [ ] Cảnh báo trùng dựa trên nội dung/nguồn nhưng cho xác nhận ngoại lệ hợp lệ.
- [ ] Kiểm tra tương quan sum(items), declared total và transaction amount; không tự sửa transaction theo OCR bill.

**Nghiệm thu:** A fail/B success không gắn bill/nợ A vào B; retry không nhân đôi; chia ví lỗi một nhánh không lưu nửa row; 500.000 minor vẫn là 5.000 ₫; khóa không trong assets; test giả lập provider không gọi Gemini thật.

### V1-07 — Định kỳ vận hành đúng lịch (P1; F15)

**Phụ thuộc:** V1-01/05, D04.  
**Công việc:**
- [ ] Phân biệt occurrence đến hạn với posted transaction; thêm xác nhận/bỏ qua.
- [ ] Lập lịch đúng timezone/day_of_month; preview 3 kỳ tiếp theo.
- [ ] Sửa start/frequency/day cập nhật kỳ chưa ghi; pause/resume hiển thị kỳ bỏ lỡ.
- [ ] Nếu chọn auto-post: scheduler đáng tin, khóa unique occurrence, theo dõi lần chạy/lỗi.
- [ ] Chuyển quy tắc cũ qua mapping được kiểm tra; không tự sinh lại lịch sử.

**Nghiệm thu:** 31/01 → cuối tháng 2 → 31/03; chạy hai lần không trùng; chờ xác nhận không đổi số dư; kỳ đã posted không bị sửa khi đổi quy tắc.

### V1-08 — Mục tiêu rõ ý nghĩa và rút được (P1; F16)

**Phụ thuộc:** V1-01, D05.  
**Công việc:**
- [ ] UI ghi rõ phân bổ theo dõi không chuyển tiền.
- [ ] Thêm/rút chọn riêng với amount dương, giới hạn phía DB.
- [ ] Lịch sử đóng góp/đảo, trạng thái completed ↔ active theo số thực.
- [ ] Hiển thị đối chiếu với ví liên kết, tránh đếm tiền mục tiêu thành tài sản mới.

**Nghiệm thu:** thêm 1 triệu, rút 200.000 còn 800.000; không phát sinh expense; rút quá mức bị chặn; reload giữ lịch sử và trạng thái đúng.

### V1-09 — Onboarding, tài khoản và ghi nhanh (P1; F18, F19, F22, F24)

**Phụ thuộc:** V1-01/02, D06/D08.  
**Công việc:**
- [ ] Wizard tạo ví/số dư/giao dịch đầu; bỏ qua có lối tiếp tục; không đánh dấu hoàn tất chỉ vì lưu Settings.
- [ ] Tạo ví ngay trong form khi chưa có; giữ nội dung giao dịch đang nhập.
- [ ] CTA toàn app mở thẳng form chi; nhớ ví gần dùng theo user, fallback khi ví đã đóng.
- [ ] Trường ngày/payee/note thu gọn; form vẫn hỗ trợ người cần nhập chi tiết.
- [ ] Quên mật khẩu, gửi lại email xác nhận, lỗi auth tiếng Việt; bỏ tự chuyển 4 giây.
- [ ] Cảnh báo đóng form đã sửa, chặn đóng khi đang lưu; không cache ảnh/tài chính bền vững mặc định.
- [ ] Tách hide/archive/close theo schema thực; cho khôi phục, xử lý số dư khi đóng.

**Nghiệm thu:** tài khoản mới ghi chi đầu không bị kẹt vì thiếu ví; CTA mở trực tiếp; bỏ thay đổi cần quyết định rõ; ẩn ví không đổi tổng; đóng ví còn tiền không làm tiền biến mất; reset password tới đúng route.

### V1-10 — Dashboard, export và vòng quay lại (P1; F21, F24, F27)

**Phụ thuộc:** V1-02/03/04/07/08, D08.  
**Công việc:**
- [ ] Đổi nhãn tiền đúng hợp đồng; thống nhất số mục recent.
- [ ] Hiện tối đa 3 việc: ngân sách gần/vượt, chưa phân loại, định kỳ đến hạn; link tới đúng filter/action.
- [ ] Không hiện dữ liệu lỗi dưới dạng “không có việc”.
- [ ] CSV đầy đủ theo filter, không giới hạn trang đang xem; có tiền tệ/đơn vị/trạng thái/ID.
- [ ] Chống công thức spreadsheet trong chuỗi CSV bắt đầu =,+,-,@; escape dấu phân cách và xuống dòng.
- [ ] Định nghĩa event activation, save_success/failure, import_result, review_week cho triển khai đo sau; không log nội dung tài chính.

**Nghiệm thu:** click việc cần chú ý dẫn đúng ngữ cảnh; CSV khớp tổng/count; không có KPI “có thể chi” giả định; số recent đúng nhãn. Không gắn dịch vụ analytics bên ngoài khi chưa có cấu hình/phạm vi cho phép.

### V1-11 — Điều hướng và bản nháp mở rộng (P2; F25, F24)

**Phụ thuộc:** đo usability sau P1.  
**Backlog:** 3–4 điểm vào mobile + “Thêm”; bản nháp phục hồi qua reload có thời hạn và cách xóa; mẫu giao dịch thường dùng; import CSV; so sánh kỳ trước.  
**Nghiệm thu tương lai:** xác lập qua thử nghiệm nhiệm vụ trên mobile; không mặc định redesign toàn app trong v1.

## 6. Thứ tự thực hiện và phụ thuộc

| Đợt | Công việc | Điều kiện kết thúc |
|---|---|---|
| 0 | Duyệt D01–D09, V1-00 | Ghi lại quyết định; có baseline và test cô lập |
| 1 | V1-01, V1-02 | Tiền/ngày/số dư và truy cập lịch sử đúng |
| 2 | V1-05, phần P0 của V1-03/04 | Công nợ nguyên tử; ngân sách/báo cáo đối chiếu được |
| 3 | V1-06 | OCR không sai đơn vị/nhầm liên kết/trùng khi retry |
| 4 | V1-07/08/09, phần vòng đời V1-03 | Flow hằng ngày và các nghiệp vụ phụ hoàn chỉnh |
| 5 | V1-10, E2E và nghiệm thu tổng | Hoàn tất P0/P1, báo cáo bằng chứng và giới hạn |
| Sau v1 | V1-11 | Chỉ mở khi có quyết định phạm vi tiếp theo |

Không ước lượng ngày công khi chưa biết schema triển khai và phương án dữ liệu cũ. Sau đợt 0 mới tách ticket/ước lượng; không dùng ước lượng để bỏ tiêu chí nghiệm thu.

## 7. Kế hoạch dữ liệu và tương thích

1. Ghi snapshot read-only định nghĩa schema, RPC, triggers, policies, scheduler; không xuất dữ liệu cá nhân vào log.
2. Dựng baseline và fixture trên DB cô lập. Chốt mapping new/legacy operations trước khi viết backfill.
3. Migration ưu tiên thêm cột/bảng, giữ tương thích API cũ trong giai đoạn chuyển tiếp.
4. Lập dry-run danh sách bản ghi cần chuyển, số dư trước/sau và ngoại lệ; cần phân biệt thẻ, công nợ, tiền khác VND.
5. Dữ liệu không đủ chứng cứ giữ legacy và đưa vào luồng rà soát. Không tự đoán phân loại ngân sách/nợ/OCR lịch sử.
6. Chỉ apply remote nếu D09 cấp quyền rõ; trước khi apply phải có backup, môi trường đích đã xác minh và rollback khả thi.
7. Rollback không xóa giao dịch mới của người dùng; ưu tiên feature flag/phiên bản tương thích và forward-fix.
8. Sau migration đối chiếu số dư, remaining debt, tổng thống kê và quyền truy cập hai user độc lập.

## 8. Ma trận kiểm thử bắt buộc

| Mã | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| QA-01 | Thu/chi sát đầu/cuối tháng UTC+7 và timezone có DST | Cùng một kỳ trên mọi màn |
| QA-02 | Chi thẻ, hoàn tiền, chuyển tiền thanh toán thẻ | Đúng dấu; không tạo thu nhập giả |
| QA-03 | 1.205 giao dịch, 12 danh mục, có chưa phân loại | Query đầy đủ; tổng pie = KPI |
| QA-04 | Giao dịch cùng timestamp, phân trang và lọc 2 phía transfer | Không trùng/mất, đúng account |
| QA-05 | Ngân sách cha+con, 300%, lỗi RPC, hiệu lực giữa tháng | Không đếm trùng; lỗi không thành 0 |
| QA-06 | Lend/borrow trả phần/toàn bộ, retry, 2 request cạnh tranh | Không trả vượt; một operation duy nhất |
| QA-07 | Hủy payment có transaction | Cả nợ và tiền đảo đúng |
| QA-08 | OCR A lỗi/B thành công, splits, bill và debt | Đúng mapping; không lưu nửa row |
| QA-09 | OCR cùng ảnh retry; amount minor nhỏ; total lệch | Không nhân 100/trùng; có đối chiếu |
| QA-10 | Ngày 31, pause/resume, scheduler lặp | Không trôi ngày, không tự ghi bù/trùng |
| QA-11 | Thêm/rút mục tiêu, completed rồi rút | Tiến độ đúng, không thành chi tiêu |
| QA-12 | User mới, không có ví, bỏ wizard, quên mật khẩu | Có đường đi hoàn chỉnh |
| QA-13 | Ẩn/đóng/khôi phục ví còn tiền | Không âm thầm thay đổi tài sản |
| QA-14 | Mobile 360/390px, keyboard, modal bill, Escape | Hoàn tất được, không mất form ngoài ý muốn |
| QA-15 | Hai user khác nhau gọi trực tiếp API/RPC | Không đọc/ghi chéo; không dựa riêng UI |
| QA-16 | CSV >1 trang, dấu tiếng Việt, ô công thức, timezone | Xuất đủ/đúng, nội dung không thành công thức |
| QA-17 | Bundle/log/network OCR và test mặc định | Không có khóa client; không ghi demo/remote từ test mặc định |

Các ca DB chạy trên môi trường cô lập; test lỗi mạng dùng fault injection/mock. Không gọi Gemini thật để kiểm thử schema/flow. Browser E2E phải xác nhận đúng route và kết quả persist sau reload, không chỉ chụp UI hoặc kiểm tra HTTP 200.

## 9. Definition of Done

- [ ] D01–D09 có trạng thái duyệt rõ và được phản ánh vào spec.
- [ ] V1-00 đến V1-10 hoàn thành trong phạm vi đã duyệt, hoặc có ngoại lệ ghi rõ.
- [ ] Các F01–F27 được map tới task; P2 được giữ backlog thay vì ghi “đã sửa”.
- [ ] Typecheck/build đạt, unit/UI/integration có kết quả riêng.
- [ ] QA bắt buộc đạt với log/fixture và bằng chứng browser; ghi rõ ca chưa chạy.
- [ ] Không còn sai số tổng giữa các màn trên cùng dữ liệu/phạm vi.
- [ ] Không còn ghi nửa nghiệp vụ hoặc trùng do retry trong các flow đã sửa.
- [ ] Không để API key OCR ở client; test mặc định không ghi live.
- [ ] Release note mô tả đổi ý nghĩa chỉ tiêu/ngân sách/công nợ/định kỳ.
- [ ] Migration/rollback/backfill có bằng chứng trước–sau nếu nằm trong quyền đã cấp.
- [ ] Không công bố production hoàn tất chỉ vì build/test local đạt.

## 10. Câu xác nhận dùng trong một lượt

**Bạn đồng ý toàn bộ phương án D01–D09, hay muốn đổi mã nào?**

Mẫu trả lời: “Đồng ý toàn bộ D01–D09” hoặc “D04: tự ghi sổ mặc định; các mục khác đồng ý”. Nếu muốn cấp quyền remote/deploy, bổ sung vào D09 tên môi trường/project và hành động cụ thể.

Lý do cần xác nhận: đây là yêu cầu trực tiếp của người dùng; các lựa chọn thay đổi ý nghĩa số liệu, hành vi định kỳ, mục tiêu và phạm vi thực hiện. Không có yêu cầu xác nhận bổ sung từ skill. Sau khi duyệt, không hỏi lại các quyết định đã chốt trong phạm vi này.

