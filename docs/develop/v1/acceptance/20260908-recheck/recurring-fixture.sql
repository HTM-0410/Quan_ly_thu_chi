\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone='UTC';
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','acceptance-a@example.invalid','{}');
INSERT INTO financial_accounts(id,user_id,name,type,opening_balance_minor) VALUES
 ('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Fixture A','cash',10000);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
INSERT INTO recurring_rules(user_id,name,type,account_id,amount_minor,frequency,start_date,end_date,day_of_month,next_occurrence)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001','Day 31 fixture','expense','aaaaaaaa-1000-4000-8000-000000000001',100,'monthly','2026-01-31','2026-03-31',31,'2026-01-31T00:00:00Z');
DO $$
DECLARE n integer; tx uuid; dates text[]; blocked boolean:=false;
BEGIN
 n := materialize_recurring_rules('2026-04-01T00:00:00Z',50);
 IF n<>3 THEN RAISE EXCEPTION 'Expected three occurrences, got %', n; END IF;
 SELECT array_agg(to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD') ORDER BY occurred_at) INTO dates FROM transactions;
 IF dates <> ARRAY['2026-01-31','2026-02-28','2026-03-31'] THEN RAISE EXCEPTION 'Wrong dates %', dates; END IF;
 IF EXISTS(SELECT 1 FROM transactions WHERE status<>'pending') THEN RAISE EXCEPTION 'Occurrence not pending'; END IF;
 IF calculate_account_balance('aaaaaaaa-1000-4000-8000-000000000001')<>10000 THEN RAISE EXCEPTION 'Pending changes balance'; END IF;
 IF materialize_recurring_rules('2026-04-01T00:00:00Z',50)<>0 THEN RAISE EXCEPTION 'Duplicate materialization'; END IF;
 SELECT id INTO tx FROM transactions ORDER BY occurred_at LIMIT 1;
 PERFORM confirm_recurring_transaction(tx); PERFORM confirm_recurring_transaction(tx);
 IF calculate_account_balance('aaaaaaaa-1000-4000-8000-000000000001')<>9900 THEN RAISE EXCEPTION 'Confirmation not exactly once'; END IF;
 SELECT id INTO tx FROM transactions WHERE status='pending' ORDER BY occurred_at LIMIT 1;
 PERFORM skip_recurring_transaction(tx); PERFORM skip_recurring_transaction(tx);
 BEGIN PERFORM confirm_recurring_transaction(tx); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Skipped occurrence could be confirmed'; END IF;
 IF calculate_account_balance('aaaaaaaa-1000-4000-8000-000000000001')<>9900 THEN RAISE EXCEPTION 'Skip changes balance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM recurring_rules WHERE status='ended') THEN RAISE EXCEPTION 'Rule did not end'; END IF;
 RAISE NOTICE 'PASS: day31 clamping, pending balance, duplicate materialization/confirm/skip, ended';
END $$;
ROLLBACK;
