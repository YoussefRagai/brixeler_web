-- Keep referral payout bands deterministic under concurrent admin edits.
-- The dashboard validates these rules for usability; the database remains the
-- final authority for every writer.

do $$
begin
  if to_regclass('public.referral_bonus_rules') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.referral_bonus_rules'::regclass
      and conname = 'referral_bonus_rules_min_nonnegative'
  ) then
    alter table public.referral_bonus_rules
      add constraint referral_bonus_rules_min_nonnegative
      check (min_referrals >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.referral_bonus_rules'::regclass
      and conname = 'referral_bonus_rules_valid_maximum'
  ) then
    alter table public.referral_bonus_rules
      add constraint referral_bonus_rules_valid_maximum
      check (max_referrals is null or max_referrals >= min_referrals);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.referral_bonus_rules'::regclass
      and conname = 'referral_bonus_rules_valid_bonus'
  ) then
    alter table public.referral_bonus_rules
      add constraint referral_bonus_rules_valid_bonus
      check (bonus_percentage >= 0 and bonus_percentage <= 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.referral_bonus_rules'::regclass
      and conname = 'referral_bonus_rules_valid_behavior'
  ) then
    alter table public.referral_bonus_rules
      add constraint referral_bonus_rules_valid_behavior
      check (behavior_requirement in ('none', 'verified', 'first_deal'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.referral_bonus_rules'::regclass
      and conname = 'referral_bonus_rules_no_overlapping_ranges'
  ) then
    alter table public.referral_bonus_rules
      add constraint referral_bonus_rules_no_overlapping_ranges
      exclude using gist (
        int8range(
          min_referrals::bigint,
          coalesce(max_referrals::bigint, 2147483647),
          '[]'
        ) with &&
      );
  end if;
end
$$;
