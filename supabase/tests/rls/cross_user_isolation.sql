-- RLS cross-user isolation smoke tests
-- Intended for local supabase db / pgTAP-style manual verification.
-- Creates two synthetic auth users and asserts User A cannot read User B rows.

begin;

create extension if not exists pgcrypto;

-- Synthetic auth users (local test only)
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user-a@example.com', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'user-b@example.com', crypt('password', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into public.user_profiles (
  user_id, date_of_birth, biological_sex, height_cm, weight_kg, fitness_experience,
  dietary_preference, meal_prep_availability, cooking_skill, max_meal_prep_minutes
) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1990-01-01', 'female', 165, 70, 'intermediate', 'omnivore', 'weekends', 'intermediate', 45),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1991-01-01', 'male', 180, 80, 'beginner', 'omnivore', 'none', 'beginner', 20)
on conflict (user_id) do nothing;

insert into public.goals (id, user_id, goal_type, start_date, status)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fat_loss', current_date, 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'muscle_gain', current_date, 'active')
on conflict (id) do nothing;

insert into public.nutrition_targets (
  id, user_id, goal_id, estimated_maintenance_calories, target_calories, protein_g,
  fat_min_g, fat_max_g, carbohydrate_g, desired_rate_kg_per_week, algorithm_name,
  algorithm_version, input_snapshot, valid_from
) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 2000, 1800, 120, 40, 70, 180, -0.5, 'nutrition-target', 'nutrition-target-v1', '{}'::jsonb, now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 2500, 2700, 150, 50, 90, 250, 0.25, 'nutrition-target', 'nutrition-target-v1', '{}'::jsonb, now())
on conflict (id) do nothing;

insert into public.daily_plans (id, user_id, nutrition_target_id, plan_date, planned_calories, planned_protein_g)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0002', current_date, 1800, 120),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', current_date, 2700, 150)
on conflict (id) do nothing;

insert into public.rmr_estimates (
  id, user_id, rmr_kcal, source, algorithm_name, algorithm_version,
  input_snapshot, reported_or_measured_at, calculated_at
) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0004',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    1390,
    'estimated_mifflin_st_jeor',
    'mifflin_st_jeor',
    'rmr-v1',
    '{"dateOfBirth":"1990-01-01","biologicalSex":"female","heightCm":165,"weightKg":70,"ageYears":36}'::jsonb,
    null,
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    1782,
    'user_reported_dexa',
    null,
    null,
    null,
    '2026-01-15',
    now()
  )
on conflict (id) do nothing;

insert into public.tdee_estimates (
  id, user_id, tdee_kcal, source, wearable, wearable_calories_kcal,
  rmr_kcal_used, algorithm_name, algorithm_version, input_snapshot, calculated_at
) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    2400,
    'apple_watch_active_plus_rmr',
    'apple_watch',
    650,
    1750,
    'apple_watch_active_plus_rmr',
    'tdee-v1',
    '{"wearable":"apple_watch","wearableCaloriesKcal":650,"rmrKcal":1750,"rmrSource":"estimated_mifflin_st_jeor","goalType":"fat_loss"}'::jsonb,
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    2800,
    'whoop_daily_calories',
    'whoop',
    2800,
    null,
    null,
    null,
    '{"wearable":"whoop","wearableCaloriesKcal":2800,"rmrKcal":1782,"rmrSource":"user_reported_dexa","goalType":"muscle_gain"}'::jsonb,
    now()
  )
on conflict (id) do nothing;

insert into public.calorie_targets (
  id, user_id, goal_id, tdee_estimate_id, tdee_kcal, body_weight_kg, body_weight_lb,
  pace, target_rate_per_week, target_lb_per_week, weekly_calorie_adjustment,
  daily_calorie_adjustment, target_calories, policy_name, policy_version, input_snapshot
) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0006',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0005',
    2400,
    81.6466266,
    180,
    'recommended',
    -0.005,
    -0.9,
    -3150,
    -450,
    1950,
    'weight-change-policy',
    'weight-change-policy-v1',
    '{"goalType":"fat_loss","weightChangeDirection":"weight_loss","pace":"recommended","weightKg":81.6466266,"weightLb":180,"tdeeKcal":2400,"targetRatePerWeek":-0.005,"policyVersion":"weight-change-policy-v1"}'::jsonb
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',
    2800,
    81.6466266,
    180,
    'recommended',
    0.0025,
    0.45,
    1575,
    225,
    3025,
    'weight-change-policy',
    'weight-change-policy-v1',
    '{"goalType":"muscle_gain","weightChangeDirection":"weight_gain","pace":"recommended","weightKg":81.6466266,"weightLb":180,"tdeeKcal":2800,"targetRatePerWeek":0.0025,"policyVersion":"weight-change-policy-v1"}'::jsonb
  )
