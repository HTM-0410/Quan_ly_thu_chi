# BUILDER COMPLETION REPORT — Acceptance hardening

Ngày: 2026-09-07 (UTC+7)  
Status: **PARTIAL / BLOCKED**

## Revision and workspace

- Revision trước sửa: `a1f5a21dfe54742bf3e8867a413a36a5a90b6fd1` (`main`)
- Revision sau sửa: `a1f5a21dfe54742bf3e8867a413a36a5a90b6fd1` (không commit/push)
- Working tree: vẫn dirty; các thay đổi có sẵn được giữ nguyên. Không reset,
  checkout, clean, force-push, remote write, deploy hoặc gọi Gemini thật.
- Canonical migration root: `Quan_ly_thu_chi/supabase/migrations`.
  Manifest kiểm tra được 33 file, thiếu 0, thừa 0.
- Bản sao root-level đã được di chuyển nguyên vẹn tới
  `supabase-stale-migrations-20260907/` để archive, không dùng làm source.

## Files touched in this Builder turn

- OCR boundary: `Quan_ly_thu_chi/web/src/lib/config.ts`, `ocr.ts`,
  `billOcr.ts`, `components/ocr/ReceiptImportFallback.tsx`,
  `components/ocr/ReceiptImportModal.tsx`, `_worker.js/index.js`,
  `web/.env.example`.
- Financial retry/recurring: `web/src/lib/api.ts`, `components/PaymentModal.tsx`,
  `pages/RecurringPage.tsx`, `lib/recurringSchedule.ts`, `lib/daily.ts`.
- Tests/types: `PaymentModal.test.tsx`, `RecurringPage.test.tsx`,
  `daily.test.ts`, `lib/worker.test.ts`, `lib/database.types.ts`.
- Database/source hygiene: `supabase/migrations/20260810000009_recurring_scheduler_and_idempotency.sql`,
  new `20260907000003_acceptance_hardening.sql`,
  `scripts/copy-supabase-data.ps1`, new `scripts/preflight-supabase.ps1`,
  and `docs/develop/v1/MIGRATION_MANIFEST.md`.

## ISSUE → TIP → REQ → QA → result

| Issue | Result in source | QA/evidence status |
|---|---|---|
| ACC-001, ACC-007 | Client no longer reads provider secret or direct URL; both OCR flows send same-origin request with session Bearer; Worker checks auth, content type, body/image size, schema, model allowlist, per-user rate/quota and sanitized provider errors. | Worker tests 5/5 PASS; bundle scan PASS. Deployed Worker and authenticated network E2E BLOCKED. |
| ACC-002 | Latest migration rejects `p_user_id` mismatch, binds queries to `auth.uid()`, removes legacy monthly/account overloads, uses safe search paths and explicit grants. Category aggregate RPCs are guarded too. | Static PASS; two-user/anonymous direct RPC fixture BLOCKED by local DB. |
| ACC-003 | Latest balance, net-worth, monthly, summary, budget and category aggregate definitions use `status='posted'`; client heatmap also excludes pending/voided from executed stats while history remains queryable. | Unit/static PASS; DB fixture and Dashboard/Reports/Budget authenticated E2E BLOCKED. |
| ACC-004 | Manual transaction retries retain one key; reused key with a different payload rejects. Debt settlement has no multi-request fallback and is atomic in RPC. OCR splits for one row use one DB RPC transaction and deterministic UUID keys. | Code/static PASS; fault injection, concurrency and isolated DB BLOCKED. |
| ACC-005 | Materialized recurring rows are `pending`; explicit confirm/skip RPCs were added. Recurring page exposes pending rows; resume uses locked status RPC and skips missed catch-up occurrences. Day-31 path ends with valid `ended` enum. | UI/unit coverage PASS; DB scheduler/31-day/persist-after-reload BLOCKED. |
| ACC-006 | One canonical directory and manifest; preflight prints only refs and fails closed on mismatch. | Manifest PASS; current project `.env` and CLI state still disagree with canonical ref, so preflight exit 1 by design. |
| ACC-008 | Hardcoded password fallback removed; copy helper requires explicit secrets before network/write, uses `PGPASSWORD`, redacts response/error bodies and has dry-run. | Script parse + dry-run PASS; disposable DB copy NOT RUN. |

## Commands

Working directory for web commands: `D:\Quản lý thu chi\Quan_ly_thu_chi\web`.  
Environment: `RUN_REMOTE_TESTS` empty; no real provider call.

| Command | Exit | Result |
|---|---:|---|
| `npm test -- --reporter=verbose` | 0 | 16 files, 137 tests PASS |
| `npm run typecheck` | 0 | TypeScript PASS |
| `npm run build` | 0 | 2,716 modules transformed |
| `node --check _worker.js/index.js` | 0 | Worker syntax PASS |
| PowerShell AST parse for both scripts | 0 | Syntax PASS |
| `git diff --check` | 0 | PASS |
| Bundle exact secret scan | 0 | 8 JS/map files; exact secret `FALSE`, exact files `0` |
| Bundle forbidden pattern scan | 0 | `VITE_GEMINI_API_KEY`, provider URL, key-prefix/length: 0 matches |
| `copy-supabase-data.ps1 -DryRun` | 0 | No network/database/auth mutation |
| `preflight-supabase.ps1` | 1 | BLOCKED intentionally: sanitized refs mismatch (canonical/new vs project env/CLI state/old) |
| `supabase status` | 1 | BLOCKED: Docker Linux engine unavailable |
| lint | N/A | NOT CONFIGURED in `package.json` |

## AC and open blockers

- PASS from reproducible local evidence: proxy-only client path, secret-free
  production bundle, Worker fail-closed cases, posted-only client aggregate,
  idempotency key retention in code, atomic RPC/row definitions, pending
  recurring UI path, canonical manifest, credential-helper dry-run.
- BLOCKED: local Supabase reset/schema/RPC inventory, two-user RLS, DB fixture
  with posted/pending/voided rows, debt fault injection/concurrency, recurring
  scheduler runtime, authenticated desktop/mobile E2E and reload persistence.
- Open operational risk: the Worker fallback quota counter is per Worker
  isolate. Production should bind a shared Durable Object/KV limiter before
  relying on a globally consistent quota across isolates.
- Vì còn các blocker trên, Builder không tự chuyển status thành DONE và chưa
  coi issue đã được Contractor nghiệm thu đóng.
