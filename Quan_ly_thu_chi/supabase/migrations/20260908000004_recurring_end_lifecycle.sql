-- End a rule immediately after its final permitted occurrence.
CREATE OR REPLACE FUNCTION public.materialize_recurring_rules(
  p_up_to TIMESTAMPTZ DEFAULT NOW(), p_max_rules INTEGER DEFAULT 50
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_current_next TIMESTAMPTZ;
  v_target_day INTEGER;
  v_step_months INTEGER;
  v_base_date TIMESTAMPTZ;
  v_last_day INTEGER;
  v_actual_day INTEGER;
  v_count INTEGER := 0;
  v_tx_id UUID;
  v_client_id UUID;
  v_rule_ended BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_max_rules < 1 OR p_max_rules > 500 THEN RAISE EXCEPTION 'Invalid rule limit'; END IF;
  FOR v_rule IN
    SELECT * FROM public.recurring_rules
    WHERE user_id = auth.uid() AND status = 'active' AND next_occurrence <= p_up_to
    ORDER BY next_occurrence LIMIT p_max_rules FOR UPDATE
  LOOP
    v_current_next := v_rule.next_occurrence;
    v_target_day := COALESCE(v_rule.day_of_month, EXTRACT(DAY FROM v_rule.start_date)::INTEGER);
    v_rule_ended := FALSE;
    WHILE v_current_next <= p_up_to LOOP
      IF v_rule.end_date IS NOT NULL AND (v_current_next AT TIME ZONE 'UTC')::DATE > v_rule.end_date THEN
        v_rule_ended := TRUE;
        EXIT;
      END IF;
      v_client_id := CAST(MD5(v_rule.id::TEXT || ':' || TO_CHAR(v_current_next AT TIME ZONE 'UTC', 'YYYY-MM-DD')) AS UUID);
      SELECT id INTO v_tx_id FROM public.transactions
      WHERE user_id = auth.uid() AND client_generated_id = v_client_id;
      IF v_tx_id IS NULL THEN
        INSERT INTO public.transactions (
          user_id, type, status, amount_minor, currency, occurred_at,
          category_id, global_category_id, payee, note, source, client_generated_id
        ) VALUES (
          v_rule.user_id, v_rule.type, 'pending', v_rule.amount_minor, v_rule.currency,
          v_current_next, v_rule.category_id, v_rule.global_category_id,
          v_rule.payee, v_rule.note, 'recurring', v_client_id
        ) RETURNING id INTO v_tx_id;
        INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
        VALUES (v_tx_id, v_rule.account_id,
          CASE WHEN v_rule.type IN ('income', 'refund') THEN v_rule.amount_minor ELSE -v_rule.amount_minor END);
        v_count := v_count + 1;
      END IF;

      IF v_rule.frequency = 'daily' THEN
        v_current_next := v_current_next + INTERVAL '1 day';
      ELSIF v_rule.frequency = 'weekly' THEN
        v_current_next := v_current_next + INTERVAL '7 days';
      ELSIF v_rule.frequency = 'biweekly' THEN
        v_current_next := v_current_next + INTERVAL '14 days';
      ELSE
        v_step_months := CASE v_rule.frequency WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END;
        v_base_date := DATE_TRUNC('month', v_current_next AT TIME ZONE 'UTC') + (v_step_months || ' month')::INTERVAL;
        v_last_day := EXTRACT(DAY FROM DATE_TRUNC('month', v_base_date) + INTERVAL '1 month - 1 day')::INTEGER;
        v_actual_day := LEAST(v_target_day, v_last_day);
        v_current_next := DATE_TRUNC('month', v_base_date)
          + ((v_actual_day - 1) || ' days')::INTERVAL + (v_rule.next_occurrence::TIME);
      END IF;
    END LOOP;

    IF v_rule_ended OR (v_rule.end_date IS NOT NULL AND (v_current_next AT TIME ZONE 'UTC')::DATE > v_rule.end_date) THEN
      UPDATE public.recurring_rules SET status = 'ended', next_occurrence = v_current_next,
        updated_at = NOW(), version = version + 1 WHERE id = v_rule.id;
    ELSE
      UPDATE public.recurring_rules SET next_occurrence = v_current_next,
        last_occurrence = CASE WHEN v_count > 0 THEN NOW() ELSE last_occurrence END,
        updated_at = NOW(), version = version + 1 WHERE id = v_rule.id;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