on conflict (id) do nothing;

-- Become user A
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local request.jwt.claim.role = 'authenticated';

do $$
declare
  n int;
begin
  select count(*) into n from public.user_profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B profile'; end if;

  select count(*) into n from public.goals where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B goals'; end if;

  select count(*) into n from public.nutrition_targets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 1 then raise exception 'RLS FAIL: user A cannot read own nutrition target'; end if;

  select count(*) into n from public.nutrition_targets where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B nutrition targets'; end if;

  update public.nutrition_targets
    set target_calories = 1
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS FAIL: user A can modify user B nutrition target'; end if;

  select count(*) into n from public.daily_plans where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B daily plans'; end if;

  select count(*) into n from public.user_profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 1 then raise exception 'RLS FAIL: user A cannot read own profile'; end if;

  select count(*) into n from public.rmr_estimates where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 1 then raise exception 'RLS FAIL: user A cannot read own RMR'; end if;

  select count(*) into n from public.rmr_estimates where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B RMR'; end if;

  update public.rmr_estimates
    set rmr_kcal = 1
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS FAIL: user A can modify user B RMR'; end if;

  select count(*) into n from public.tdee_estimates where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 1 then raise exception 'RLS FAIL: user A cannot read own TDEE'; end if;

  select count(*) into n from public.tdee_estimates where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B TDEE'; end if;

  update public.tdee_estimates
    set tdee_kcal = 1
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS FAIL: user A can modify user B TDEE'; end if;

  select count(*) into n from public.calorie_targets where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 1 then raise exception 'RLS FAIL: user A cannot read own calorie target'; end if;

  select count(*) into n from public.calorie_targets where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'RLS FAIL: user A can read user B calorie target'; end if;

  update public.calorie_targets
    set target_calories = 1
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS FAIL: user A can modify user B calorie target'; end if;

  begin
    insert into public.rmr_estimates (
      user_id, rmr_kcal, source, algorithm_name, algorithm_version,
      input_snapshot, reported_or_measured_at, calculated_at
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      1200,
      'user_reported_dexa',
      null,
      null,
      null,
      '2026-01-15',
      now()
    );
    raise exception 'RLS FAIL: user A can insert RMR for user B';
  exception
    when others then
      if sqlerrm like 'RLS FAIL:%' then
        raise;
      end if;
  end;

  begin
    insert into public.tdee_estimates (
      user_id, tdee_kcal, source, wearable, wearable_calories_kcal,
      rmr_kcal_used, algorithm_name, algorithm_version, input_snapshot, calculated_at
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      2500,
      'whoop_daily_calories',
      'whoop',
      2500,
      null,
      null,
      null,
      '{"wearable":"whoop","wearableCaloriesKcal":2500,"rmrKcal":1782,"rmrSource":"user_reported_dexa","goalType":"muscle_gain"}'::jsonb,
      now()
    );
    raise exception 'RLS FAIL: user A can insert TDEE for user B';
  exception
    when others then
      if sqlerrm like 'RLS FAIL:%' then
        raise;
      end if;
  end;

  begin
    insert into public.calorie_targets (
      user_id, goal_id, tdee_estimate_id, tdee_kcal, body_weight_kg, body_weight_lb,
      pace, target_rate_per_week, target_lb_per_week, weekly_calorie_adjustment,
      daily_calorie_adjustment, target_calories, policy_name, policy_version, input_snapshot
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',
      2800,
      80,
      176.37,
      'recommended',
      0.0025,
      0.44,
      1540,
      220,
      3020,
      'weight-change-policy',
      'weight-change-policy-v1',
      '{"goalType":"muscle_gain","weightChangeDirection":"weight_gain","pace":"recommended","weightKg":80,"weightLb":176.37,"tdeeKcal":2800,"targetRatePerWeek":0.0025,"policyVersion":"weight-change-policy-v1"}'::jsonb
    );
    raise exception 'RLS FAIL: user A can insert calorie target for user B';
  exception
    when others then
      if sqlerrm like 'RLS FAIL:%' then
        raise;
      end if;
  end;

  begin
    insert into public.nutrition_targets (
      user_id, goal_id, estimated_maintenance_calories, target_calories, protein_g,
      fat_min_g, fat_max_g, carbohydrate_g, desired_rate_kg_per_week, algorithm_name,
      algorithm_version, input_snapshot, valid_from
    ) values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
      2800,
      3025,
      180,
      57,
      57,
      254,
      0.2,
      'nutrition-target',
      'macro-policy-v1',
      '{}'::jsonb,
      now()
    );
    raise exception 'RLS FAIL: user A can insert nutrition target for user B';
  exception
    when others then
      if sqlerrm like 'RLS FAIL:%' then
        raise;
      end if;
  end;
end $$;

rollback;
