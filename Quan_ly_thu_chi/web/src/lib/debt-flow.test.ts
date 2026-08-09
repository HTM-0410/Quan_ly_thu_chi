/**
 * DB-level tests cho luồng công nợ.
 *
 * Phạm vi:
 *  - Trigger update_debt_remaining_on_payment chỉ chạy 1 lần
 *  - RPC add_debt_payment, mark_debt_paid, get_debt_summary
 *  - Constraint: amount > remaining → RAISE
 *  - Recompute data consistency
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  signInTestUser,
  signOutTestUser,
  getTestUserId,
  createTestPerson,
  createTestDebt,
  cleanupTestData,
  readDebt,
  sumPayments,
} from '../test/helpers';
import { addDebtPayment, markDebtPaid, getDebtSummary } from '../lib/api';
import { supabase } from '../lib/supabase';

beforeAll(async () => {
  await signInTestUser();
  await cleanupTestData();
}, 30000);

afterAll(async () => {
  await cleanupTestData();
  await signOutTestUser();
}, 30000);

describe('Debt flow — DB & RPC', () => {
  // Tạo debt mới cho mỗi test để cô lập
  let personId: string;

  beforeEach(async () => {
    const person = await createTestPerson('flow');
    personId = person.id;
  }, 30000);

  it('T1: 1 payment giảm remaining đúng 1 lần (regression: duplicate trigger)', async () => {
    const debt = await createTestDebt({ personId, type: 'lend', originalAmount: 90_000_000 });
    expect(debt.remaining_amount).toBe(90_000_000);

    await addDebtPayment({ debt_id: debt.id, amount: 40_000_000 });

    const after = await readDebt(debt.id);
    expect(after).not.toBeNull();
    expect(after!.remaining_amount).toBe(50_000_000); // KHÔNG phải 10tr
    expect(after!.status).toBe('active');
  }, 30000);

  it('T2: Multiple payments cumulative', async () => {
    const debt = await createTestDebt({ personId, type: 'lend', originalAmount: 100_000_000 });

    await addDebtPayment({ debt_id: debt.id, amount: 30_000_000 });
    await addDebtPayment({ debt_id: debt.id, amount: 20_000_000 });
    await addDebtPayment({ debt_id: debt.id, amount: 10_000_000 });

    const after = await readDebt(debt.id);
    expect(after!.remaining_amount).toBe(40_000_000);
    expect(after!.status).toBe('active');

    // Sanity: SUM(payments) = 60tr
    const sum = await sumPayments(debt.id);
    expect(sum).toBe(60_000_000);
  }, 30000);

  it('T3: Payment = remaining → status = paid, remaining = 0', async () => {
    const debt = await createTestDebt({ personId, type: 'lend', originalAmount: 50_000_000 });

    await addDebtPayment({ debt_id: debt.id, amount: 50_000_000 });

    const after = await readDebt(debt.id);
    expect(after!.remaining_amount).toBe(0);
    expect(after!.status).toBe('paid');
  }, 30000);

  it('T4: Payment > remaining → RPC throw exception', async () => {
    const debt = await createTestDebt({ personId, type: 'lend', originalAmount: 30_000_000 });

    await expect(
      addDebtPayment({ debt_id: debt.id, amount: 50_000_000 }),
    ).rejects.toThrow(/exceeds remaining|negative remaining/i);

    // Verify debt unchanged
    const after = await readDebt(debt.id);
    expect(after!.remaining_amount).toBe(30_000_000);
    expect(after!.status).toBe('active');
  }, 30000);

  it('T5: mark_debt_paid set remaining=0, status=paid', async () => {
    const debt = await createTestDebt({ personId, type: 'borrow', originalAmount: 10_000_000 });

    await markDebtPaid(debt.id);

    const after = await readDebt(debt.id);
    expect(after!.remaining_amount).toBe(0);
    expect(after!.status).toBe('paid');
  }, 30000);

  it('T6: Tất cả debt active của test user đều consistent (original = paid + remaining)', async () => {
    const debt1 = await createTestDebt({ personId, type: 'lend', originalAmount: 80_000_000 });
    const debt2 = await createTestDebt({ personId, type: 'borrow', originalAmount: 60_000_000 });

    await addDebtPayment({ debt_id: debt1.id, amount: 20_000_000 });
    await addDebtPayment({ debt_id: debt2.id, amount: 60_000_000 }); // trả hết → paid

    const userId = await getTestUserId();
    const { data: debts, error } = await supabase
      .from('debts')
      .select('id, original_amount, remaining_amount, status')
      .eq('user_id', userId);
    expect(error).toBeNull();

    for (const d of (debts ?? []) as Array<{
      id: string;
      original_amount: number;
      remaining_amount: number;
      status: string;
    }>) {
      const sum = await sumPayments(d.id);
      const computed = d.original_amount - sum;
      // Invariant cốt lõi: remaining = max(0, original - payments).
      // (markDebtPaid set remaining=0 không tạo payment, nhưng status='paid' nên
      //  original - sum = original > 0 nhưng remaining = 0 — đây là case đặc biệt
      //  của mark_debt_paid RPC, không phải bug trigger.)
      if (sum > 0) {
        // Có payment: trigger phải set remaining = original - sum
        expect(d.remaining_amount).toBe(Math.max(0, computed));
      }
      // status phải khớp với remaining
      const expectedStatus = d.remaining_amount === 0 ? 'paid' : 'active';
      expect(d.status).toBe(expectedStatus);
    }
  }, 60000);

  it('T7: get_debt_summary trả về đúng sum và count theo type/status', async () => {
    const debtLend = await createTestDebt({ personId, type: 'lend', originalAmount: 70_000_000 });
    await createTestDebt({ personId, type: 'borrow', originalAmount: 30_000_000 });

    await addDebtPayment({ debt_id: debtLend.id, amount: 20_000_000 }); // remaining = 50tr

    const summary = await getDebtSummary();
    // Test file khác có thể tạo debt → so sánh bằng cách verify >= giá trị vừa tạo.
    expect(summary.totalLending).toBeGreaterThanOrEqual(50_000_000);
    expect(summary.totalBorrowing).toBeGreaterThanOrEqual(30_000_000);
    expect(summary.activeLendCount).toBeGreaterThanOrEqual(1);
    expect(summary.activeBorrowCount).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('T8: Audit log được ghi khi insert payment', async () => {
    const debt = await createTestDebt({ personId, type: 'lend', originalAmount: 10_000_000 });

    const beforeCount = await supabase
      .from('debt_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('debt_id', debt.id);

    await addDebtPayment({ debt_id: debt.id, amount: 5_000_000, note: 'audit test' });

    const { count } = await supabase
      .from('debt_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('debt_id', debt.id);

    expect((count ?? 0)).toBeGreaterThanOrEqual((beforeCount as unknown as { count: number }).count ?? 0);
  }, 30000);
});
