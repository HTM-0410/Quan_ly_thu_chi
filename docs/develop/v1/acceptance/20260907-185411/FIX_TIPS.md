# FIX TIPS — Handoff to Builder

Đây là handoff sửa lỗi sau khi REJECTED. Contractor không sửa trong lượt nghiệm thu này.

## TIP-ACC-001 — Chặn lộ Gemini key và harden OCR proxy

- Dependencies: none before source changes; must precede OCR release.
- Files: web/src/lib/config.ts, web/src/lib/ocr.ts, web/src/lib/billOcr.ts, web/_worker.js/index.js.
- Work: remove browser direct-key branch and key-prefix logging; proxy-only; JWT/auth, quota/rate limit, body-size/schema validation, model allowlist, sanitized upstream errors.
- AC: production bundle contains no Gemini secret; browser network only same-origin proxy; anonymous/invalid/oversize/quota cases fail closed; no secret in console/logs.
- Regression: F11–F14, QA-08, QA-09, QA-17.

## TIP-ACC-002 — Restore user isolation in SECURITY DEFINER RPCs

- Dependencies: schema target must be confirmed.
- Files: account/report RPC migrations and any legacy overloads.
- Work: bind owner to auth.uid(), reject mismatched p_user_id, revoke stale signatures, use safe search_path and explicit grants.
- AC: user A cannot read/write user B accounts, balances, reports, categories, debts or archived rows through direct RPC; anonymous cannot call protected functions.
- Regression: QA-15 plus account/archive/report suites.

## TIP-ACC-003 — Enforce posted-only accounting semantics

- Dependencies: D02/D03 confirmation source of truth.
- Files: calculate_account_balance, get_monthly_history, get_budget_progress, all report/budget aggregations.
- Work: posted-only for balances and executed statistics; keep pending/voided visible only in history/status views; align Dashboard/Reports/Budget/CSV definitions.
- AC: same posted fixture produces identical totals; pending changes no balance/KPI/budget; voided changes no executed total.
- Regression: QA-01, QA-02, QA-03, QA-05, QA-06.

## TIP-ACC-004 — Make financial retry fail-closed and idempotent

- Dependencies: TIP-ACC-002, DB RPC deployed in isolated test DB.
- Files: web/src/lib/api.ts and settlement/import RPCs.
- Work: same operation keeps same idempotency key; return existing result on duplicate; remove unsafe debt fallback or make one DB transaction; verify payload mismatch on reused key.
- AC: timeout/retry/double click/concurrent payment yields one operation and exact remaining; partial failure leaves no orphan.
- Regression: QA-06, QA-07, QA-08, QA-09.

## TIP-ACC-005 — Separate recurring materialization from posting

- Dependencies: TIP-ACC-003 and D04.
- Files: recurring migration/RPC/UI.
- Work: create pending occurrence by default; add explicit confirm/skip/void; retain day-31 clamping and occurrence uniqueness; auto-post only when separately enabled.
- AC: pending occurrence does not affect balance; confirm posts once; second materialize is idempotent; 31/01→28/02→31/03.
- Regression: QA-10 and Dashboard actionable insights.

## TIP-ACC-006 — Canonicalize migrations and environment identity

- Dependencies: human confirmation of canonical Supabase project.
- Files: root Supabase directories, config, manifest, scripts.
- Work: one migration root; clean reset from zero; remove stale duplicate or make it explicit non-source; align refs; no remote apply in this TIP.
- AC: clean checkout can reproduce schema; manifest matches files; preflight prints sanitized project ref and refuses mismatch.
- Regression: QA-17 and migration dry-run.

## TIP-ACC-007 — Remove hardcoded credentials from data-copy helper

- Dependencies: TIP-ACC-006.
- Files: scripts/copy-supabase-data.ps1.
- Work: no fallback password; require secure parameter/secret; redact all output; add dry-run mode.
- AC: secret scan clean; missing secret fails before network/write; disposable target verification only.

## Builder completion contract

Builder must report files changed, AC-by-AC results, exact commands/cwd/exit codes, fixture identity, deviations and remaining blockers. Contractor will re-run the affected QA cases; “all tests green” alone does not close an issue.

