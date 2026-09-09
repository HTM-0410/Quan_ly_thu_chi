-- Compatibility with the current production schema before data migration.
-- The source contains legacy debts without person_id and retains these
-- historical columns even though newer UI flows do not use them.

ALTER TABLE public.debts
  ALTER COLUMN person_id DROP NOT NULL;

ALTER TABLE public.debts
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- The source names this ordering field sort_order; the older baseline used
-- display_order. Keep both so all source rows can be copied losslessly.
ALTER TABLE public.global_categories
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

UPDATE public.global_categories
SET sort_order = display_order
WHERE sort_order IS NULL;
