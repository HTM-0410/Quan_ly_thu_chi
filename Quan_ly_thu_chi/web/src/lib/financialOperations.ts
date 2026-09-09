import { supabase } from './supabase';

export type PayingForOperationInput = {
  operation_id: string;
  account_id: string;
  expense_amount_minor: number;
  payment_amount_minor: number;
  debt_id: string;
  occurred_at: string;
  category_id?: string | null;
  payee?: string | null;
  note?: string | null;
};

export type PayingForOperationResult = {
  success: true;
  operation_id: string;
  expense_transaction_id: string;
  income_transaction_id: string;
  payment_id: string;
  debt_id: string;
  consumer_expense_amount_minor: number;
  remaining_amount: number;
  status: 'active' | 'paid';
  idempotent?: boolean;
};

type SupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: number;
  statusCode?: number;
};

function categoryFields(categoryId: string | null | undefined) {
  if (!categoryId) return { category_id: null, global_category_id: null };
  if (categoryId.startsWith('global:')) {
    return { category_id: null, global_category_id: categoryId.slice('global:'.length) };
  }
  return { category_id: categoryId, global_category_id: null };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const value = error as SupabaseError;
    return [value.message, value.details, value.hint].filter(Boolean).join(' — ') || String(error);
  }
  return String(error);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) return true;
  if (!error || typeof error !== 'object') return false;
  const value = error as SupabaseError;
  const status = value.status ?? value.statusCode;
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status != null && status >= 500) ||
    value.code === '23505'
  );
}

/**
 * Atomically records the expense made on somebody else's behalf, the principal
 * reimbursement, and the debt payment. The caller owns operation_id for the
 * lifetime of the form; retries must pass the same value.
 */
export async function createPayingForOperation(
  input: PayingForOperationInput,
): Promise<PayingForOperationResult> {
  if (!Number.isSafeInteger(input.expense_amount_minor) || input.expense_amount_minor <= 0) {
    throw new Error('Số tiền chi hộ phải lớn hơn 0.');
  }
  if (!Number.isSafeInteger(input.payment_amount_minor) || input.payment_amount_minor <= 0) {
    throw new Error('Số tiền thu lại phải lớn hơn 0.');
  }
  if (input.payment_amount_minor > input.expense_amount_minor) {
    throw new Error('Số tiền thu lại không được vượt quá số tiền chi hộ.');
  }

  const categories = categoryFields(input.category_id);
  const params = {
    p_operation_id: input.operation_id,
    p_account_id: input.account_id,
    p_expense_amount_minor: input.expense_amount_minor,
    p_payment_amount_minor: input.payment_amount_minor,
    p_debt_id: input.debt_id,
    p_occurred_at: input.occurred_at,
    p_category_id: categories.category_id,
    p_global_category_id: categories.global_category_id,
    p_expense_payee: input.payee ?? null,
    p_expense_note: input.note ?? null,
    p_payment_note: input.note ? `Thu hộ: ${input.note}` : 'Thu hộ: Trả hộ',
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.rpc('create_paying_for_operation', params);
    if (!error) {
      if (!data || typeof data !== 'object') {
        throw new Error('Nghiệp vụ trả hộ không trả về kết quả xác nhận. Hãy thử lại cùng thao tác.');
      }
      const result = data as Partial<PayingForOperationResult>;
      if (
        result.success !== true ||
        result.operation_id !== input.operation_id ||
        typeof result.expense_transaction_id !== 'string' ||
        typeof result.income_transaction_id !== 'string' ||
        typeof result.payment_id !== 'string' ||
        result.debt_id !== input.debt_id ||
        typeof result.consumer_expense_amount_minor !== 'number' ||
        typeof result.remaining_amount !== 'number'
        || (result.status !== 'active' && result.status !== 'paid')
      ) {
        throw new Error('Nghiệp vụ trả hộ trả về kết quả không hợp lệ. Hãy thử lại cùng thao tác.');
      }
      return result as PayingForOperationResult;
    }

    lastError = error;
    // 42883 means the atomic RPC is missing. Never downgrade this financial
    // operation to three independent writes.
    if ((error as SupabaseError).code === '42883') {
      throw new Error('Chưa bật nghiệp vụ trả hộ nguyên tử; chưa có giao dịch nào được ghi sổ.');
    }
    if (!isRetryable(error) || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
  }

  throw new Error(errorText(lastError) || 'Không thể ghi nghiệp vụ trả hộ; chưa xác nhận kết quả.');
}
