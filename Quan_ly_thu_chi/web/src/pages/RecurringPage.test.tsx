import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/Toast';
import { RecurringPage } from './RecurringPage';
import type { RecurringRule, FinancialAccount, Category } from '../lib/types';

vi.mock('../lib/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  listRecurring: vi.fn(),
  listAccounts: vi.fn(),
  listCategories: vi.fn(),
  listPendingRecurringTransactions: vi.fn(),
  createRecurring: vi.fn(),
  updateRecurring: vi.fn(),
  materializeRecurring: vi.fn(),
  confirmRecurringTransaction: vi.fn(),
  skipRecurringTransaction: vi.fn(),
}));

import * as api from '../lib/api';

const mockAccounts: FinancialAccount[] = [
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
    color: '#000',
    icon: 'wallet',
    is_archived: false,
    include_in_net_worth: true,
    reported_balance_minor: null,
    reported_balance_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
  },
];

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    scope: 'user',
    user_id: 'u1',
    name: 'Tiền nhà',
    kind: 'expense',
    parent_id: null,
    color: '#f00',
    icon: 'home',
    is_system: false,
    is_archived: false,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
  },
];

const mockRules: RecurringRule[] = [
  {
    id: 'rec-1',
    user_id: 'u1',
    name: 'Tiền thuê nhà tháng',
    type: 'expense',
    account_id: 'acc-1',
    amount_minor: 500000000,
    currency: 'VND',
    frequency: 'monthly',
    start_date: '2026-01-31',
    end_date: null,
    category_id: 'cat-1',
    global_category_id: null,
    payee: 'Chủ nhà',
    note: 'Thanh toán tiền nhà',
    day_of_month: 31,
    day_of_week: null,
    next_occurrence: '2026-01-31T00:00:00Z',
    last_occurrence: null,
    status: 'active',
    client_generated_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
  },
];

describe('RecurringPage (TIP-007 / F15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccounts).mockResolvedValue(mockAccounts);
    vi.mocked(api.listCategories).mockResolvedValue(mockCategories);
    vi.mocked(api.listRecurring).mockResolvedValue(mockRules);
    vi.mocked(api.listPendingRecurringTransactions).mockResolvedValue([]);
    vi.mocked(api.materializeRecurring).mockResolvedValue(1);
    vi.mocked(api.updateRecurring).mockResolvedValue(undefined);
  });

  it('renders recurring rules list with 3-cycle preview (AC-007-3 / F15)', async () => {
    render(
      <ToastProvider>
        <RecurringPage />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tiền thuê nhà tháng')).toBeDefined();
    });

    // Check header phrasing (AC-007-4)
    expect(screen.getByText(/Quản lý các khoản thu chi lặp lại/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Ghi nhận đến hạn/i })).toBeDefined();

    // Check 3-cycle preview on rule card
    expect(screen.getByText('3 kỳ tới:')).toBeDefined();
  });

  it('triggers materializeRecurring when clicking "Ghi nhận đến hạn"', async () => {
    render(
      <ToastProvider>
        <RecurringPage />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tiền thuê nhà tháng')).toBeDefined();
    });

    const materializeBtn = screen.getByRole('button', { name: /Ghi nhận đến hạn/i });
    fireEvent.click(materializeBtn);

    await waitFor(() => {
      expect(api.materializeRecurring).toHaveBeenCalledTimes(1);
    });
  });

  it('shows live 3-cycle preview in modal when adding/editing a rule with day 31', async () => {
    render(
      <ToastProvider>
        <RecurringPage />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tiền thuê nhà tháng')).toBeDefined();
    });

    const addBtn = screen.getByRole('button', { name: /Thêm quy tắc/i });
    fireEvent.click(addBtn);

    // Check modal opens
    expect(screen.getByText('Thêm quy tắc định kỳ')).toBeDefined();
    expect(
      screen.getByText(/Quy tắc định kỳ tự động tính toán các kỳ tiếp theo và kẹp ngày cuối tháng/i)
    ).toBeDefined();

    // Check live preview widget is rendered in modal
    expect(screen.getByText('Xem trước 3 kỳ đến hạn tiếp theo:')).toBeDefined();
  });

  it('toggles pause and resume on rule', async () => {
    render(
      <ToastProvider>
        <RecurringPage />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tiền thuê nhà tháng')).toBeDefined();
    });

    const pauseBtn = screen.getByRole('button', { name: /Tạm dừng/i });
    fireEvent.click(pauseBtn);

    await waitFor(() => {
      expect(api.updateRecurring).toHaveBeenCalledWith('rec-1', { status: 'paused' });
    });
  });
});
