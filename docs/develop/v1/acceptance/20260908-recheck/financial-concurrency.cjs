const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const db = process.argv[2];
assert.match(db || '', /^acceptance_\d+$/);
function sql(query) {
  return new Promise((resolve, reject) => {
    const p = spawn('psql', ['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At','-f','-'], { windowsHide:true });
    let out='',err=''; p.stdout.on('data',d=>out+=d); p.stderr.on('data',d=>err+=d);
    p.on('error',reject); p.on('close',code=>code ? reject(new Error(err)) : resolve(out.trim())); p.stdin.end(query);
  });
}
(async()=>{
 const u=randomUUID(), a=randomUUID(), person=randomUUID(), debt=randomUUID(), op=randomUUID();
 await sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('${u}','${u}@example.invalid','{}');
 INSERT INTO financial_accounts(id,user_id,name,type,opening_balance_minor) VALUES ('${a}','${u}','Concurrency fixture','cash',10000);
 INSERT INTO people(id,user_id,name) VALUES ('${person}','${u}','Fixture');
 INSERT INTO debts(id,user_id,person_id,type,counterparty_name,original_amount,remaining_amount,status) VALUES ('${debt}','${u}','${person}','lend','Fixture',1000,1000,'active');`);
 const q=`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${u}',true); SELECT create_paying_for_operation('${op}','${a}',600,400,'${debt}','2026-09-08T00:00:00Z'); COMMIT;`;
 await Promise.all([sql(q),sql(q)]);
 const result = JSON.parse(await sql(`SELECT json_build_object('transactions',(SELECT count(*) FROM transactions WHERE user_id='${u}'),'payments',(SELECT count(*) FROM debt_payments WHERE debt_id='${debt}'),'remaining',(SELECT remaining_amount FROM debts WHERE id='${debt}'),'operations',(SELECT count(*) FROM financial_operations WHERE user_id='${u}'));`));
 assert.deepEqual(result,{transactions:2,payments:1,remaining:600,operations:1});
 console.log(JSON.stringify({database:db,concurrentRequests:2,result,status:'PASS'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
