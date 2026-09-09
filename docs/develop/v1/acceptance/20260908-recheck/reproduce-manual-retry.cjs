// Offline reproduction using the actual function body, no Supabase/network access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = path.resolve(__dirname, '../../../../../Quan_ly_thu_chi/web');
const ts = require(path.join(web, 'node_modules/typescript'));
const source = fs.readFileSync(path.join(web, 'src/lib/api.ts'), 'utf8');
const start = source.indexOf('export async function createManualTransaction(');
const end = source.indexOf('\n/**', start);
const body = ts.transpile(source.slice(start, end).replace('export async', 'async'), { target: ts.ScriptTarget.ES2022 });
const committed = new Set();
const keys = [];
let loseResponse = true;
const supabase = { rpc: async (_name, args) => {
  keys.push(args.p_client_generated_id);
  committed.add(args.p_client_generated_id);
  return loseResponse ? { data: null, error: { status: 504, message: 'Response lost after commit' } }
    : { data: 'transaction-id', error: null };
} };
const run = new Function('supabase', 'pickCategoryFields', 'crypto', body + '\nreturn createManualTransaction;')(
  supabase, () => ({ category_id: null, global_category_id: null }), crypto);
(async () => {
  const payload = { type: 'expense', account_id: 'mock-account', amount_minor: 100000,
    occurred_at: '2026-09-08T03:00:00.000Z', note: 'offline acceptance fixture' };
  try { await run({ ...payload }); } catch (_) { /* UI displays error and retains form. */ }
  loseResponse = false;
  await run({ ...payload }); // The current TransactionsPage submit passes no operation key.
  console.log(JSON.stringify({ rpcCalls: keys.length, firstCallRetriesKeepKey: new Set(keys.slice(0, 3)).size === 1,
    uiResubmitKeepsKey: keys[0] === keys[3], simulatedCommittedTransactions: committed.size,
    result: committed.size === 1 ? 'PASS' : 'FAIL' }, null, 2));
})();
