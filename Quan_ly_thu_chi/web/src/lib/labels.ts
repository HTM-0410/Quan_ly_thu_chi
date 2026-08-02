export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  bank: 'Ngân hàng',
  ewallet: 'Ví điện tử',
  credit_card: 'Thẻ tín dụng',
  savings: 'Tiết kiệm',
  other: 'Khác',
};

export const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  income: 'Thu nhập',
  expense: 'Chi tiêu',
  transfer: 'Chuyển khoản',
  refund: 'Hoàn tiền',
  adjustment: 'Điều chỉnh',
};

export const CATEGORY_KIND_LABEL: Record<string, string> = {
  income: 'Thu nhập',
  expense: 'Chi tiêu',
  both: 'Cả hai',
};

export const GOAL_STATUS_LABEL: Record<string, string> = {
  active: 'Đang thực hiện',
  completed: 'Hoàn thành',
  paused: 'Tạm dừng',
  abandoned: 'Đã bỏ',
};

export const RECURRING_FREQ_LABEL: Record<string, string> = {
  daily: 'Hằng ngày',
  weekly: 'Hằng tuần',
  biweekly: '2 tuần/lần',
  monthly: 'Hằng tháng',
  quarterly: 'Hằng quý',
  yearly: 'Hằng năm',
};

export const RECURRING_STATUS_LABEL: Record<string, string> = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  ended: 'Kết thúc',
};

export const BUDGET_CADENCE_LABEL: Record<string, string> = {
  weekly: 'Hằng tuần',
  monthly: 'Hằng tháng',
  custom: 'Tùy chỉnh',
};