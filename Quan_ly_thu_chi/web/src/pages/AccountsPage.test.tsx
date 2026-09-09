import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider } from '../hooks/useConfirm';
import { ToastProvider } from '../components/Toast';
import { AccountsPage } from './AccountsPage';
import type { FinancialAccount } from '../lib/types';

vi.mock('../lib/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  listAccountsWithBalances: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  archiveAccount: vi.fn(),
  unarchiveAccount: vi.fn(),
  adjustAccountBalance: vi.fn(),
}));

import * as api from '../lib/api';

const mockAccounts: (FinancialAccount & { balance: number })[] = [
  {
    id: 'acc-1',
    user_id: 'u1',
    name: 'Ví Tiền Mặt',
    type: 'cash',
    currency: 'VND',
    opening_balance_minor: 1000000,
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
    balance: 1500000,
  },
  {
    id: 'acc-2',
    user_id: 'u1',
    name: 'Tài khoản cũ',
    type: 'bank',
    currency: 'VND',
    opening_balance_minor: 0,
    opening_balance_at: '2026-01-01T00:00:00Z',
    credit_limit_minor: null,
    institution_name: 'Techcombank',
    masked_account_number: null,
    color: '#475569',
    icon: 'account_balance',
    is_archived: true,
    include_in_net_worth: true,
    reported_balance_minor: null,
    reported_balance_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    balance: 0,
  },
];

describe('AccountsPage (F22: Archive, Restore, Financial Warnings, Dirty Guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAccountsWithBalances).mockResolvedValue(mockAccounts);
  });

  function renderPage() {
    return render(
      <ConfirmProvider>
        <ToastProvider>
          <AccountsPage />
        </ToastProvider>
      </ConfirmProvider>
    );
  }

  it('renders active accounts by default and displays tab counts', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ví Tiền Mặt')).toBeInTheDocument();
    });

    // Active tab has count 1, archived tab has count 1
    expect(screen.getByText('Đang hoạt động (1)')).toBeInTheDocument();
    expect(screen.getByText('Đã lưu trữ (1)')).toBeInTheDocument();
    expect(screen.queryByText('Tài khoản cũ')).not.toBeInTheDocument();
  });

  it('switches to archived tab and shows unarchive button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ví Tiền Mặt')).toBeInTheDocument();
    });

    // Switch to archived tab
    fireEvent.click(screen.getByText('Đã lưu trữ (1)'));

    await waitFor(() => {
      expect(screen.getByText('Tài khoản cũ')).toBeInTheDocument();
      expect(screen.getByText('Khôi phục tài khoản')).toBeInTheDocument();
    });

    expect(screen.queryByText('Ví Tiền Mặt')).not.toBeInTheDocument();
  });

  it('calls unarchiveAccount when clicking Khôi phục tài khoản and confirming', async () => {
    vi.mocked(api.unarchiveAccount).mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ví Tiền Mặt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Đã lưu trữ (1)'));

    await waitFor(() => {
      expect(screen.getByText('Khôi phục tài khoản')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Khôi phục tài khoản'));

    // Confirm dialog appears
    await waitFor(() => {
      expect(screen.getByText('Khôi phục tài khoản?')).toBeInTheDocument();
    });

    // Click Khôi phục inside modal
    const confirmButtons = screen.getAllByRole('button', { name: 'Khôi phục' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(api.unarchiveAccount).toHaveBeenCalledWith('acc-2');
    });
  });

  it('shows financial balance warning when archiving an account with positive balance', async () => {
    vi.mocked(api.archiveAccount).mockResolvedValue(undefined);
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Ví Tiền Mặt')).toBeInTheDocument();
    });

    // Click Lưu trữ on active account (balance: 1.500.000)
    fireEvent.click(screen.getByText('Lưu trữ'));

    await waitFor(() => {
      expect(screen.getByText('Lưu trữ tài khoản?')).toBeInTheDocument();
      // Should show warning about remaining balance
      expect(screen.getByText(/CẢNH BÁO TÀI CHÍNH/i)).toBeInTheDocument();
    });
  });
});
