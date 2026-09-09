# Financial retry and paying-for remediation — 2026-09-08

> Final root verification: xem `../acceptance/20260908-recheck/FINAL_RECHECK.md`. Bản cuối giữ khoản chi ban đầu trong chi tiêu và chỉ loại reimbursement khỏi income. SQL retry/rollback/concurrency đã PASS; full suite 152 tests và build PASS. Các blocker typecheck và mô tả cả hai cashflow là principal bên dưới thuộc bản trung gian, đã được thay thế.

## Scope

This report covers the transaction form retry identity and the “trả hộ”
workflow from `ACCEPTANCE_REPORT.md` / `FIX_TIPS.md` ACC-004. It does not claim
remote deployment or authenticated acceptance.

## Changes

- `Quan_ly_thu_chi/web/src/pages/TransactionsPage.tsx` keeps one UUID for the
  lifetime of a create form and passes it to normal transaction creation. A
  failed or unknown-result save therefore keeps the same operation identity on
  resubmit. The paying-for branch validates its debt/payment before writing and
  calls one atomic operation helper.
- `Quan_ly_thu_chi/web/src/lib/financialOperations.ts` calls only
  `create_paying_for_operation`, retries transient responses with the same key,
  validates the response shape, and fails closed when the RPC is unavailable.
- `Quan_ly_thu_chi/supabase/migrations/20260908000001_financial_operations.sql`
  adds an idempotent operation record and an atomic RPC. The RPC locks the lend
  debt, writes the expense, principal reimbursement, debt payment, and ledger
  entries in one transaction, and rejects payload reuse. The purchase remains
  a normal consumer expense; only the reimbursement income carries
  `is_debt_principal = true`, so the cash balance changes without inflating
  reported income.
- `Quan_ly_thu_chi/web/src/lib/financialOperations.test.ts` covers the single
  RPC boundary, stable retry key, missing-RPC fail-closed behavior, category
  scope mapping, and malformed results.
- `Quan_ly_thu_chi/web/src/pages/TransactionsPage.test.tsx` mocks the form API
  and verifies a timeout followed by resubmit uses the same
  `client_generated_id`.

## Local validation

Commands are run from `D:\Quản lý thu chi\Quan_ly_thu_chi\web`:

```text
npm.cmd test -- --run src/lib/financialOperations.test.ts src/pages/TransactionsPage.test.tsx
npm.cmd run typecheck
npm.cmd run build
```

Focused tests: PASS (2 files, 5 tests). `npm.cmd run typecheck` and the build
remain BLOCKED by the pre-existing dirty-worktree error in
`src/lib/ocrAtomic.ts:76` because `create_ocr_transaction_row_atomic` is absent
from the checked-in `database.types.ts`; the new financial operation module
does not add a shared schema edit.

## Isolated database validation

The reproducible fixture is
`docs/develop/v1/acceptance/20260908-recheck/financial-operations-fixture.sql`.
It runs against a disposable database on `127.0.0.1:55439` after the full
migration chain and covers rollback after a late failure, same-key idempotency,
payload mismatch rejection, debt overpayment protection, and the reporting
rule that keeps the paying-for expense while excluding only reimbursement
income. A separate two-session `dblink` check exercises concurrent payments
against the same lend debt; one succeeds and the other fails after the locked
remaining principal is re-read.

The fixture was run on a database created for this check; the server's `postgres`
database was not changed. Remote writes, deploys, commits, pushes, Gemini calls,
and real-user mutations were not performed. Authenticated Supabase/PostgREST
and browser evidence remain separate acceptance gates.
