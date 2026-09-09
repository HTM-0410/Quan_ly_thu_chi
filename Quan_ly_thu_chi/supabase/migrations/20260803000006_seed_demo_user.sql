-- ================================================================
-- SEED: Dữ liệu demo cho tài khoản demo@finly.vn / Demo123456!
-- Chạy trong Supabase SQL Editor (toàn bộ file này)

-- Compatibility for the historical debt migration sequence. These columns are
-- finalized in m10 after the seed has populated them.
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS counterparty_name TEXT;
ALTER TABLE public.debts ADD COLUMN IF NOT EXISTS counterparty_phone TEXT;
ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'payment';
ALTER TABLE public.debt_payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'VND';
ALTER TABLE public.recurring_rules ALTER COLUMN next_occurrence SET DEFAULT NOW();
-- Idempotent: chạy lại nhiều lần đều an toàn
-- ================================================================

-- ================================================================
-- 1. TẠO USER DEMO TRONG auth.users
-- ================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token,
  email_change, email_change_token_new, recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'demo@finly.vn',
  crypt('Demo123456!', gen_salt('bf')),
  now(),
  NULL,
  NULL,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Demo User"}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@finly.vn');

-- Lấy demo user id (khai báo qua CTE-friendly subquery)
DO $$
DECLARE
  demo_user_id UUID;
  acc_cash_id UUID;
  acc_bank_id UUID;
  acc_ewallet_id UUID;
  acc_credit_id UUID;
  cat_food_id UUID;
  cat_transport_id UUID;
  cat_grocery_id UUID;
  cat_entertainment_id UUID;
  cat_bills_id UUID;
  cat_salary_id UUID;
  cat_health_id UUID;
  cat_shopping_id UUID;
  cat_education_id UUID;
  cat_bonus_id UUID;
  person1_id UUID;
  person2_id UUID;
  person3_id UUID;
  debt1_id UUID;
  debt2_id UUID;
  debt3_id UUID;
  tx_id UUID;
  occurred TIMESTAMPTZ;
  i INT;
