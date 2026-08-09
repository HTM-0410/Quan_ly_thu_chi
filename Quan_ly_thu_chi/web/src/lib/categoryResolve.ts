import type { Category, Transaction } from './domain';
import { GLOBAL_CATEGORY_PREFIX } from './domain';

/**
 * Lookup 1 Category cho transaction. Hỗ trợ cả user cats (categories table) và
 * global cats (global_categories table - share giữa mọi user).
 *
 * Trả về Category đã được chuẩn hóa về cùng shape với `Category` (frontend
 * luôn thấy scope='global' | 'user' và id có/không prefix 'global:').
 */
export function resolveCategory(
  categoryById: Map<string, Category>,
  tx: Pick<Transaction, 'category_id' | 'global_category_id'>,
): Category | undefined {
  if (tx.category_id) {
    const found = categoryById.get(tx.category_id);
    if (found) return found;
  }
  if (tx.global_category_id) {
    const found = categoryById.get(`${GLOBAL_CATEGORY_PREFIX}${tx.global_category_id}`);
    if (found) return found;
  }
  return undefined;
}

/**
 * Trả về id dạng "lookup key" - dùng để tra cứu Category trong Map<Category,id>.
 * Trùng định dạng với `catById` được build từ listCategories: prefix 'global:'
 * cho global cats, plain UUID cho user cats.
 *
 * Dùng cho filter/group/totals khi cần build key thống nhất để lookup.
 */
export function categoryKey(
  tx: Pick<Transaction, 'category_id' | 'global_category_id'>,
): string | null {
  if (tx.global_category_id) return `${GLOBAL_CATEGORY_PREFIX}${tx.global_category_id}`;
  if (tx.category_id) return tx.category_id;
  return null;
}