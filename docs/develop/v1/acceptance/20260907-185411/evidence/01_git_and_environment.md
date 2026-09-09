# Evidence 01 — Git and environment

Timestamp: 2026-09-07, UTC+7.

- Branch: main, tracking origin/main.
- HEAD: a1f5a21dfe54742bf3e8867a413a36a5a90b6fd1.
- Working tree: dirty before acceptance; many app, migration, test, config and docs changes, plus untracked migration/test/script files.
- No reset/checkout/commit/push was run.
- Source app: D:/Quản lý thu chi/Quan_ly_thu_chi/web.
- package scripts: dev, build, test, typecheck; no lint script.
- Supabase CLI status attempt failed because Docker Desktop Linux engine pipe was unavailable.
- Remote test opt-in was not enabled; RUN_REMOTE_TESTS was empty.
- No remote write, no db push, no deploy and no real Gemini call were performed.

Configuration identity observation, values sanitized:

- project .env SUPABASE_URL host uses the older project ref.
- web/.env.local uses a different project ref.
- supabase/.temp/project-ref retained the older ref.
- supabase/config.toml project_id uses the newer ref.

This mismatch is recorded as ISSUE-ACC-006; no attempt was made to resolve it by mutating config or remote state.

