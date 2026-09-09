\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','finance-fixture@example.invalid','{}');
INSERT INTO financial_accounts(id,user_id,name,type,opening_balance_minor) VALUES ('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Fixture','cash',10000);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000001',true);
DO $$
DECLARE person uuid; debt uuid; result jsonb; again jsonb; summary record; failed boolean:=false;
BEGIN
 SELECT (create_person('Fixture person',null)).id INTO person;
 SELECT (create_debt(person,'lend',1000,null)).id INTO debt;
 result:=create_paying_for_operation('aaaaaaaa-2000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001',600,400,debt,'2026-09-08T00:00:00Z');
 again:=create_paying_for_operation('aaaaaaaa-2000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001',600,400,debt,'2026-09-08T00:00:00Z');
 IF result->>'payment_id' IS DISTINCT FROM again->>'payment_id' OR (SELECT count(*) FROM debt_payments WHERE debt_id=debt)<>1 THEN RAISE EXCEPTION 'Duplicate payment'; END IF;
 IF (SELECT remaining_amount FROM debts WHERE id=debt)<>600 OR calculate_account_balance('aaaaaaaa-1000-4000-8000-000000000001')<>9800 THEN RAISE EXCEPTION 'Incorrect balance'; END IF;
 SELECT * INTO summary FROM get_transactions_summary('2026-09-01','2026-09-30');
 IF summary.total_income<>0 OR summary.total_expense<>600 THEN RAISE EXCEPTION 'Consumer totals incorrect'; END IF;
 BEGIN PERFORM create_paying_for_operation('aaaaaaaa-2000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001',601,400,debt,'2026-09-08T00:00:00Z'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Changed payload accepted'; END IF;
 failed:=false;
 BEGIN PERFORM create_paying_for_operation(gen_random_uuid(),'aaaaaaaa-1000-4000-8000-000000000001',900,900,debt,'2026-09-08T00:00:00Z'); EXCEPTION WHEN OTHERS THEN failed:=true; END;
 IF NOT failed OR (SELECT count(*) FROM transactions)<>2 OR (SELECT remaining_amount FROM debts WHERE id=debt)<>600 THEN RAISE EXCEPTION 'Failed operation left partial writes'; END IF;
 RAISE NOTICE 'PASS: paying-for retry, payload mismatch, overpayment rollback, balance and consumption';
END $$;
ROLLBACK;
