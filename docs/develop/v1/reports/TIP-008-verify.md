# Báo Cáo Nghiệm Thu TIP-008: Mục Tiêu Tích Lũy Rõ Ý Nghĩa, Rút Được Tiền & Lịch Sử Phân Bổ

## 1. Thông Tin Nghiệm Thu
- **TIP:** TIP-008 (V1-08 / F16: Mục Tiêu Rõ Ý Nghĩa & Rút Được).
- **Vai trò:** THẦU (Contractor).
- **Ngày kiểm định:** 2026-09-07.
- **Trạng thái:** **ACCEPTED (CHẤP THUẬN NGHIỆM THU)**.

---

## 2. Đối Chiếu Tiêu Chí Nghiệm Thu (Acceptance Criteria)

| Tiêu Chí | Yêu Cầu | Kết Quả Thẩm Định | Đánh Giá |
| :--- | :--- | :--- | :--- |
| **AC-008-1** | **F16 — Separate Deposit & Withdrawal Actions:** Tách bạch 2 hành động "Thêm tiền" và "Rút tiền" với số tiền dương; "Rút tiền" bị vô hiệu hóa khi mục tiêu chưa có tiền; hỗ trợ nút "Rút toàn bộ". | ĐÃ ĐẠT: Giao diện `GoalsPage.tsx` cung cấp 2 nút riêng biệt; `VNDInput` chỉ nhận số tiền dương; nút "Rút tiền" disable khi `current_amount_minor <= 0`; nút "Rút toàn bộ" điền nhanh đúng số dư hiện tại. | **PASS** |
| **AC-008-2** | **F16 — Overdraw Prevention & Balance Boundary:** Chặn rút vượt số dư tại cả UI và Database RPC `add_goal_contribution`. Khóa hàng `FOR UPDATE`. | ĐÃ ĐẠT: Migration `20260810000010_goal_contribution_withdrawal_and_lifecycle.sql` kiểm tra `p_amount_minor < 0 AND v_current + p_amount_minor < 0` ném ngoại lệ. UI hiển thị cảnh báo validation và khóa submit khi nhập vượt số dư. | **PASS** |
| **AC-008-3** | **F16 — Lifecycle Reversal & Non-Expense Semantics:** Đảo trạng thái thông minh (`completed` khi đủ, quay lại `active` khi rút dưới mức); không sinh expense làm sai KPI thu chi (Quyết định D05); banner minh bạch ý nghĩa sổ sách. | ĐÃ ĐẠT: RPC cập nhật trạng thái vòng đời 2 chiều. Thêm/rút chỉ cập nhật `goal_contributions`, không làm tăng chi tiêu tiêu dùng. Banner giải thích rõ ràng ý nghĩa phân bổ hiển thị trên trang. | **PASS** |
| **AC-008-4** | **F16 — Contribution History Ledger:** Hiển thị sổ cái lịch sử các lần nạp/rút tiền của từng mục tiêu, phân biệt dấu `+` xanh và `-` cam. | ĐÃ ĐẠT: API `listGoalContributions` hoạt động chuẩn xác; `GoalHistoryModal` hiển thị danh sách chi tiết các lần thêm/rút tiền kèm ghi chú và ngày tháng. | **PASS** |

---

## 3. Bằng Chứng Tự Động Hóa
- `tsc --noEmit`: PASS 0 lỗi.
- `npm run build`: Build production Vite thành công (10.82s).
- Vitest: 12 test files, 115/115 tests PASS (100% offline).
  - `src/pages/GoalsPage.test.tsx` (6 tests PASS)
  - Toàn bộ suite tests ứng dụng hoạt động ổn định.

---

## 4. Kết Luận & Chuyển Tiếp
THẦU chính thức nghiệm thu đạt TIP-008 (**ACCEPTED**).
Cập nhật `CHECKPOINT.md` và `REQUIREMENTS_MATRIX.md` (F16 -> DONE).
Chính thức kết thúc toàn bộ Đợt 3 (Wave 3)!

Tiếp tục chuyển sang Đợt 4 (Wave 4) với các TIP còn lại:
- **TIP-009 (V1-09 / F18, F19, F22, F24: Onboarding, Tài Khoản & Ghi Nhanh)**
- **TIP-010 (V1-10 / F21, F24, F27: Dashboard, Export & Vòng Quay Lại)**
- **TIP-011 / Verification Final**
