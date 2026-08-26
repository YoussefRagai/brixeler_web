alter table public.users_profile
  add column if not exists phone_verified boolean not null default true,
  add column if not exists phone_verified_at timestamptz;

update public.users_profile
set phone_verified = true,
    phone_verified_at = coalesce(phone_verified_at, now())
where phone_verified is distinct from true;
