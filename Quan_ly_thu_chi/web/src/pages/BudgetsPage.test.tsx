import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/Toast';
import { BudgetsPage } from './BudgetsPage';
import type { Budget, Category } from '../lib/types';

vi.mock('../lib/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  listBudgets: vi.fn(),
  listCategories: vi.fn(),
  getBudgetProgress: vi.fn(),
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  toggleBudgetActive: vi.fn(),
  deleteBudget: vi.fn(),
}));

import * as api from '../lib/api';

const mockCategories: Category[] = [
  {
    id: 'cat-parent-1',
    scope: 'user',
    user_id: 'user-1',
    name: 'Ăn uống',
    kind: 'expense',
    parent_id: null,
    icon: 'utensils',
    color: '#ff9800',
    is_system: false,
    is_archived: false,
    sort_order: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    version: 1,
  },
  {
    id: 'cat-child-1',
    scope: 'user',
    user_id: 'user-1',
    name: 'Cà phê',
    kind: 'expense',
    parent_id: 'cat-parent-1',
    icon: 'coffee',
    color: '#ff9800',
    is_system: false,
    is_archived: false,
    sort_order: 2,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    version: 1,
  },
];

const mockBudgets: Budget[] = [
  {
    id: 'b-1',
    user_id: 'user-1',
    name: 'Ăn uống tháng 9',
    cadence: 'monthly',
    amount_minor: 500_000_000, // 5 triệu VND
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    rollover_enabled: false,
    alert_thresholds: [75, 90, 100],
    is_active: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    version: 1,
    category_ids: ['cat-parent-1'],
  },
  {
    id: 'b-2',
    user_id: 'user-1',
    name: 'Chi tiêu tổng (toàn bộ)',
    cadence: 'monthly',
    amount_minor: 1_000_000_000, // 10 triệu VND
    start_date: '2026-09-01',
    end_date: null,
    rollover_enabled: false,
    alert_thresholds: [75, 90, 100],
    is_active: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    version: 1,
    category_ids: [], // Toàn bộ chi tiêu (F04)
  },
  {
    id: 'b-3',
    user_id: 'user-1',
    name: 'Ngân sách du lịch (tạm dừng)',
    cadence: 'custom',
    amount_minor: 2_000_000_000,
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    rollover_enabled: false,
    alert_thresholds: [75, 90, 100],
    is_active: false,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    version: 1,
    category_ids: [],
  },
];

function renderPage() {
  return render(
    <ToastProvider>
      <BudgetsPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listBudgets).mockResolvedValue(mockBudgets);
  vi.mocked(api.listCategories).mockResolvedValue(mockCategories);
  vi.mocked(api.getBudgetProgress).mockImplementation(async (budgetId) => {
    if (budgetId === 'b-1') {
      return {
        budget_id: 'b-1',
        period_start: '2026-09-01T00:00:00Z',
        period_end: '2026-10-01T00:00:00Z',
        spent_minor: 650_000_000, // 6.5 triệu (vượt 130%)
        transaction_count: 14,
        percent: 130,
      };
    }
    if (budgetId === 'b-2') {
      return {
        budget_id: 'b-2',
        period_start: '2026-09-01T00:00:00Z',
        period_end: '2026-10-01T00:00:00Z',
        spent_minor: 400_000_000, // 4 triệu (40%)
        transaction_count: 8,
        percent: 40,
      };
    }
    return undefined;
  });
});