BEGIN
  SELECT id INTO demo_user_id FROM auth.users WHERE email = 'demo@finly.vn';

  -- Idempotency: xoá data cũ của user demo (nếu có) trước khi seed lại
  DELETE FROM public.debt_payments WHERE debt_id IN (SELECT id FROM public.debts WHERE user_id = demo_user_id);
  DELETE FROM public.debts WHERE user_id = demo_user_id;
  DELETE FROM public.people WHERE user_id = demo_user_id;
  DELETE FROM public.goal_contributions WHERE user_id = demo_user_id;
  DELETE FROM public.saving_goals WHERE user_id = demo_user_id;
  DELETE FROM public.budgets WHERE user_id = demo_user_id;
  DELETE FROM public.recurring_rules WHERE user_id = demo_user_id;
  DELETE FROM public.transaction_splits WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = demo_user_id);
  DELETE FROM public.transaction_entries WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = demo_user_id);
  DELETE FROM public.transactions WHERE user_id = demo_user_id;
  DELETE FROM public.categories WHERE user_id = demo_user_id;
  DELETE FROM public.financial_accounts WHERE user_id = demo_user_id;

  -- ================================================================
  -- 2. PROFILE
  -- ================================================================
  INSERT INTO public.profiles (id, display_name, base_currency, timezone, locale, onboarding_completed)
  VALUES (demo_user_id, 'Demo User', 'VND', 'Asia/Ho_Chi_Minh', 'vi-VN', TRUE)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    onboarding_completed = TRUE,
    updated_at = NOW();

  -- ================================================================
  -- 3. FINANCIAL ACCOUNTS (4 tài khoản)
  -- ================================================================
  INSERT INTO public.financial_accounts (user_id, name, type, currency, opening_balance_minor, color, icon, institution_name) VALUES
    (demo_user_id, 'Tiền mặt', 'cash', 'VND', 3000000, '#10B981', 'wallet', NULL),
    (demo_user_id, 'Vietcombank', 'bank', 'VND', 25000000, '#1E88E5', 'account_balance', 'VCB'),
    (demo_user_id, 'MoMo', 'ewallet', 'VND', 1500000, '#D32F2F', 'phone_android', 'MoMo'),
    (demo_user_id, 'Thẻ tín dụng VPB', 'credit_card', 'VND', 0, '#7B1FA2', 'credit_card', 'VPBank');

  SELECT id INTO acc_cash_id FROM public.financial_accounts WHERE user_id = demo_user_id AND name = 'Tiền mặt';
  SELECT id INTO acc_bank_id FROM public.financial_accounts WHERE user_id = demo_user_id AND name = 'Vietcombank';
  SELECT id INTO acc_ewallet_id FROM public.financial_accounts WHERE user_id = demo_user_id AND name = 'MoMo';
  SELECT id INTO acc_credit_id FROM public.financial_accounts WHERE user_id = demo_user_id AND name = 'Thẻ tín dụng VPB';

  -- ================================================================
  -- 4. CATEGORIES
  -- ================================================================
  INSERT INTO public.categories (user_id, name, kind, icon, color, sort_order) VALUES
    (demo_user_id, 'Ăn uống', 'expense', 'restaurant', '#FF7043', 1),
    (demo_user_id, 'Đi lại', 'expense', 'directions_car', '#42A5F5', 2),
    (demo_user_id, 'Đi chợ/siêu thị', 'expense', 'shopping_cart', '#66BB6A', 3),
    (demo_user_id, 'Giải trí', 'expense', 'movie', '#AB47BC', 4),
    (demo_user_id, 'Hoá đơn', 'expense', 'receipt', '#FFA726', 5),
    (demo_user_id, 'Sức khoẻ', 'expense', 'medical_services', '#EF5350', 6),
    (demo_user_id, 'Mua sắm', 'expense', 'shopping_bag', '#EC407A', 7),
    (demo_user_id, 'Học tập', 'expense', 'school', '#5C6BC0', 8),
    (demo_user_id, 'Lương', 'income', 'payments', '#10B981', 100),
    (demo_user_id, 'Thưởng', 'income', 'card_giftcard', '#F59E0B', 101);

  SELECT id INTO cat_food_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Ăn uống';
  SELECT id INTO cat_transport_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Đi lại';
  SELECT id INTO cat_grocery_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Đi chợ/siêu thị';
  SELECT id INTO cat_entertainment_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Giải trí';
  SELECT id INTO cat_bills_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Hoá đơn';
  SELECT id INTO cat_salary_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Lương';
  SELECT id INTO cat_health_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Sức khoẻ';
  SELECT id INTO cat_shopping_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Mua sắm';
  SELECT id INTO cat_education_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Học tập';
  SELECT id INTO cat_bonus_id FROM public.categories WHERE user_id = demo_user_id AND name = 'Thưởng';

  -- ================================================================
  -- 5. TRANSACTIONS - Giao dịch
  -- ================================================================
  -- Income: Lương tháng (ngày 5 hàng tháng, 3 tháng)
  FOR i IN 0..2 LOOP
    occurred := date_trunc('month', NOW()) - (i || ' months')::interval + interval '5 days' + interval '9 hours';
    INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
    VALUES (demo_user_id, 'income', 'posted', occurred, 18000000 + (i * 1000000), 'VND', cat_salary_id, 'Công ty ABC', 'Lương tháng ' || (extract(month from occurred)::text), 'manual', 'confirmed')
    RETURNING id INTO tx_id;
    INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor)
    VALUES (tx_id, acc_bank_id, 18000000 + (i * 1000000));
  END LOOP;

  -- Income: Thưởng dự án (1 lần)
  INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
  VALUES (demo_user_id, 'income', 'posted', NOW() - interval '45 days', 5000000, 'VND', cat_bonus_id, 'Công ty ABC', 'Thưởng hoàn thành dự án', 'manual', 'confirmed')
  RETURNING id INTO tx_id;
  INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_bank_id, 5000000);

  -- Expense random cho 60 ngày gần nhất
  FOR i IN 1..80 LOOP
    occurred := NOW() - (random() * interval '60 days');
    CASE floor(random() * 8)::int
      WHEN 0 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (30000 + floor(random() * 120000))::bigint, 'VND', cat_food_id,
          (ARRAY['Quán phở Hà Nội','Cơm tấm Sài Gòn','Bún bò Huế','Quán cơm văn phòng','Highlands Coffee','The Coffee House','Starbucks','Lotteria','KFC','McDonald''s','Bánh mì Huỳnh Hoa','Sushi Hokkaido','Pizza Hut'])[floor(random()*13)+1],
          'Ăn uống', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        IF random() < 0.5 THEN
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_cash_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        ELSE
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_ewallet_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        END IF;
      WHEN 1 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (15000 + floor(random() * 80000))::bigint, 'VND', cat_transport_id,
          (ARRAY['Grab Bike','Grab Car','Be','Xăng','Gửi xe','Taxi Vinasun','Metro'])[floor(random()*7)+1],
          'Di chuyển', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        IF random() < 0.6 THEN
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_ewallet_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        ELSE
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_cash_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        END IF;
      WHEN 2 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (200000 + floor(random() * 800000))::bigint, 'VND', cat_grocery_id,
          (ARRAY['Co.opmart','Bách Hoá Xanh','Vinmart','Lotte Mart','Chợ đầu mối','Big C'])[floor(random()*6)+1],
          'Đi chợ', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_bank_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
      WHEN 3 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (80000 + floor(random() * 400000))::bigint, 'VND', cat_entertainment_id,
          (ARRAY['CGV','Lotte Cinema','Galaxy Cinema','Netflix','Spotify','Steam','Karaoke'])[floor(random()*7)+1],
          'Giải trí', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        IF random() < 0.5 THEN
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_credit_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        ELSE
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_ewallet_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        END IF;
      WHEN 4 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (150000 + floor(random() * 600000))::bigint, 'VND', cat_bills_id,
          (ARRAY['EVN HCM','VNPT','Viettel','Mobifone','Internet FPT','Nước SAWACO'])[floor(random()*6)+1],
          'Hoá đơn hàng tháng', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_bank_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
      WHEN 5 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (100000 + floor(random() * 1500000))::bigint, 'VND', cat_health_id,
          (ARRAY['Nhà thuốc Long Châu','Pharmacity','Bệnh viện Chợ Rẫy','Phòng khám ĐK','Bảo hiểm nhân thọ'])[floor(random()*5)+1],
          'Khám sức khoẻ', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        IF random() < 0.7 THEN
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_bank_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        ELSE
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_credit_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        END IF;
      WHEN 6 THEN
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (200000 + floor(random() * 2000000))::bigint, 'VND', cat_shopping_id,
          (ARRAY['Shopee','Lazada','Tiki','Zara','Uniqlo','Điện Máy Xanh','Thế Giới Di Động'])[floor(random()*7)+1],
          'Mua sắm', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        IF random() < 0.6 THEN
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_ewallet_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        ELSE
          INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_credit_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
        END IF;
      ELSE
        INSERT INTO public.transactions (user_id, type, status, occurred_at, amount_minor, currency, category_id, payee, note, source, classification_status)
        VALUES (demo_user_id, 'expense', 'posted', occurred, (200000 + floor(random() * 800000))::bigint, 'VND', cat_education_id,
          (ARRAY['Udemy','Coursera','Sách Đông A','Nhà sách Fahasa','Trung tâm Anh ngữ'])[floor(random()*5)+1],
          'Học tập', 'manual', 'confirmed')
        RETURNING id INTO tx_id;
        INSERT INTO public.transaction_entries (transaction_id, account_id, amount_minor) VALUES (tx_id, acc_bank_id, (SELECT amount_minor FROM public.transactions WHERE id = tx_id));
    END CASE;
  END LOOP;

  -- ================================================================
  -- 6. PEOPLE & DEBTS
  -- ================================================================
  INSERT INTO public.people (user_id, name, phone) VALUES
    (demo_user_id, 'Nguyễn Văn An', '0901234567'),
    (demo_user_id, 'Trần Thị Bình', '0912345678'),
    (demo_user_id, 'Lê Hoàng Cường', '0923456789');

  SELECT id INTO person1_id FROM public.people WHERE user_id = demo_user_id AND name = 'Nguyễn Văn An';
  SELECT id INTO person2_id FROM public.people WHERE user_id = demo_user_id AND name = 'Trần Thị Bình';
  SELECT id INTO person3_id FROM public.people WHERE user_id = demo_user_id AND name = 'Lê Hoàng Cường';

  INSERT INTO public.debts (user_id, person_id, counterparty_name, type, original_amount, remaining_amount, status, notes) VALUES
    (demo_user_id, person1_id, (SELECT name FROM public.people WHERE id = person1_id), 'lend', 5000000, 3000000, 'active', 'Cho vay mua xe máy'),
    (demo_user_id, person2_id, (SELECT name FROM public.people WHERE id = person2_id), 'lend', 2000000, 0, 'paid', 'Cho mượn tiền đã trả đủ'),
    (demo_user_id, person3_id, (SELECT name FROM public.people WHERE id = person3_id), 'borrow', 10000000, 7000000, 'active', 'Vay mua đồ gia dụng');

  SELECT id INTO debt1_id FROM public.debts WHERE user_id = demo_user_id AND person_id = person1_id AND type = 'lend' AND remaining_amount = 3000000;
  SELECT id INTO debt2_id FROM public.debts WHERE user_id = demo_user_id AND person_id = person2_id AND type = 'lend';
  SELECT id INTO debt3_id FROM public.debts WHERE user_id = demo_user_id AND person_id = person3_id AND type = 'borrow';

  INSERT INTO public.debt_payments (debt_id, user_id, amount, payment_date, payment_type, notes) VALUES
    (debt1_id, demo_user_id, 1000000, NOW() - interval '20 days', 'payment', 'Trả đợt 1'),
    (debt1_id, demo_user_id, 1000000, NOW() - interval '5 days',  'payment', 'Trả đợt 2'),
    (debt2_id, demo_user_id, 2000000, NOW() - interval '30 days', 'payment', 'Trả 1 lần'),
    (debt3_id, demo_user_id, 3000000, NOW() - interval '15 days', 'payment', 'Trả đợt 1');

  -- ================================================================
  -- 7. SAVING GOALS
  -- ================================================================
  INSERT INTO public.saving_goals (user_id, name, target_amount_minor, current_amount_minor, start_date, target_date, note, icon, color) VALUES
    (demo_user_id, 'Mua iPhone 17 Pro', 30000000, 12000000, CURRENT_DATE - interval '6 months', CURRENT_DATE + interval '6 months', 'Quỹ mua điện thoại mới', 'phone_iphone', '#1E88E5'),
    (demo_user_id, 'Du lịch Nhật Bản', 50000000, 8000000, CURRENT_DATE - interval '3 months', CURRENT_DATE + interval '9 months', 'Chuyến đi mơ ước', 'flight', '#F59E0B'),
    (demo_user_id, 'Quỹ khẩn cấp', 100000000, 35000000, CURRENT_DATE - interval '12 months', CURRENT_DATE + interval '12 months', '6 tháng chi phí sinh hoạt', 'savings', '#10B981');

  -- ================================================================
  -- 8. BUDGETS (Ngân sách tháng này)
  -- ================================================================
  INSERT INTO public.budgets (user_id, category_id, name, amount_minor, currency, cadence, start_date, end_date) VALUES
    (demo_user_id, cat_food_id, 'Ăn uống tháng này', 4000000, 'VND', 'monthly', date_trunc('month', NOW()), (date_trunc('month', NOW()) + interval '1 month - 1 day')::date),
    (demo_user_id, cat_transport_id, 'Đi lại tháng này', 2000000, 'VND', 'monthly', date_trunc('month', NOW()), (date_trunc('month', NOW()) + interval '1 month - 1 day')::date),
    (demo_user_id, cat_grocery_id, 'Đi chợ tháng này', 6000000, 'VND', 'monthly', date_trunc('month', NOW()), (date_trunc('month', NOW()) + interval '1 month - 1 day')::date),
    (demo_user_id, cat_entertainment_id, 'Giải trí tháng này', 1500000, 'VND', 'monthly', date_trunc('month', NOW()), (date_trunc('month', NOW()) + interval '1 month - 1 day')::date),
    (demo_user_id, cat_bills_id, 'Hoá đơn tháng này', 3000000, 'VND', 'monthly', date_trunc('month', NOW()), (date_trunc('month', NOW()) + interval '1 month - 1 day')::date);

  -- ================================================================
  -- 9. RECURRING RULES
  -- ================================================================
  INSERT INTO public.recurring_rules (user_id, name, type, account_id, amount_minor, currency, frequency, start_date, category_id, payee, note) VALUES
    (demo_user_id, 'Lương hàng tháng', 'income', acc_bank_id, 18000000, 'VND', 'monthly', date_trunc('month', NOW())::date, cat_salary_id, 'Công ty ABC', 'Lương cố định'),
    (demo_user_id, 'Tiền điện', 'expense', acc_bank_id, 500000, 'VND', 'monthly', date_trunc('month', NOW())::date, cat_bills_id, 'EVN HCM', 'Thanh toán điện'),
    (demo_user_id, 'Internet FPT', 'expense', acc_bank_id, 250000, 'VND', 'monthly', date_trunc('month', NOW())::date, cat_bills_id, 'FPT Telecom', 'Cáp quang + Wifi'),
    (demo_user_id, 'Netflix', 'expense', acc_credit_id, 260000, 'VND', 'monthly', date_trunc('month', NOW())::date, cat_entertainment_id, 'Netflix', 'Premium plan');

  RAISE NOTICE 'Seed data thanh cong cho user demo@finly.vn';
END $$;

-- ================================================================
-- HƯỚNG DẪN
-- Email:    demo@finly.vn
-- Password: Demo123456!
-- ================================================================
