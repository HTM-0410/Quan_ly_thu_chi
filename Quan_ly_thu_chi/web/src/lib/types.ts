// ============================================================
// Public type entrypoint.
// Domain types sống trong ./domain.ts
// Database schema typing cho @supabase/supabase-js sống trong ./database.types.ts
// ============================================================

export * from './domain';
export type { Database } from './database.types';
export { APP_NAME, SUPABASE_URL, SUPABASE_ANON_KEY } from './config';