describe('BudgetsPage (V1-03 / F03, F04, F17)', () => {
  it('Hiển thị danh sách ngân sách, phân biệt badge Toàn bộ chi tiêu vs Danh mục cụ thể', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ăn uống tháng 9')).toBeInTheDocument();
      expect(screen.getByText('Chi tiêu tổng (toàn bộ)')).toBeInTheDocument();
    });

    // Badge Toàn bộ chi tiêu cho b-2
    expect(screen.getByText('Toàn bộ chi tiêu')).toBeInTheDocument();
    // Badge danh mục cụ thể cho b-1
    expect(screen.getByText('Ăn uống')).toBeInTheDocument();
  });

  it('Hiển thị phần trăm thực tế và cảnh báo vượt ngân sách mà không bị cap ở 150%', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('130% đã dùng')).toBeInTheDocument();
      expect(screen.getByText(/Vượt ngân sách/)).toBeInTheDocument();
      expect(screen.getByText('40% đã dùng')).toBeInTheDocument();
    });
  });

  it('Lọc theo Tab trạng thái: Đang chạy vs Đã tạm dừng vs Tất cả', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ăn uống tháng 9')).toBeInTheDocument();
    });

    // Tab mặc định là "Đang chạy" → không có b-3
    expect(screen.queryByText('Ngân sách du lịch (tạm dừng)')).not.toBeInTheDocument();

    // Chuyển sang tab "Đã tạm dừng"
    fireEvent.click(screen.getByRole('button', { name: /Đã tạm dừng/ }));

    await waitFor(() => {
      expect(screen.getByText('Ngân sách du lịch (tạm dừng)')).toBeInTheDocument();
      expect(screen.queryByText('Ăn uống tháng 9')).not.toBeInTheDocument();
    });

    // Chuyển sang tab "Tất cả"
    fireEvent.click(screen.getByRole('button', { name: /Tất cả/ }));

    await waitFor(() => {
      expect(screen.getByText('Ăn uống tháng 9')).toBeInTheDocument();
      expect(screen.getByText('Ngân sách du lịch (tạm dừng)')).toBeInTheDocument();
    });
  });

  it('Xử lý lỗi riêng cho từng thẻ khi tải tiến độ thất bại (không nuốt lỗi thành 0)', async () => {
    vi.mocked(api.getBudgetProgress).mockImplementation(async (budgetId) => {
      if (budgetId === 'b-1') {
        throw new Error('RPC timeout');
      }
      return {
        budget_id: 'b-2',
        period_start: '2026-09-01T00:00:00Z',
        period_end: '2026-10-01T00:00:00Z',
        spent_minor: 100_000_000,
        transaction_count: 2,
        percent: 10,
      };
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Không thể tải tiến độ/)).toBeInTheDocument();
      expect(screen.getByText('Thử lại')).toBeInTheDocument();
    });
  });

  it('Thao tác tạm dừng / kích hoạt lại ngân sách (toggle active)', async () => {
    vi.mocked(api.toggleBudgetActive).mockResolvedValue({
      ...mockBudgets[0],
      is_active: false,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ăn uống tháng 9')).toBeInTheDocument();
    });

    const pauseBtn = screen.getAllByTitle('Tạm dừng ngân sách')[0];
    fireEvent.click(pauseBtn);

    await waitFor(() => {
      expect(api.toggleBudgetActive).toHaveBeenCalledWith('b-1', false);
    });
  });

  it('Tạo ngân sách với phạm vi Toàn bộ chi tiêu (F04)', async () => {
    vi.mocked(api.createBudget).mockResolvedValue({
      id: 'b-new',
      user_id: 'user-1',
      name: 'Chi tiêu tự do',
      cadence: 'monthly',
      amount_minor: 300_000_000,
      start_date: '2026-09-01',
      end_date: null,
      rollover_enabled: false,
      alert_thresholds: [75, 90, 100],
      is_active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      version: 1,
      category_ids: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Thêm ngân sách')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Thêm ngân sách'));

    // Nhập form
    const nameInput = screen.getByPlaceholderText(/VD: Ăn uống & Mua sắm/);
    fireEvent.change(nameInput, { target: { value: 'Chi tiêu tự do' } });

    const amountInput = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
    fireEvent.input(amountInput, { target: { value: '3000000' } });

    // Phạm vi mặc định là "Toàn bộ chi tiêu"
    expect(screen.getByLabelText(/Toàn bộ chi tiêu/)).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      expect(api.createBudget).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Chi tiêu tự do',
          category_ids: [],
        }),
      );
    });
  });
});
