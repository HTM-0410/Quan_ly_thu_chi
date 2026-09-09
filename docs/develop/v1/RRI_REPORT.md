# RRI REPORT — Quản lý thu chi (VibeCode Kit v6.1)
Ngày lập: 07/09/2026
Người thực hiện: THẦU (Contractor)
Góc nhìn phân tích: 5 Personas (End User, Business Analyst, QA/Tester, Developer, Operator)

---

## 1. REQUIREMENTS MATRIX

| REQ-ID | Mô tả yêu cầu nghiệp vụ / kỹ thuật | Nguồn | Priority | Persona | Task V1 tương ứng |
|---|---|---|---|---|---|
| **REQ-001** | Chuẩn hóa khoảng thời gian tháng theo múi giờ hồ sơ (UTC+7), không cắt nhầm ngày cuối tháng hoặc kéo ngày tháng trước. | F01, Spec §5 | P0 | End User / BA | V1-01 |
| **REQ-002** | Chuẩn hóa số dư thẻ tín dụng có dấu âm khi nợ; chi tiêu thẻ tín dụng làm giảm tài sản ròng đúng bản chất. | F02, Spec §5 | P0 | BA / End User | V1-01 |
| **REQ-003** | Ngân sách phải chọn được phạm vi (Toàn bộ hoặc Danh mục cụ thể gồm cha/con), không đếm trùng danh mục cha và con. | F03, Spec §5 | P0 | BA / End User | V1-03 |
| **REQ-004** | Khi tải ngân sách lỗi, hiển thị trạng thái lỗi riêng và nút thử lại, tuyệt đối không biến lỗi thành 0 đồng; hiển thị % vượt ngân sách thực tế (>100%, >150%). | F04, Spec §5 | P0 | End User / QA | V1-03 |
| **REQ-005** | Trang Giao dịch hỗ trợ phân trang server-side, tìm kiếm theo nội dung/khoảng ngày, hiển thị tổng số kết quả và lọc được giao dịch đã hủy. | F05, Spec §5 | P0 | End User / Dev | V1-02 |
| **REQ-006** | Báo cáo chi tiêu tổng hợp đầy đủ từ DB (không sample 500 dòng), hiển thị nhóm "Chưa phân loại" và nhóm "Các danh mục khác" ngoài top N. | F06, Spec §5 | P0 | End User / BA | V1-04 |
| **REQ-007** | Thống nhất đơn vị trục Y biểu đồ, nhãn và tooltip (chuyển đổi minor sang VND chuẩn xác trước khi vẽ, không sai lệch 100 lần). | F07, Spec §5 | P0 | End User / QA | V1-01 |
| **REQ-008** | Tách bạch giữa khai báo "Nợ có sẵn" (không sinh cashflow) và "Vay/cho vay mới" (ghi nhận giải ngân vào tài khoản); đồng bộ flow thanh toán cả 2 chiều lend/borrow. | F08, Spec §5 | P0 | BA / End User | V1-05 |
| **REQ-009** | Thu hồi gốc cho vay và trả gốc đi vay không được tính vào thu nhập / chi tiêu tiêu dùng trong báo cáo. | F09, Spec §5 | P0 | BA | V1-05 |
| **REQ-010** | Thanh toán công nợ và ghi nhận giao dịch tiền được thực hiện trong một giao dịch DB nguyên tử (RPC duy nhất), có khóa chống ghi đồng thời và idempotency key. | F10, Spec §5 | P0 | Dev / QA / BA | V1-05 |
| **REQ-011** | OCR import giữ ánh xạ ổn định `rowId -> transactionId(s)`; không dùng mảng nén khiến dòng sau lỗi bị gắn sai hóa đơn hoặc công nợ. | F11, Spec §5 | P0 | Dev / QA | V1-06 |
| **REQ-012** | OCR import hỗ trợ xem kết quả chi tiết từng dòng, giữ lại các dòng lỗi để sửa/thử lại, không nhập lại các dòng đã lưu thành công; có idempotency key. | F12, Spec §5 | P1 | End User / QA | V1-06 |
| **REQ-013** | Schema và prompt OCR dùng một đơn vị duy nhất (minor unit); xóa bỏ toàn bộ logic tự nhân 100 theo ngưỡng phỏng đoán độ lớn tiền. | F13, Spec §5 | P0 | Dev / QA | V1-06 |
| **REQ-014** | API Key Gemini được quản lý an toàn qua backend proxy có auth và rate-limit; không lộ khóa trong client bundle hay log; có thông báo khi gửi ảnh. | F14, Spec §5 | P0 | Operator / Security | V1-06 |
| **REQ-015** | Quy tắc định kỳ vận hành đúng ngày trong tháng (`day_of_month`), xử lý tháng thiếu ngày (ngày 31), hiển thị preview 3 kỳ tiếp theo và phân biệt trạng thái đến hạn vs đã ghi sổ. | F15, Spec §5 | P1 | BA / End User | V1-07 |
| **REQ-016** | Mục tiêu tiết kiệm phân định rõ 2 hành động "Thêm tiền" và "Rút tiền" với số tiền dương; kiểm tra số dư rút không vượt số đã phân bổ; không tạo chi tiêu giả. | F16, Spec §5 | P1 | BA / End User | V1-08 |
| **REQ-017** | Ngân sách bổ sung đầy đủ vòng đời: sửa giới hạn, tạm dừng/kích hoạt lại, lưu trữ; tính đúng ngày bắt đầu và ngày kết thúc inclusive của kỳ. | F17, Spec §5 | P1 | End User / BA | V1-03 |
| **REQ-018** | Onboarding ngắn 2–3 bước dẫn tới ví và giao dịch đầu tiên; bổ sung trang Quên mật khẩu và Đặt lại mật khẩu; không tự chuyển trang xác nhận sau 4 giây. | F18, Spec §5 | P1 | End User | V1-09 |
| **REQ-019** | CTA Dashboard mở trực tiếp form ghi chi; ghi nhớ tài khoản gần dùng nhất; hóa đơn/cửa hàng là tùy chọn không bắt buộc khi ghi chi mua sắm. | F19, Spec §5 | P1 | End User | V1-09 |
| **REQ-020** | Đồng bộ bộ lọc thời gian cho toàn bộ màn hình Báo cáo (cả BarChart, PieChart và Heatmap cùng tuân theo kỳ được chọn); đặt tên preset chuẩn xác. | F20, Spec §5 | P1 | End User | V1-04 |
| **REQ-021** | Đổi nhãn "Còn lại" trên Dashboard thành "Chênh lệch thu–chi"; bổ sung khối tối đa 3 việc cần chú ý (ngân sách chạm ngưỡng, khoản nợ/định kỳ đến hạn, giao dịch chưa phân loại). | F21, Spec §5 | P1 | End User / BA | V1-10 |
| **REQ-022** | Tách rõ thao tác Ẩn tài khoản khỏi Đóng/Lưu trữ tài khoản; cảnh báo khi tài khoản còn số dư; cung cấp giao diện xem và khôi phục tài khoản đã lưu trữ. | F22, Spec §5 | P1 | BA / End User | V1-09 |
| **REQ-023** | Khóa cấu hình tiền tệ ở mức VND cho v1, thông báo rõ giới hạn VND-only để tránh kỳ vọng sai của người dùng. | F23, Spec §5 | P1 | BA / Dev | V1-01 |
| **REQ-024** | Cảnh báo mất dữ liệu khi đóng form/modal có thay đổi chưa lưu; bổ sung chức năng xuất lịch sử giao dịch ra CSV chống injection công thức. | F24, Spec §5 | P1 | End User / Security | V1-09, V1-10 |
| **REQ-025** | Tinh gọn điều hướng mobile, gom các mục quản trị vào cài đặt, ưu tiên nút tạo giao dịch nhanh (Backlog P2). | F25, Spec §5 | P2 | End User | V1-11 |
| **REQ-026** | Chuẩn hóa migration manifest; bổ sung migration thiếu (`global_categories`, `mark_debt_paid`); tách test suite cô lập không ghi Supabase demo. | F26, Spec §5 | P0 (hỗ trợ) | Dev / QA / Operator | V1-00 |
| **REQ-027** | Đồng bộ số lượng hiển thị giao dịch gần đây giữa tiêu đề ("6 mục mới nhất") và dữ liệu render. | F27, Spec §5 | P2 | End User | V1-10 |

