\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone = 'UTC';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','acceptance-a@example.invalid','{}'),
 ('bbbbbbbb-0000-4000-8000-000000000002','acceptance-b@example.invalid','{}');
INSERT INTO financial_accounts(id,user_id,name,type,opening_balance_minor) VALUES
 ('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Fixture A','cash',10000),
 ('bbbbbbbb-1000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002','Fixture B','cash',20000);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $$
DECLARE a uuid := 'aaaaaaaa-1000-4000-8000-000000000001'; t uuid; s record; blocked boolean := false;
BEGIN
 IF (SELECT count(*) FROM financial_accounts) <> 1 THEN RAISE EXCEPTION 'RLS account isolation failed'; END IF;
 BEGIN PERFORM list_accounts_with_balances('bbbbbbbb-0000-4000-8000-000000000002',true);
 EXCEPTION WHEN OTHERS THEN blocked := true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Cross-user RPC was allowed'; END IF;
 t := create_manual_transaction('aaaaaaaa-2000-4000-8000-000000000001','expense',a,100,'VND','2026-09-08T00:00:00Z');
 IF t <> create_manual_transaction('aaaaaaaa-2000-4000-8000-000000000001','expense',a,100,'VND','2026-09-08T00:00:00Z') THEN RAISE EXCEPTION 'Idempotent retry failed'; END IF;
 blocked := false;
 BEGIN PERFORM create_manual_transaction('aaaaaaaa-2000-4000-8000-000000000001','expense',a,101,'VND','2026-09-08T00:00:00Z');
 EXCEPTION WHEN OTHERS THEN blocked := true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Payload mismatch accepted'; END IF;
 t := create_manual_transaction(gen_random_uuid(),'expense',a,200,'VND','2026-09-08T00:00:00Z');
 UPDATE transactions SET status='pending' WHERE id=t;
 t := create_manual_transaction(gen_random_uuid(),'expense',a,300,'VND','2026-09-08T00:00:00Z');
 UPDATE transactions SET status='voided' WHERE id=t;
 IF calculate_account_balance(a) <> 9900 THEN RAISE EXCEPTION 'Pending/voided affects balance'; END IF;
 SELECT * INTO s FROM get_transactions_summary('2026-09-01','2026-09-30');
 IF s.total_expense <> 100 THEN RAISE EXCEPTION 'Pending/voided affects summary'; END IF;
 t := create_manual_transaction(gen_random_uuid(),'income',a,400,'VND','2026-09-08T00:00:00Z');
 UPDATE transactions SET metadata='{"is_debt_principal":true}' WHERE id=t;
 IF calculate_account_balance(a) <> 10300 THEN RAISE EXCEPTION 'Principal should affect balance'; END IF;
 SELECT * INTO s FROM get_transactions_summary('2026-09-01','2026-09-30');
 IF s.total_income <> 0 THEN RAISE EXCEPTION 'Debt principal incorrectly counted as income: %',s.total_income; END IF;
 SELECT * INTO s FROM get_monthly_history('aaaaaaaa-0000-4000-8000-000000000001',24,'Asia/Ho_Chi_Minh')
 WHERE period_start='2026-09-01';
 IF s.total_income <> 0 OR s.total_expense <> 100 THEN RAISE EXCEPTION 'Monthly history diverges from summary'; END IF;
 RAISE NOTICE 'PASS: ownership, posted-only, retry, payload conflict, principal exclusion';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN PERFORM calculate_account_balance('aaaaaaaa-1000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Anonymous balance access allowed'; END IF;
 RAISE NOTICE 'PASS: anonymous balance RPC denied';
END $$;
ROLLBACK;
