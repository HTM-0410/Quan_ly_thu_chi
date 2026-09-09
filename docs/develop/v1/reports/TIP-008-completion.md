# Báo Cáo Hoàn Thành TIP-008: Mục Tiêu Tích Lũy Rõ Ý Nghĩa, Rút Được Tiền & Lịch Sử Phân Bổ

## 1. Kết Quả Thực Thi
THỢ đã hoàn thành toàn bộ các yêu cầu kỹ thuật và tiêu chí nghiệm thu của TIP-008 (F16):

### AC-008-1 (F16 - Separate Deposit & Withdrawal Actions): ĐẠT
- Thẻ mục tiêu tại `GoalsPage.tsx` tách biệt rõ rệt 2 hành động: **"Thêm tiền"** (Nạp) và **"Rút tiền"**.
- Nút "Rút tiền" tự động bị vô hiệu hóa (`disabled`) khi mục tiêu chưa có số dư (`current_amount_minor <= 0`).
- Cả hai chế độ đều nhận giá trị nhập là **SỐ DƯƠNG** thông qua component `VNDInput`, giải quyết triệt để lỗi không thể nhập dấu âm trước đây.
- Trong modal rút tiền: bổ sung nút thao tác nhanh "Rút toàn bộ (X ₫)" tự động điền toàn bộ số dư mục tiêu đang có.

### AC-008-2 (F16 - Overdraw Prevention & Balance Boundary): ĐẠT
- Tạo migration `20260810000010_goal_contribution_withdrawal_and_lifecycle.sql` (#29 trong `MIGRATION_MANIFEST.md`):
  - RPC `add_goal_contribution` khóa hàng `FOR UPDATE` trên `saving_goals`.
  - Kiểm tra điều kiện số dư: `IF p_amount_minor < 0 AND (v_current + p_amount_minor) < 0 THEN RAISE EXCEPTION 'Withdrawal amount (%) exceeds goal balance (%)', ABS(p_amount_minor), v_current; END IF;`.
- Tại giao diện `ContributionModal`:
  - Validation tức thì: nếu `amount > current_amount_minor`, hiển thị lỗi "Số tiền rút không được vượt quá số dư hiện có (X ₫)" và chặn không cho submit.

### AC-008-3 (F16 - Lifecycle Reversal & Non-Expense Semantics): ĐẠT
- Tính toán trạng thái vòng đời 2 chiều (Lifecycle):
  - Khi số dư đạt hoặc vượt target (`current_amount_minor >= target_amount_minor`), trạng thái chuyển sang `completed`.
  - Khi người dùng rút tiền làm số dư giảm xuống dưới target (`current_amount_minor < target_amount_minor`) và trạng thái đang là `completed`, trạng thái tự động phục hồi về `active`.
- Tuân thủ Quyết định D05:
  - Thêm hay rút tiền chỉ ghi nhận vào sổ theo dõi `goal_contributions`, KHÔNG tạo giao dịch chi phí (`expense`) làm sai lệch KPI chi tiêu tháng.
  - Thêm banner thông tin minh bạch tại đầu trang GoalsPage: "Ý nghĩa tài chính: Mục tiêu là khoản phân bổ theo dõi sổ sách trên lộ trình tài chính của bạn, không tự động trừ tiền trong tài khoản ngân hàng và không tính vào chi phí tiêu dùng tháng."
  - Hiển thị ví theo dõi đối chiếu (`Ví theo dõi: ...`) khi mục tiêu có liên kết ví.

### AC-008-4 (F16 - Contribution History Ledger): ĐẠT
- Thêm hàm API `listGoalContributions(goalId: string): Promise<GoalContribution[]>` trong `web/src/lib/api.ts`.
- Bổ sung nút "Lịch sử tích lũy" (icon đồng hồ) trên từng thẻ mục tiêu.
- Modal `GoalHistoryModal` hiển thị danh sách tất cả các lần thêm và rút tiền:
  - Giao dịch thêm tiền: hiển thị nhãn "Thêm tiền", dấu `+` màu xanh lá cây (`+5.000.000 ₫`).
  - Giao dịch rút tiền: hiển thị nhãn "Rút tiền", dấu `-` màu cam (`-1.000.000 ₫`).
  - Hiển thị ngày thực hiện và ghi chú chi tiết.

## 2. Kết Quả Kiểm Thử & Build
- `npm run typecheck` (`tsc --noEmit`): 0 lỗi.
- `npm test`: 12 test files, 115/115 tests PASS (100% GREEN):
  - `src/pages/GoalsPage.test.tsx` (6 tests PASS - F16 trọn vẹn)
  - Toàn bộ 11 suite tests khác tiếp tục PASS 100%.
- `npm run build`: Build production hoàn tất sạch sẽ (10.82s).
