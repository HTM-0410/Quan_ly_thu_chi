# NHẬT KÝ QUYẾT ĐỊNH NGHIỆP VỤ & PHẠM VI (D01–D09)

Dự án: Quản lý thu chi
Ngày cập nhật: 07/09/2026
Trạng thái: **DRAFT — CHỜ XÁC NHẬN MỘT LẦN DUY NHẤT TỪ CHỦ NHÀ**

---

## BẢNG QUYẾT ĐỊNH CHI TIẾT

| Mã | Quyết định đề xuất | Tác động & Phương án thay thế | Lựa chọn đề xuất | Trạng thái |
|---|---|---|---|---|
| **D01 — Phạm vi v1 & Tiền tệ** | Triển khai dứt điểm toàn bộ P0 và P1 theo thứ tự phụ thuộc. Giữ P2 trong backlog. V1 chỉ hỗ trợ VND, lưu trữ 100 minor = 1 VND, lấy timezone hồ sơ làm chuẩn (mặc định UTC+7), tuần bắt đầu thứ Hai. | Nếu muốn hỗ trợ đa tiền tệ, tuần bắt đầu Chủ nhật, hoặc chỉ làm P0, cần thông báo đổi trong lượt xác nhận. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D02 — Sổ tiền & Công nợ** | Quy ước số dư có dấu: Tài sản dương, dư nợ thẻ tín dụng âm. Tách biệt gốc vay / hoàn gốc khỏi thu nhập và chi tiêu tiêu dùng trong báo cáo. Tách "Nợ có sẵn" (không sinh cashflow) và "Vay/cho vay mới" (ghi nhận giải ngân vào tài khoản). Hỗ trợ trả một phần/toàn bộ cho cả 2 chiều lend và borrow. | Báo cáo mới phản ánh đúng tiêu dùng thực tế. Các khoản lịch sử thiếu chứng cứ giữ nguyên nhãn legacy, không tự suy đoán. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D03 — Ngân sách & Báo cáo** | Ngân sách cho phép chọn "Toàn bộ" hoặc danh mục cụ thể; chọn danh mục cha bao gồm tất cả con nhưng không cộng trùng. Đồng bộ cùng khoảng thời gian cho KPI, BarChart, PieChart và Heatmap. Thêm nhóm "Chưa phân loại" và "Các danh mục khác". | Các ngân sách cũ thiếu danh mục được gắn nhãn mặc định "Toàn bộ chi tiêu" để người dùng chủ động sửa. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D04 — Quy tắc định kỳ** | Mặc định sinh giao dịch ở trạng thái "Đến hạn / Chờ xác nhận", hiển thị việc cần làm trên Dashboard. Chỉ sau khi người dùng bấm xác nhận đã thực chi/thực nhận thì mới ghi sổ `posted` và cập nhật số dư. | Tránh ghi nhận trước số liệu khi chưa thực tế phát sinh. Quy tắc cũ không bị chuyển chế độ ngầm. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D05 — Mục tiêu tích lũy** | V1 định nghĩa mục tiêu là phân bổ theo dõi số sách, không tự động chuyển tiền vật lý giữa các ví. Giao diện có 2 nút "Thêm tiền" và "Rút tiền" với số tiền dương; kiểm tra rút không vượt quá số đã phân bổ; không tính tiền vào mục tiêu là chi phí. | Giữ nguyên vẹn số dư thực của ví, giải quyết triệt để lỗi nhập âm bị chặn. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D06 — Onboarding & Thao tác ghi nhanh** | Onboarding ngắn 2-3 bước: tạo ví → nhập số dư ban đầu → ghi giao dịch đầu tiên (có nút bỏ qua). CTA toàn app mở thẳng form chi; ghi nhớ ví gần dùng nhất; hóa đơn/cửa hàng là tùy chọn. Hỗ trợ xem giao dịch đã hủy và xuất CSV. | Tối ưu thời gian ghi chép hằng ngày; bảo vệ dữ liệu đang nhập bằng cảnh báo khi thoát form. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D07 — Xử lý ảnh OCR** | Tiếp tục sử dụng Gemini qua backend proxy có auth và rate limiting; API key không nằm ở client. Chỉ gửi ảnh sau thao tác chủ động; preview bắt buộc, retry từng dòng lỗi độc lập; xóa bỏ việc tự đoán đơn vị tiền theo độ lớn. | Tuyệt đối không để lộ API key; không gắn nhầm hóa đơn vào giao dịch khác khi xử lý một phần thất bại. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D08 — Tài khoản & Dashboard** | Tách ẩn ví khỏi loại trừ số liệu; đóng ví yêu cầu xử lý số dư còn lại, có giao diện khôi phục ví đã đóng. Đổi nhãn "Còn lại" thành "Chênh lệch thu–chi". Bổ sung tối đa 3 việc cần chú ý dựa trên dữ liệu thật. | Tránh ngộ nhận "Còn lại" là tiền có thể tiêu; minh bạch tình trạng tài sản. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |
| **D09 — Quyền môi trường sau duyệt** | Duyệt spec và blueprint cho phép sửa code local, viết migration, chạy kiểm thử trên môi trường DB/mock cô lập. Mặc định **không apply DB remote, không sửa dữ liệu lịch sử production, không deploy/commit/push, không gọi Gemini API thật có phí**. | Nếu Chủ nhà muốn cấp quyền remote hay deploy, cần ghi rõ môi trường và lệnh cho phép. | **Đồng ý Phương án đề xuất** | Chờ xác nhận |

---

## BIÊN BẢN DUYỆT CHÍNH THỨC

| Mục | Nội dung ghi nhận |
|---|---|
| Người duyệt | Người dùng (Homeowner) |
| Thời điểm duyệt | 2026-09-07T15:25:24+07:00 |
| Mã được duyệt | **ĐỒNG Ý TOÀN BỘ D01–D09, BLUEPRINT v1 & TASK GRAPH v1** |
| Ngoại lệ / Yêu cầu điều chỉnh | Không có ngoại lệ. Toàn bộ phạm vi P0 & P1 được phê duyệt thực hiện. |
| Quyền môi trường được cấp | Quyền local development, viết migration, chạy test cô lập (D09). Nghiêm cấm apply remote/deploy/ghi live. |
| Trạng thái thi công | **ĐÃ PHÊ DUYỆT — ĐANG TRIỂN KHAI LIÊN TỤC** |
