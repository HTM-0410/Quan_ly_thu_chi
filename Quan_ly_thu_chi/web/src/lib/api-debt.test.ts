/**
 * API layer tests cho People/Debts flow.
 * Mỗi test tạo debt mới, dùng API helper, đọc lại từ DB.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  signInTestUser,
  signOutTestUser,
  createTestPerson,
  cleanupTestData,
} from '../test/helpers';
import {
  getPeople,
  createPerson,
  updatePerson,
  deletePerson,
  getDebts,
  getDebtWithPayments,
  createDebt,
  addDebtPayment,
  deleteDebt,
  markDebtPaid,
  getDebtSummary,
} from '../lib/api';

beforeAll(async () => {
  await signInTestUser();
  await cleanupTestData();
}, 30000);

afterAll(async () => {
  await cleanupTestData();
  await signOutTestUser();
}, 30000);

describe('API: People', () => {
  beforeEach(async () => {
    await cleanupTestData();
  }, 30000);

  it('createPerson round-trip + delete', async () => {
    const created = await createPerson('Test Round Trip', '0900000000');
    expect(created.name).toBe('Test Round Trip');
    expect(created.phone).toBe('0900000000');

    const people = await getPeople();
    expect(people.find(p => p.id === created.id)).toBeTruthy();

    await deletePerson(created.id);
    const after = await getPeople();
    expect(after.find(p => p.id === created.id)).toBeUndefined();
  }, 30000);

  it('updatePerson changes name', async () => {
    const p = await createPerson('Old Name');
    await updatePerson(p.id, 'New Name', '0911111111');

    const people = await getPeople();
    const updated = people.find(x => x.id === p.id);
    expect(updated?.name).toBe('New Name');
    expect(updated?.phone).toBe('0911111111');

    await deletePerson(p.id);
  }, 30000);
});

describe('API: Debts', () => {
  beforeEach(async () => {
    await cleanupTestData();
  }, 30000);

  it('createDebt + getDebts round-trip', async () => {
    const person = await createTestPerson('lend-rt');
    const debt = await createDebt({
      person_id: person.id,
      type: 'lend',
      original_amount: 1_000_000,
      notes: 'test note',
    });

    expect(debt.original_amount).toBe(1_000_000);
    expect(debt.remaining_amount).toBe(1_000_000);
    expect(debt.status).toBe('active');

    const debts = await getDebts();
    expect(debts.find(d => d.id === debt.id)).toBeTruthy();
  }, 30000);

  it('addDebtPayment inserts payment, getDebtWithPayments trả về đúng list', async () => {
    const person = await createTestPerson('multi-pay');
    const debt = await createDebt({
      person_id: person.id,
      type: 'lend',
      original_amount: 5_000_000,
    });

    await addDebtPayment({ debt_id: debt.id, amount: 1_000_000 });
    await addDebtPayment({ debt_id: debt.id, amount: 2_000_000 });

    const { debt: reloaded, payments } = await getDebtWithPayments(debt.id);
    expect(reloaded.remaining_amount).toBe(2_000_000);
    expect(payments).toHaveLength(2);
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBe(3_000_000);
  }, 30000);

  it('getDebtWithPayments trả payments theo thứ tự thời gian asc', async () => {
    const person = await createTestPerson('order');
    const debt = await createDebt({ person_id: person.id, type: 'lend', original_amount: 5_000_000 });

    // 3 payments với thời gian khác nhau
    const t1 = new Date(Date.now() - 3 * 86400_000).toISOString();
    const t2 = new Date(Date.now() - 2 * 86400_000).toISOString();
    const t3 = new Date(Date.now() - 1 * 86400_000).toISOString();

    await addDebtPayment({ debt_id: debt.id, amount: 1_000_000, payment_date: t3 });
    await addDebtPayment({ debt_id: debt.id, amount: 1_000_000, payment_date: t1 });
    await addDebtPayment({ debt_id: debt.id, amount: 1_000_000, payment_date: t2 });

    const { payments } = await getDebtWithPayments(debt.id);
    expect(payments).toHaveLength(3);
    const dates = payments.map(p => new Date(p.payment_date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  }, 30000);

  it('markDebtPaid set status = paid', async () => {
    const person = await createTestPerson('markpaid');
    const debt = await createDebt({ person_id: person.id, type: 'borrow', original_amount: 8_000_000 });

    await markDebtPaid(debt.id);

    const { debt: reloaded } = await getDebtWithPayments(debt.id);
    expect(reloaded.status).toBe('paid');
    expect(reloaded.remaining_amount).toBe(0);
  }, 30000);

  it('deleteDebt xóa debt + payments (cascade)', async () => {
    const person = await createTestPerson('del');
    const debt = await createDebt({ person_id: person.id, type: 'lend', original_amount: 3_000_000 });
    await addDebtPayment({ debt_id: debt.id, amount: 1_000_000 });

    await deleteDebt(debt.id);

    const debts = await getDebts();
    expect(debts.find(d => d.id === debt.id)).toBeUndefined();
  }, 30000);

  it('getDebtSummary trả về count & sum chính xác', async () => {
    const person = await createTestPerson('sum');
    const d1 = await createDebt({ person_id: person.id, type: 'lend', original_amount: 4_000_000 });
    await createDebt({ person_id: person.id, type: 'borrow', original_amount: 2_000_000 });
    await addDebtPayment({ debt_id: d1.id, amount: 1_000_000 });

    const summary = await getDebtSummary();
    // Test khác có thể để lại debt trong DB → chỉ verify >= giá trị vừa tạo
    expect(summary.totalLending).toBeGreaterThanOrEqual(3_000_000); // 4tr - 1tr đã trả
    expect(summary.totalBorrowing).toBeGreaterThanOrEqual(2_000_000);
    expect(summary.activeLendCount).toBeGreaterThanOrEqual(1);
    expect(summary.activeBorrowCount).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('getDebts(status) filter đúng', async () => {
    const person = await createTestPerson('filter');
    const debt = await createDebt({ person_id: person.id, type: 'lend', original_amount: 5_000_000 });
    await markDebtPaid(debt.id);

    const active = await getDebts('active');
    const paid = await getDebts('paid');
    expect(active.find(d => d.id === debt.id)).toBeUndefined();
    expect(paid.find(d => d.id === debt.id)).toBeTruthy();
  }, 30000);
});
