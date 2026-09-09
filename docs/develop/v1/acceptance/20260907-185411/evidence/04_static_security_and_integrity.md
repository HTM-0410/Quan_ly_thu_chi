# Evidence 04 — Static security and integrity findings

## User isolation

- list_accounts_with_balances(p_user_id, p_include_archived) is SECURITY DEFINER and filters by p_user_id.
- It grants EXECUTE to authenticated but does not check p_user_id = auth.uid().
- get_monthly_history(p_user_id, p_months, p_timezone) has the same shape.
- Legacy overloads remain in the migration history with the same ownership gap.

## Status semantics

- calculate_account_balance sums entries where transaction status != voided.
- get_monthly_history and get_budget_progress use the same predicate.
- The approved contract in spec_v1.md says only posted affects executed balance/statistics; pending remains queryable.

## Recurring

- materialize_recurring_rules inserts transaction fields without status.
- transactions.status defaults to posted in the core schema.
- D04 requires pending/chờ xác nhận by default.

## Idempotency and atomicity

- createManualTransaction clears client_generated_id after a conflict and retries with a new UUID.
- settleDebtPayment falls back from atomic RPC to read debt, add payment, create transaction and update metadata as separate requests when RPC is missing.

## Worker proxy

- Worker forwards arbitrary POST body to Gemini.
- No visible auth validation, rate limiting, body-size guard or model allowlist was found in the worker entry.

These are source-derived findings, not claims that production has been exploited. Runtime confirmation is blocked by the unavailable isolated DB/deployment.

