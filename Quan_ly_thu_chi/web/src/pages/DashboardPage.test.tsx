import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import type { Budget, FinancialAccount, RecurringRule, Transaction } from '../lib/types';

vi.mock('../lib/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    profile: { timezone: 'Asia/Ho_Chi_Minh' },
  }),
}));

vi.mock('../lib/api', () => ({
  listAccountsWithBalances: vi.fn(),
  listTransactions: vi.fn(),
  listCategories: vi.fn(),
  getNetWorth: vi.fn(),
  getTransactionsSummary: vi.fn(),
  listBudgets: vi.fn(),
  getBudgetProgress: vi.fn(),
  listRecurring: vi.fn(),
}));

import * as api from '../lib/api';

const mockAccounts: (FinancialAccount & { balance: number })[] = [
  {
    id: 'acc-1',
    user_id: 'u1',
    name: 'Ví Tiền Mặt',
    type: 'cash',
    currency: 'VND',
    opening_balance_minor: 0,
    opening_balance_at: '2026-01-01T00:00:00Z',
    credit_limit_minor: null,
    institution_name: null,
    masked_account_number: null,
    color: '#15803d',
    icon: 'wallet',
    is_archived: false,
    include_in_net_worth: true,
    reported_balance_minor: null,
    reported_balance_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    balance: 5000000,
  },
];

const mockRecentTxs = [
  {
    id: 'tx-1',
    user_id: 'u1',
    account_id: 'acc-1',
    category_id: null, // uncategorized!
    global_category_id: null,
    type: 'expense',
    amount_minor: 120000,
    occurred_at: '2026-09-01T10:00:00Z',
    payee: 'Cửa hàng tiện lợi',
    note: null,
    status: 'posted',
    source: 'manual',
    from_account_id: null,
    to_account_id: null,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    version: 1,
  },
] as unknown as Transaction[];

const mockBudgets: Budget[] = [
  {
    id: 'b-1',
    user_id: 'u1',
    name: 'Ăn uống',
    category_ids: ['c-1'],
    amount_minor: 5000000,
    cadence: 'monthly',
    is_active: true,
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    rollover_enabled: false,
    alert_thresholds: [80, 100],
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    version: 1,
  },
];

describe('DashboardPage (F21, F27, F19: Chênh Lệch Thu Chi, Actionable Insights, 6 mục mới nhất)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccountsWithBalances).mockResolvedValue(mockAccounts);
    vi.mocked(api.listTransactions).mockResolvedValue(mockRecentTxs);
    vi.mocked(api.listCategories).mockResolvedValue([]);
    vi.mocked(api.getNetWorth).mockResolvedValue(5000000);
    vi.mocked(api.getTransactionsSummary).mockResolvedValue({
      total_income: 1_000_000_000, // 10.000.000 ₫
      total_expense: 400_000_000, // 4.000.000 ₫
      net_change: 600_000_000,
      transaction_count: 5,
    });
    vi.mocked(api.listBudgets).mockResolvedValue(mockBudgets);
    vi.mocked(api.getBudgetProgress).mockResolvedValue({
      budget_id: 'b-1',
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      spent_minor: 4500000, // 90%
      transaction_count: 10,
      percent: 90,
    });
    vi.mocked(api.listRecurring).mockResolvedValue([]);
  });

  function renderDashboard() {
    return render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
  }

  it('renders "Chênh lệch thu–chi" label on monthly expense card (F21)', async () => {
    renderDashboard();

    await waitFor(() => {
      // 10.000.000 - 4.000.000 = +6.000.000
      expect(screen.getByText(/Chênh lệch thu–chi: \+6\.000\.000 ₫/i)).toBeInTheDocument();
    });
  });

  it('displays correct recent items count (F27)', async () => {
    renderDashboard();

    await waitFor(() => {
      // We had 1 recent transaction, so header shows "1 mục mới nhất"
      expect(screen.getByText(/1 mục mới nhất/i)).toBeInTheDocument();
    });

    expect(api.listTransactions).toHaveBeenCalledWith({ limit: 6 });
  });

  it('renders Actionable Insights for budget warning and uncategorized tx (F21)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Cần chú ý/i)).toBeInTheDocument();
    });

    // Budget insight: 90%
    expect(screen.getByText(/Ngân sách chạm 90%/i)).toBeInTheDocument();
    // Uncategorized insight: 1 transaction
    expect(screen.getByText(/1 giao dịch chưa phân loại/i)).toBeInTheDocument();
  });

  it('renders Onboarding banner when user has zero accounts (F19)', async () => {
    vi.mocked(api.listAccountsWithBalances).mockResolvedValue([]);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Bắt đầu với Quản lý thu chi/i)).toBeInTheDocument();
      expect(screen.getByText(/Thiết lập tài khoản ngay/i)).toBeInTheDocument();
    });
  });
});
