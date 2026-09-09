BEGIN READ ONLY;
SELECT c.relname AS table_name,
 (xpath('/row/hash/text()', query_to_xml(format($q$
 SELECT md5(coalesce(string_agg(h,',' ORDER BY h),'')) AS hash FROM (
 SELECT md5((
 (CASE WHEN %L='profiles' THEN to_jsonb(t)-'id'-'user_id' ELSE to_jsonb(t)-'user_id' END)
 || jsonb_build_object('_owner', (SELECT md5(lower(u.email)) FROM auth.users u
 WHERE u.id=CASE WHEN %L='profiles' THEN (to_jsonb(t)->>'id')::uuid ELSE (to_jsonb(t)->>'user_id')::uuid END))
 )::text) AS h FROM public.%I t) rows
 $q$,c.relname,c.relname,c.relname),false,true,'')))[1]::text AS fingerprint
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
COMMIT;
