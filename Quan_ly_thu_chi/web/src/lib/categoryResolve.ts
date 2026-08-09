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

/** Tên các CHA có gắn bill (mẹ của cây con cần attach bill). */
export const BILLABLE_PARENT_CATEGORY_NAMES = ['Mua sắm', 'Đi chợ/Siêu thị'];

/**
 * True nếu `cat` nằm trong nhóm "billable":
 * - Cat có name trùng 1 trong BILLABLE_PARENT_CATEGORY_NAMES (CHA billable), HOẶc
 * - Cat là CON (parent_id != null) của CHA có name trùng danh sách trên.
 *
 * @param cat - Category cần kiểm tra (có thể null/undefined)
 * @param categoryById - Map lookup Category (để resolve CHA từ parent_id)
 */
export function isBillableCategory(
  cat: Category | null | undefined,
  categoryById: ReadonlyMap<string, Category>,
): boolean {
  if (!cat) return false;
  const n = cat.name.trim().toLowerCase();
  if (BILLABLE_PARENT_CATEGORY_NAMES.some(x => x.toLowerCase() === n)) return true;
  if (cat.parent_id) {
    const parent = categoryById.get(cat.parent_id);
    if (parent) {
      const pn = parent.name.trim().toLowerCase();
      return BILLABLE_PARENT_CATEGORY_NAMES.some(x => x.toLowerCase() === pn);
    }
  }
  return false;
}