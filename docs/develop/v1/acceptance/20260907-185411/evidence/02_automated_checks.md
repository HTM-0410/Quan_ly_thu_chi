# Evidence 02 — Automated checks

Commands were run from D:/Quản lý thu chi/Quan_ly_thu_chi/web.

## Test

Command: npm test -- --reporter=verbose  
Environment: RUN_REMOTE_TESTS empty; default Vitest exclusions active.  
Exit: 0.  
Result: 15 test files passed, 131 tests passed, duration about 19.77s.

Observed warnings:

- React state updates in PaymentModal and ReceiptImportModal were not wrapped in act().
- React Router future flag warnings.
- OCR startup log emitted key length and a key prefix in local console. Prefix is intentionally not reproduced here.

## Typecheck

Command: npm run typecheck  
Exit: 0.  
Result: tsc --noEmit completed without errors.

## Build

Command: npm run build  
Exit: 0.  
Result: 2,716 modules transformed; dist generated successfully.

Build warning:

- api.ts is dynamically imported by some modules and statically imported by others, so it will not move into a separate chunk.

## Other

- git diff --check: exit 0.
- npm lint: not run as PASS because package.json has no lint script/config.
- supabase status: blocked by unavailable Docker daemon.
- No remote integration suite was enabled or executed.

