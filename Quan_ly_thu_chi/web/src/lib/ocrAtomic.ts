import { supabase } from './supabase';

export interface OcrAtomicSplit {
  account_id: string;
  type: 'income' | 'expense';
  amount_minor: number;
  occurred_at: string;
  category_id?: string | null;
  global_category_id?: string | null;
  payee?: string | null;
  note?: string | null;
  client_generated_id: string;
}

export interface OcrAtomicBill {
  channel_type: 'online' | 'offline';
  online_marketplace?: 'shopee' | 'lazada' | 'tiktok_shop' | 'other' | null;
  online_marketplace_other?: string | null;
  store_name?: string | null;
  declared_total_minor: number;
  items?: Array<{
    product_name: string;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
    note?: string | null;
  }>;
}

export interface OcrAtomicDebt {
  /** Existing user-owned person. Omit when the preview contains a new name. */
  person_id?: string | null;
  /** Resolved inside the row RPC so person creation rolls back with the row. */
  person_name?: string | null;
  type: 'lend' | 'borrow';
  original_amount: number;
  notes?: string | null;
}

export interface OcrAtomicRowInput {
  row_id: string;
  splits: OcrAtomicSplit[];
  bill?: OcrAtomicBill | null;
  debt?: OcrAtomicDebt | null;
}

export interface OcrAtomicRowResult {
  transaction_ids: string[];
  bill_id: string | null;
  debt_id: string | null;
}

/**
 * Convert the UI category representation to the two database columns used by
 * the transaction RPC. `global:` is a UI-only namespace used to keep global
 * category UUIDs distinct from user category UUIDs.
 */
export function toOcrCategoryFields(categoryId: string | null | undefined): {
  category_id: string | null;
  global_category_id: string | null;
} {
  const value = categoryId?.trim() || null;
  if (!value) return { category_id: null, global_category_id: null };
  if (value.startsWith('global:')) {
    const globalId = value.slice('global:'.length).trim();
    if (!globalId) throw new Error('OCR global category id is empty');
    return { category_id: null, global_category_id: globalId };
  }
  return { category_id: value, global_category_id: null };
}

function formatRpcError(error: unknown): Error {
  const value = error as { message?: string; code?: string; details?: string } | null;
  const message = [value?.message, value?.code, value?.details].filter(Boolean).join(' | ');
  return new Error(message || 'OCR row RPC failed');
}

function isRetryable(error: unknown): boolean {
  const value = error as { status?: number; statusCode?: number; code?: string } | null;
  const status = value?.status ?? value?.statusCode;
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    (status != null && status >= 500) ||
    value?.code === '23505'
  );
}

function normalizeSplits(splits: OcrAtomicSplit[]): OcrAtomicSplit[] {
  return splits.map(split => {
    const category = toOcrCategoryFields(split.category_id);
    if (split.global_category_id && (category.category_id || category.global_category_id)) {
      throw new Error('OCR split cannot specify both category representations');
    }
    return {
      ...split,
      category_id: category.category_id,
      global_category_id: split.global_category_id ?? category.global_category_id,
    };
  });
}

/**
 * Commits one OCR preview row (including all splits, bill and debt) through
 * the dedicated atomic RPC. Callers must retain row_id and split keys when
 * retrying after an unknown response.
 */
export async function createOcrRowAtomic(input: OcrAtomicRowInput): Promise<OcrAtomicRowResult> {
  const splits = normalizeSplits(input.splits);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase.rpc('create_ocr_transaction_row_atomic', {
      p_row_id: input.row_id,
      p_splits: splits,
      p_bill: input.bill ?? null,
      p_debt: input.debt ?? null,
    });
    if (!error) {
      const value = data;
      if (!value || !Array.isArray(value.transaction_ids) || value.transaction_ids.length !== splits.length) {
        throw new Error('OCR row RPC returned an invalid result');
      }
      return {
        transaction_ids: value.transaction_ids,
        bill_id: value.bill_id ?? null,
        debt_id: value.debt_id ?? null,
      };
    }
    lastError = error;
    if (!isRetryable(error) || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
  }
  throw formatRpcError(lastError);
}
