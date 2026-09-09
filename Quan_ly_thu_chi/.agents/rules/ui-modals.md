# Quy tắc Phát triển & Thiết kế Giao diện (Workspace Rules)

Tài liệu quy tắc bắt buộc cho AI Agent và lập trình viên khi phát triển ứng dụng Quản lý Thu Chi.

---

## 1. Quy tắc Thiết kế Pop-up & Hộp thoại Modal (BẮT BUỘC)

> **Mục tiêu**: Tuyệt đối không để xảy ra lỗi pop-up/modal bị ghim lệch ở đáy màn hình, bị cắt xén hoặc bị che khuất bởi thanh điều hướng di động (`MobileBottomNav`).

### A. Vị trí & Căn lề của Modal Dialog
- **Luôn căn giữa màn hình (Center-aligned)** trên mọi thiết bị (cả Mobile và Desktop):
  - Khung bao ngoài: `flex items-center justify-center p-3.5 sm:p-4`.
  - Tuyệt đối **KHÔNG DÙNG** `items-end p-0 rounded-t-card` cho các modal thông thường (hộp thoại thêm/sửa giao dịch, xem chi tiết danh mục, xác nhận, v.v.). Kiểu dáng này sẽ biến modal thành card dính đáy gượng ép, gây tràn màn hình và xung đột với thanh điều hướng.
  - Khung nội dung modal phải có bo góc toàn diện: `rounded-card` (hoặc `rounded-2xl`).
  - Luôn giới hạn chiều cao tối đa: `max-h-[88vh] sm:max-h-[90vh]` kèm `overflow-y-auto` ở phần thân để đảm bảo không bao giờ tràn ra ngoài khung nhìn của điện thoại.

### B. Phân cấp Tầng hiển thị Z-Index (Z-Index Hierarchy)
Tuân thủ nghiêm ngặt bảng phân cấp z-index sau:
1. **Nội dung trang / Header bảng dính**: `z-10` đến `z-30`.
2. **Thanh điều hướng cố định (Top Header / MobileBottomNav)**: **`z-40`**.
3. **Menu ngăn kéo toàn màn hình (Mobile Drawer / Bottom Sheet "Thêm")**: **`z-50`**.
4. **Hộp thoại Pop-up & Modal (`<Modal>`)**: **`z-[60]`** (bắt buộc cao hơn thanh điều hướng để luôn hiển thị trọn vẹn lên trên).
5. **Thông báo nổi (Toast notifications)**: **`z-[70]`** (đặt ở `bottom-16 sm:bottom-4` để không che lấp thanh điều hướng mobile).

### C. Sử dụng React Portal cho Overlays
- Mọi Modal và Popover tương tác phải được mount trực tiếp vào `document.body` thông qua `createPortal(content, document.body)`.
- Lý do: Tránh hoàn toàn việc modal bị giới hạn bởi stacking context, thuộc tính `transform`, `filter` hoặc `overflow: hidden` của các thẻ cha trong cây DOM.

### D. Khoảng trống an toàn trên Di động (Mobile Safe Clearance)
- Vì ứng dụng có thanh điều hướng cố định ở đáy màn hình trên di động (`MobileBottomNav` cao ~56px):
  - Nội dung trang chính (`<main>`): Luôn có `pb-20 md:pb-8`.
  - Các phần tử nổi góc dưới (Toasts, FAB): Luôn đặt cách đáy ít nhất `bottom-16` (hoặc `bottom-20`) trên màn hình nhỏ `< md`, và `sm:bottom-4` trên máy tính.


### E. Vô hiệu hóa Focus Outline trên Biểu đồ & SVG (No Outline on Charts/SVG)
- Tuyệt đối **không để hiện viền focus hình chữ nhật (:focus-visible)** khi người dùng click/tap vào biểu đồ tròn (PieChart), lát cắt (Sector), cột (BarChart) hoặc bất kỳ phần tử đồ họa SVG nào.
- Quy định: Các thẻ svg, .recharts-wrapper, .recharts-pie, .recharts-surface phải luôn có outline: none !important; box-shadow: none !important;.
---

## 2. Quy tắc Thẩm mỹ & Trải nghiệm Người dùng (Editorial Warm Design)

- **Tone & Voice**: Tông màu giấy ấm (Warm paper surfaces `#faf7f2`), màu mực biên tập (Editorial ink `#15110d`), màu thương hiệu terracotta (`#b8451f`), xanh thu nhập (`#15803d`), đỏ chi tiêu (`#dc2626`).
- **Typography**: Font tiêu đề `Fraunces`, font chữ nội dung `Noto Sans`, số liệu tiền tệ `font-mono` hoặc `tabular-nums` với lớp `.num`.
- **Độ thu gọn trên màn hình đầu tiên (Above the fold)**: Luôn tối ưu padding và khoảng cách (`space-y-5 sm:space-y-6`) để các biểu đồ và chỉ số chính hiển thị ngay trong tầm mắt khi vừa truy cập trang, tránh đẩy thông tin quan trọng xuống quá sâu.