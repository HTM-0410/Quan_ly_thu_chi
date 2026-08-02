import { createClient } from '@supabase/supabase-js';
import type { Database } from './lib/database.types';

const c = createClient<Database>('x', 'y');

async function test() {
  await c.from('profiles').update({ display_name: 'x' }).eq('id', 'a');
  await c.rpc('get_account_balance', { p_account_id: 'a' });
}
export {};