alter table public.tiers
  add column if not exists benefit_type text not null default 'none',
  add column if not exists benefit_value numeric null,
  add column if not exists benefit_description text null;

alter table public.tiers
  drop constraint if exists tiers_benefit_type_check;

alter table public.tiers
  add constraint tiers_benefit_type_check
  check (benefit_type in ('none', 'commission_boost', 'priority_support', 'custom'));
