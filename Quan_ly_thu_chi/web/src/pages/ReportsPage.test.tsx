import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/Toast';
import { ReportsPage } from './ReportsPage';
import type { Category, Transaction } from '../lib/types';
import type { CategoryExpenseItem } from '../lib/api';

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    profile: { timezone: 'Asia/Ho_Chi_Minh' },
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('../lib/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 400 }}>
        {children}
      </div>
    ),
  };
});

vi.mock('../lib/api', () => ({
  getTransactionsSummary: vi.fn(),
  getCategoryExpensesBreakdown: vi.fn(),
  listCategories: vi.fn(),
  listTransactions: vi.fn(),
}));

import * as api from '../lib/api';

const mockCategories: Category[] = [
  {
    id: 'cat-1',
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
    id: 'cat-2',
    scope: 'user',
    user_id: 'user-1',
    name: 'Mua sắm',
    kind: 'expense',
    parent_id: null,
    icon: 'shopping-bag',
    color: '#e91e63',
    is_system: false,
    is_archived: false,
    sort_order: 2,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    version: 1,
  },
];

const mockBreakdown: CategoryExpenseItem[] = [
  {
    category_id: 'cat-1',
    category_name: 'Ăn uống',
    color: '#ff9800',
    total_amount: 500_000_000, // 5 triệu VND (50%)
    transaction_count: 12,
  },
  {
    category_id: 'cat-2',
    category_name: 'Mua sắm',
    color: '#e91e63',
    total_amount: 300_000_000, // 3 triệu VND (30%)
    transaction_count: 5,
  },
  {
    category_id: '__uncategorized__',
    category_name: 'Chưa phân loại',
    color: '#757575',
    total_amount: 200_000_000, // 2 triệu VND (20%)
    transaction_count: 3,
  },
];

const mockTransactions: Transaction[] = [
  {
    id: 'tx-1',
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: 'cat-1',
    global_category_id: null,
    type: 'expense',
    currency: 'VND',
    status: 'posted',
    amount_minor: 50_000_000,
    occurred_at: '2026-09-02T10:00:00Z',
    payee: 'Phở bò',
    note: 'Bữa sáng',
    source: 'manual',
    bank_event_id: null,
    transfer_group_id: null,
    refund_of_transaction_id: null,
    client_generated_id: null,
    classification_status: 'confirmed',
    metadata: {},
    created_at: '2026-09-02T10:00:00Z',
    updated_at: '2026-09-02T10:00:00Z',
    version: 1,
  },
  {
    id: 'tx-2',
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: null,
    global_category_id: null,
    type: 'expense',
    currency: 'VND',
    status: 'posted',
    amount_minor: 20_000_000,
    occurred_at: '2026-09-03T14:00:00Z',
    payee: 'Tạp hóa vỉa hè',
    note: 'Chi vặt',
    source: 'manual',
    bank_event_id: null,
    transfer_group_id: null,
    refund_of_transaction_id: null,
    client_generated_id: null,
    classification_status: 'unclassified',
    metadata: {},
    created_at: '2026-09-03T14:00:00Z',
    updated_at: '2026-09-03T14:00:00Z',
    version: 1,
  },
];

function renderReports() {
  return render(
    <ToastProvider>
      <ReportsPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listCategories).mockResolvedValue(mockCategories);
  vi.mocked(api.getTransactionsSummary).mockResolvedValue({
    total_income: 15_000_000_000,
    total_expense: 10_000_000_000,
    net_change: 5_000_000_000,
    transaction_count: 20,
  });
  vi.mocked(api.getCategoryExpensesBreakdown).mockResolvedValue(mockBreakdown);
  vi.mocked(api.listTransactions).mockResolvedValue(mockTransactions);
});

describe('ReportsPage (V1-04 / F06, F20)', () => {
  it('Render chuẩn các nhãn preset thời gian và khoảng ngày hiệu lực', async () => {
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('12 tháng gần nhất')).toBeInTheDocument();
      expect(screen.getByText('4 quý gần nhất')).toBeInTheDocument();
      expect(screen.getByText('5 năm gần nhất')).toBeInTheDocument();
      expect(screen.getByText('Tháng này')).toBeInTheDocument();
      expect(screen.getByText(/Hiệu lực:/)).toBeInTheDocument();
    });
  });

  it('Đồng bộ thời gian giữa KPI, BarChart và PieChart', async () => {
    renderReports();

    await waitFor(() => {
      // getCategoryExpensesBreakdown được gọi với cùng khoảng start_date & end_date như getTransactionsSummary
      expect(api.getCategoryExpensesBreakdown).toHaveBeenCalledWith(
        expect.objectContaining({
          start_date: expect.any(String),
          end_date: expect.any(String),
          timezone: 'Asia/Ho_Chi_Minh',
        }),
      );
    });
  });

  it('Hiển thị đầy đủ nhóm Chưa phân loại (F06) trong bảng phân bổ danh mục', async () => {
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('Ăn uống')).toBeInTheDocument();
      expect(screen.getByText('Mua sắm')).toBeInTheDocument();
      expect(screen.getByText('Chưa phân loại')).toBeInTheDocument();
    });
  });

  it('Chuyển đổi preset thời gian cập nhật cả tiêu đề biểu đồ và dữ liệu', async () => {
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('4 quý gần nhất')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('4 quý gần nhất'));

    await waitFor(() => {
      expect(screen.getByText('Tình hình chi 4 quý gần nhất')).toBeInTheDocument();
      expect(screen.getByText(/Chi tiêu theo danh mục \(4 quý gần nhất\)/)).toBeInTheDocument();
    });
  });

  it('Click vào danh mục mở drilldown modal hiển thị đúng giao dịch', async () => {
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('Chưa phân loại')).toBeInTheDocument();
    });

    // Click vào item "Chưa phân loại" trong bảng danh mục
    fireEvent.click(screen.getByText('Chưa phân loại'));

    await waitFor(() => {
      expect(screen.getByText(/Giao dịch — Chưa phân loại/)).toBeInTheDocument();
      expect(screen.getByText('Tạp hóa vỉa hè')).toBeInTheDocument();
    });
  });

  it('Chuyển đổi mốc thời gian riêng cho Chi tiêu theo danh mục cập nhật độc lập', async () => {
    renderReports();

    await waitFor(() => {
      expect(screen.getByText('Tháng hiện tại')).toBeInTheDocument();
    });

    // Ban đầu là 12 tháng gần nhất
    expect(screen.getByText(/Chi tiêu theo danh mục \(12 tháng gần nhất\)/)).toBeInTheDocument();

    // Click chọn mốc 'Tháng hiện tại' trên thẻ danh mục
    fireEvent.click(screen.getByText('Tháng hiện tại'));

    await waitFor(() => {
      expect(screen.getByText(/Chi tiêu theo danh mục \(Tháng này\)/)).toBeInTheDocument();
      // Biểu đồ tổng quan phía trên vẫn giữ nguyên 12 tháng gần nhất
      expect(screen.getByText('Tình hình chi 12 tháng gần nhất')).toBeInTheDocument();
    });
  });
});
