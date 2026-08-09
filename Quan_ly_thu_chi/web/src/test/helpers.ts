import { supabase } from '../lib/supabase';
import type { Debt, Person } from '../lib/domain';

const TEST_EMAIL = 'demo@quanlythuchi.local';
const TEST_PASSWORD = 'Demo@2026!';

let signedIn = false;

/** Track persons created trong session này để cleanup đúng scope (tránh xóa nhầm person của test khác). */
const createdPersonIds = new Set<string>();
const createdDebtIds = new Set<string>();

/**
 * Sign in as the demo user. Idempotent within the test session.
 * Throws on failure so the test fails loudly.
 */
export async function signInTestUser(): Promise<void> {
  if (signedIn) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user?.email === TEST_EMAIL) return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }
  signedIn = true;
}

/**
 * Sign out the test user.
 */
export async function signOutTestUser(): Promise<void> {
  await supabase.auth.signOut();
  signedIn = false;
}

/**
 * Get current user id (assumes signed in).
 */
export async function getTestUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not authenticated');
  }
  return data.user.id;
}

/**
 * Create a test person (counterparty) with a unique name. Caller responsible to delete.
 */
export async function createTestPerson(nameSuffix: string): Promise<Person> {
  const { data, error } = await supabase.rpc('create_person', {
    p_name: `TEST-${nameSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    p_phone: null,
  });
  if (error) throw new Error(`createPerson: ${error.message}`);
  createdPersonIds.add((data as Person).id);
  return data as Person;
}

/**
 * Create a test debt. Returns the created debt. Caller responsible to delete.
 */
export async function createTestDebt(input: {
  personId: string;
  type: 'lend' | 'borrow';
  originalAmount: number;
  notes?: string | null;
}): Promise<Debt> {
  const { data, error } = await supabase.rpc('create_debt', {
    p_person_id: input.personId,
    p_type: input.type,
    p_original_amount: input.originalAmount,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(`createDebt: ${error.message}`);
  createdDebtIds.add((data as Debt).id);
  return data as Debt;
}

/**
 * Cleanup: chỉ xóa những debts + people mà test session này đã tạo.
 * Tránh xóa data của test file khác đang chạy concurrent.
 */
export async function cleanupTestData(): Promise<void> {
  const debtIds = Array.from(createdDebtIds);
  const personIds = Array.from(createdPersonIds);

  if (debtIds.length > 0) {
    await supabase.from('debt_payments').delete().in('debt_id', debtIds);
    await supabase.from('debt_audit_log').delete().in('debt_id', debtIds);
    await supabase.from('debts').delete().in('id', debtIds);
  }

  if (personIds.length > 0) {
    await supabase.from('people').delete().in('id', personIds);
  }

  createdDebtIds.clear();
  createdPersonIds.clear();
}

/**
 * Read a debt from DB (bypassing API layer).
 */
export async function readDebt(debtId: string): Promise<Debt | null> {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('id', debtId)
    .maybeSingle();
  if (error) throw error;
  return (data as Debt) ?? null;
}

/**
 * Sum of all payments for a debt.
 */
export async function sumPayments(debtId: string): Promise<number> {
  const { data, error } = await supabase
    .from('debt_payments')
    .select('amount')
    .eq('debt_id', debtId);
  if (error) throw error;
  return ((data ?? []) as Array<{ amount: number }>).reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );
}
