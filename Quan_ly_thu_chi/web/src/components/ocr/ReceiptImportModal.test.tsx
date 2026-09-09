import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReceiptImportModal } from './ReceiptImportModal';
import { ToastProvider } from '../Toast';
import type { FinancialAccount, Category } from '../../lib/types';
import type { PreviewRow } from './ReceiptPreviewTable';
import * as atomic from '../../lib/ocrAtomic';

vi.mock('../../lib/api', () => ({
  getPeople: vi.fn().mockResolvedValue([{ id: 'person-1', name: 'Nguyễn Văn A' }]),
  getOrCreatePerson: vi.fn().mockResolvedValue({ id: 'person-1', name: 'Nguyễn Văn A' }),
  getBillWithItems: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/ocr', async () => {
  const actual = await vi.importActual<typeof import('../../lib/ocr')>('../../lib/ocr');
  return {
    ...actual,
    parseReceiptFromImage: vi.fn().mockResolvedValue({
      image_quality: 'good',
      transactions: [{
        type: 'expense',
        amount_minor: 100_000,
        occurred_at: '2026-09-08T10:00:00Z',
        payee: 'Cửa hàng',
        note: 'OCR row',
        confidence: 0.99,
        account_hint: 'Ví Tiền Mặt',
        suggested_category: 'Mua sắm',
      }],
    }),
  };
});

vi.mock('../../lib/ocrAtomic', async () => {
  const actual = await vi.importActual<typeof import('../../lib/ocrAtomic')>('../../lib/ocrAtomic');
  return { ...actual, createOcrRowAtomic: vi.fn() };
});

// The dropzone is only the image staging boundary in these tests. The modal,
// preview state, retry state, and commit button remain real component paths.
vi.mock('./ReceiptDropzone', () => ({
  ReceiptDropzone: ({ onChange }: { onChange: (images: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() => onChange([{ id: 'image-1', file: new File(['image'], 'receipt.png', { type: 'image/png' }), previewUrl: 'blob:test' }])}
    >
      Stage OCR image
    </button>
  ),
}));

// This keeps the test focused on ReceiptImportModal's row-result contract while
// still driving it via the actual preview child boundary and save button.
vi.mock('./ReceiptPreviewTable', () => ({
  ReceiptPreviewTable: ({ rows, onChange }: { rows: PreviewRow[]; onChange: (rows: PreviewRow[]) => void }) => (
    <div>
      <button
        type="button"
        onClick={() => onChange(rows.map(row => ({
          ...row,
          bill: {
            channel: 'offline',
            marketplace: null,
            marketplace_other: null,
            store_name: 'Cửa hàng',
            has_bill: false,
          },
          split_share: {
            person_id: 'person-1',
            person_name: 'Nguyễn Văn A',
            amount_minor: 50_000,
            percentage: 50,
          },
        })))}
      >
        Configure bill and debt
      </button>
      <div data-testid="preview-row-count">{rows.length}</div>
      {rows.map(row => row.import_error && <div key={row.id}>row-error:{row.import_error}</div>)}
    </div>
  ),
}));

const mockAccounts: FinancialAccount[] = [{
  id: 'acc-1', user_id: 'u1', name: 'Ví Tiền Mặt', type: 'cash', currency: 'VND',
  opening_balance_minor: 0, opening_balance_at: '2026-01-01T00:00:00Z', credit_limit_minor: null,
  institution_name: null, masked_account_number: null, color: '#000', icon: 'wallet',
  is_archived: false, include_in_net_worth: true, reported_balance_minor: null,
  reported_balance_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1,
}];

const mockCategories: Category[] = [{
  id: 'cat-1', scope: 'user', user_id: 'u1', name: 'Mua sắm', kind: 'expense', parent_id: null,
  color: '#f00', icon: 'shopping-bag', is_system: false, is_archived: false, sort_order: 1,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1,
}];

function renderModal(onClose = vi.fn()) {
  return render(
    <ToastProvider>
      <ReceiptImportModal
        open
        onClose={onClose}
        onSaved={vi.fn()}
        accounts={mockAccounts}
        categories={mockCategories}
      />
    </ToastProvider>,
  );
}

describe('ReceiptImportModal atomic OCR path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the row editable when the atomic operation fails, including bill/debt work', async () => {
    const operation = vi.mocked(atomic.createOcrRowAtomic);
    operation.mockRejectedValueOnce(new Error('bill/debt validation failed'));

    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Stage OCR image' }));
    fireEvent.click(screen.getByRole('button', { name: /Phân tích 1 ảnh/ }));
    await screen.findByRole('button', { name: 'Configure bill and debt' });
    fireEvent.click(screen.getByRole('button', { name: 'Configure bill and debt' }));
    fireEvent.click(screen.getByRole('button', { name: /Import 1 giao dịch/ }));

    await waitFor(() => expect(screen.getByTestId('preview-row-count')).toHaveTextContent('1'));
    expect(screen.getByText(/row-error:bill\/debt validation failed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thử lại 1 dòng lỗi/ })).toBeInTheDocument();
  });

  it('retries the same stable row payload and removes the row only after the atomic result succeeds', async () => {
    const operation = vi.mocked(atomic.createOcrRowAtomic);
    const onClose = vi.fn();
    operation
      .mockRejectedValueOnce(new Error('temporary unknown outcome'))
      .mockResolvedValueOnce({ transaction_ids: ['tx-1'], bill_id: 'bill-1', debt_id: 'debt-1' });

    renderModal(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Stage OCR image' }));
    fireEvent.click(screen.getByRole('button', { name: /Phân tích 1 ảnh/ }));
    await screen.findByRole('button', { name: 'Configure bill and debt' });
    fireEvent.click(screen.getByRole('button', { name: 'Configure bill and debt' }));
    fireEvent.click(screen.getByRole('button', { name: /Import 1 giao dịch/ }));
    await screen.findByRole('button', { name: /Thử lại 1 dòng lỗi/ });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Thử lại 1 dòng lỗi/ }));
    await waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(operation).toHaveBeenCalledTimes(2);
    const first = operation.mock.calls[0]![0];
    const second = operation.mock.calls[1]![0];
    expect(second.row_id).toBe(first.row_id);
    expect(second.splits.map(split => split.client_generated_id)).toEqual(
      first.splits.map(split => split.client_generated_id),
    );
    expect(second.bill).toEqual(first.bill);
    expect(second.debt).toEqual(first.debt);
  });
});
