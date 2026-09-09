BEGIN READ ONLY;
SELECT md5(string_agg(md5((
 (to_jsonb(t)-'user_id'-'old_data'-'new_data') || jsonb_build_object(
 '_owner',(SELECT md5(lower(email)) FROM auth.users u WHERE u.id=t.user_id),
 'old_data',CASE WHEN old_data ? 'occurred_at' THEN (old_data-'occurred_at')||jsonb_build_object('occurred_at',extract(epoch FROM (old_data->>'occurred_at')::timestamptz)) ELSE old_data END,
 'new_data',CASE WHEN new_data ? 'occurred_at' THEN (new_data-'occurred_at')||jsonb_build_object('occurred_at',extract(epoch FROM (new_data->>'occurred_at')::timestamptz)) ELSE new_data END
 ))::text),',' ORDER BY t.id)) AS audit_normalized_hash FROM audit_logs t;
COMMIT;
