import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/Toast';
import { GoalsPage } from './GoalsPage';
import type { FinancialAccount, SavingGoal, GoalContribution } from '../lib/types';

vi.mock('../lib/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  listGoals: vi.fn(),
  listAccounts: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  addGoalContribution: vi.fn(),
  listGoalContributions: vi.fn(),
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

const mockGoals: SavingGoal[] = [
  {
    id: 'goal-1',
    user_id: 'u1',
    name: 'Tiết kiệm mua xe',
    target_amount_minor: 50_000_000_00, // 50.000.000 ₫
    current_amount_minor: 10_000_000_00, // 10.000.000 ₫
    currency: 'VND',
    start_date: '2026-01-01',
    target_date: '2026-12-31',
    color: '#1e88e5',
    icon: 'car',
    status: 'active',
    note: 'Mua xe mới',
    linked_account_id: 'acc-1',
    client_generated_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
  },
  {
    id: 'goal-2',
    user_id: 'u1',
    name: 'Quỹ khẩn cấp rỗng',
    target_amount_minor: 20_000_000_00, // 20.000.000 ₫
    current_amount_minor: 0,
    currency: 'VND',
    start_date: '2026-01-01',
    target_date: null,
    color: '#15803d',
    icon: 'shield',
    status: 'active',
    note: null,
    linked_account_id: null,
    client_generated_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
  },
];

describe('GoalsPage (TIP-008 / F16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listGoals).mockResolvedValue([...mockGoals]);
    vi.mocked(api.listAccounts).mockResolvedValue([...mockAccounts]);
    vi.mocked(api.addGoalContribution).mockResolvedValue('contrib-1');
    vi.mocked(api.listGoalContributions).mockResolvedValue([]);
  });

  it('renders goals page with transparency banner and linked account info (AC-008-3)', async () => {
    render(
      <ToastProvider>
        <GoalsPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tiết kiệm mua xe')).toBeDefined();
    });

    // Check transparency banner
    expect(screen.getByText(/Ý nghĩa tài chính:/i)).toBeDefined();

    // Check linked account display
    expect(screen.getByText('Ví Tiền Mặt')).toBeDefined();

    // Check buttons on goal-1 (has balance) vs goal-2 (empty)
    const withdrawButtons = screen.getAllByRole('button', { name: /Rút tiền/i });
    expect(withdrawButtons.length).toBe(2);

    // goal-1 withdraw button should be enabled
    expect(withdrawButtons[0]).not.toBeDisabled();
    // goal-2 withdraw button should be disabled
    expect(withdrawButtons[1]).toBeDisabled();
  });

  it('handles deposit contribution with positive amount (AC-008-1, AC-008-3)', async () => {
    render(
      <ToastProvider>
        <GoalsPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tiết kiệm mua xe')).toBeDefined();
    });

    const addButtons = screen.getAllByRole('button', { name: /Thêm tiền/i });
    fireEvent.click(addButtons[0]);

    // Modal opens
    expect(screen.getByText('Thêm tiền vào "Tiết kiệm mua xe"')).toBeDefined();

    // Input amount: 2.000.000
    const input = screen.getByPlaceholderText('VD: 500.000');
    fireEvent.input(input, { target: { value: '2000000' } });

    // Click confirm
    const submitBtn = screen.getByRole('button', { name: /Xác nhận thêm tiền/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.addGoalContribution).toHaveBeenCalledWith(
        expect.objectContaining({
          goal_id: 'goal-1',
          amount_minor: 200_000_000, // 2.000.000 ₫ in minor
        }),
      );
    });
  });

  it('handles withdrawal with positive input and converts to negative amount (AC-008-1)', async () => {
    render(
      <ToastProvider>
        <GoalsPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tiết kiệm mua xe')).toBeDefined();
    });

    const withdrawButtons = screen.getAllByRole('button', { name: /Rút tiền/i });
    fireEvent.click(withdrawButtons[0]);

    // Modal opens
    expect(screen.getByText('Rút tiền khỏi "Tiết kiệm mua xe"')).toBeDefined();

    // Input amount: 3.000.000
    const input = screen.getByPlaceholderText('VD: 500.000');
    fireEvent.input(input, { target: { value: '3000000' } });

    // Click confirm
    const submitBtn = screen.getByRole('button', { name: /Xác nhận rút tiền/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.addGoalContribution).toHaveBeenCalledWith(
        expect.objectContaining({
          goal_id: 'goal-1',
          amount_minor: -300_000_000, // Negative in minor
        }),
      );
    });
  });

  it('prevents overdraw when withdrawal amount exceeds balance (AC-008-2)', async () => {
    render(
      <ToastProvider>
        <GoalsPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tiết kiệm mua xe')).toBeDefined();
    });

    const withdrawButtons = screen.getAllByRole('button', { name: /Rút tiền/i });
    fireEvent.click(withdrawButtons[0]);

    // Input amount: 15.000.000 (> 10.000.000 current balance)
    const input = screen.getByPlaceholderText('VD: 500.000');
    fireEvent.input(input, { target: { value: '15000000' } });

    // Click submit
    const submitBtn = screen.getByRole('button', { name: /Xác nhận rút tiền/i });
    fireEvent.click(submitBtn);

    // Expect error message
    expect(
      screen.getByText(/Số tiền rút không được vượt quá số dư hiện có/i),
    ).toBeDefined();

    // API should NOT be called
    expect(api.addGoalContribution).not.toHaveBeenCalled();
  });

  it('supports quick "Rút toàn bộ" action (AC-008-1)', async () => {
    render(
      <ToastProvider>
        <GoalsPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tiết kiệm mua xe')).toBeDefined();
    });

    const withdrawButtons = screen.getAllByRole('button', { name: /Rút tiền/i });
    fireEvent.click(withdrawButtons[0]);

    // Click quick button "Rút toàn bộ"
    const quickBtn = screen.getByText(/Rút toàn bộ/i);
    fireEvent.click(quickBtn);

    // Click confirm
    const submitBtn = screen.getByRole('button', { name: /Xác nhận rút tiền/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.addGoalContribution).toHaveBeenCalledWith(
        expect.objectContaining({
          goal_id: 'goal-1',
          amount_minor: -10_000_000_00,
        }),
      );
    });
  });

  it('renders contribution history ledger with + and - signs (AC-008-4)', async () => {
    const mockContributions: GoalContribution[] = [
      {
        id: 'c-1',
        goal_id: 'goal-1',
        user_id: 'u1',
        amount_minor: 5_000_000_00,
        occurred_at: '2026-02-01T10:00:00Z',
        note: 'Tiền thưởng Tết',
        transaction_id: null,
        client_generated_id: null,
        created_at: '2026-02-01T10:00:00Z',
      },
      {
        id: 'c-2',
        goal_id: 'goal-1',
        user_id: 'u1',
        amount_minor: -1_000_000_00,
        occurred_at: '2026-02-15T15:00:00Z',
        note: 'Bảo dưỡng xe tạm',
        transaction_id: null,
        client_generated_id: null,
        created_at: '2026-02-15T15:00:00Z',
      },
    ];
    vi.mocked(api.listGoalContributions).mockResolvedValue(mockContributions);

    render(
      <ToastProvider>
        <GoalsPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tiết kiệm mua xe')).toBeDefined();
    });

    // Click history button
    const historyBtn = screen.getByLabelText('Lịch sử Tiết kiệm mua xe');
    fireEvent.click(historyBtn);

    // Modal opens and history entries rendered
    await waitFor(() => {
      expect(screen.getByText(/Tiền thưởng Tết/)).toBeDefined();
      expect(screen.getByText(/Bảo dưỡng xe tạm/)).toBeDefined();
      expect(screen.getByText(/\+5\.000\.000/)).toBeDefined();
      expect(screen.getByText(/-1\.000\.000/)).toBeDefined();
    });
  });
});
