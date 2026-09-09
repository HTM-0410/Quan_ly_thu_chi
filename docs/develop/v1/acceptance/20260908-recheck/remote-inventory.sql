BEGIN READ ONLY;
SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS columns
FROM information_schema.columns WHERE table_schema='public'
GROUP BY table_name ORDER BY table_name;
SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments,
 md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
AND p.proname IN ('create_manual_transaction','settle_debt_payment','get_monthly_history',
 'get_transactions_summary','calculate_account_balance','materialize_recurring_rules',
 'confirm_recurring_transaction','create_ocr_transaction_row')
ORDER BY p.proname, arguments;
COMMIT;