---

## 2. AUTO-ANSWERED (Rút ra từ Scan & Codebase)

1. **Hệ thống xác thực (Auth):** Tái sử dụng Supabase Auth sẵn có (`useAuth`, session management). Bổ sung phương thức `resetPasswordForEmail` và `updateUser` cho flow quên mật khẩu.
2. **Cơ chế lưu trữ tiền tệ (Database Currency):** Tiếp tục tuân thủ quy ước chuẩn: 100 minor unit = 1 VND. Toàn bộ tính toán số học trên backend/DB dùng số nguyên `BIGINT`.
3. **Cấu trúc Sổ cái kép (Ledger Integrity):** Bảo toàn kiến trúc `transactions` + `transaction_entries`. Mọi giao dịch tiền mặt/tài khoản đều phải có entries tương ứng.
4. **Design System & UI Components:** Tái sử dụng trọn vẹn bộ component: `Modal`, `FormField`, `VNDInput`, `CategoryPicker`, `Toast`, `ConfirmProvider`, bảng màu Tailwind và dark/light theme hiện hành.

---

## 3. DECISIONS LOG (D01–D09)

| Mã | Quyết định đề xuất | Các phương án đã cân nhắc | Phương án chọn | Lý do & Tác động | Trạng thái |
|---|---|---|---|---|---|
| **D01** | Phạm vi v1 & Tiền tệ | A) Hỗ trợ đa tiền tệ ngay.<br>B) Chỉ hỗ trợ VND, lưu VND ×100 minor, tuần bắt đầu thứ 2, múi giờ hồ sơ chuẩn. | **Phương án B** | Tránh rủi ro tỷ giá và sai lệch đơn vị lưu trữ. Tập trung ổn định toàn bộ lõi tài chính VND. | Chờ duyệt một lần |
| **D02** | Sổ tiền & Công nợ | A) Giữ nguyên cách tính cũ (gốc vay = income).<br>B) Số dư có dấu chuẩn xác; tách gốc vay khỏi thu nhập/chi tiêu tiêu dùng; tách nợ cũ vs mới; trả nợ nguyên tử. | **Phương án B** | Báo cáo phản ánh đúng tiêu dùng thực tế. Ngăn chặn triệt để tình trạng lệch sổ khi mạng chập chờn. | Chờ duyệt một lần |
| **D03** | Ngân sách & Báo cáo | A) Phỏng đoán danh mục từ tên.<br>B) Ngân sách chọn "Toàn bộ" hoặc danh mục cụ thể; cùng kỳ đồng bộ cho KPI, Bar, Pie, Heatmap. | **Phương án B** | Minh bạch dữ liệu. Người dùng hoàn toàn kiểm soát danh mục được giới hạn ngân sách. | Chờ duyệt một lần |
| **D04** | Quy tắc định kỳ | A) Tự động post ngay không cần duyệt.<br>B) Mặc định tạo trạng thái "đến hạn/chờ xác nhận", người dùng xác nhận mới ghi sổ. | **Phương án B** | Tránh ghi nhận khống các khoản chi chưa thực trả ngoài đời thực; có cơ chế chống sinh trùng. | Chờ duyệt một lần |
| **D05** | Mục tiêu tích lũy | A) Tự động chuyển tiền thật giữa các ví.<br>B) Phân bổ theo dõi sổ sách; hỗ trợ nút "Thêm" và "Rút" rõ ràng với số tiền dương. | **Phương án B** | Phù hợp v1 không gây xáo trộn số dư ví thực tế, loại bỏ lỗi nhập âm bị chặn. | Chờ duyệt một lần |
| **D06** | Onboarding & Ghi nhanh | A) Giữ luồng tự do cũ.<br>B) Wizard ngắn 2-3 bước tạo ví & giao dịch đầu; CTA mở thẳng form chi; nhớ ví gần nhất. | **Phương án B** | Tối ưu hóa chuyển đổi và trải nghiệm người dùng mới; giảm thao tác nhập hằng ngày. | Chờ duyệt một lần |
| **D07** | Xử lý ảnh OCR | A) Tắt tính năng OCR.<br>B) Dùng Gemini qua backend proxy có auth/quota; row ID ổn định, retry từng dòng lỗi, không đoán đơn vị. | **Phương án B** | Bảo vệ API Key tuyệt đối; không làm hỏng liên kết hóa đơn khi một phần giao dịch thất bại. | Chờ duyệt một lần |
| **D08** | Tài khoản & Dashboard | A) Giữ nguyên nhãn "Còn lại".<br>B) Tách ẩn ví khỏi loại trừ tài sản; đổi nhãn thành "Chênh lệch thu–chi"; thêm 3 việc cần chú ý. | **Phương án B** | Cung cấp số liệu tài chính trung thực, hướng dẫn người dùng hành động cụ thể mỗi ngày. | Chờ duyệt một lần |
| **D09** | Quyết định quyền môi trường | A) Cho phép apply remote Supabase và deploy ngay.<br>B) Mặc định chỉ thực hiện local, viết migration, test cô lập. | **Phương án B** | Đảm bảo an toàn dữ liệu, không phát sinh chi phí hoặc ghi đè môi trường người dùng chưa cho phép. | Chờ duyệt một lần |

---

## 4. OPEN QUESTIONS

Tất cả các câu hỏi kỹ thuật và nghiệp vụ chi tiết đã được khảo sát và làm rõ từ mã nguồn và tài liệu hiện hữu:
- Không mở phỏng vấn dàn trải.
- Toàn bộ nội dung cần xác nhận duy nhất được đóng gói vào phần **D01–D09** và **BLUEPRINT v1**.
