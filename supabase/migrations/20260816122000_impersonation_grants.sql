begin;

create table if not exists public.developer_impersonation_grants (
  token_hash text primary key,
  admin_id uuid not null,
  admin_auth_user_id uuid not null,
  admin_email text,
  admin_name text,
  developer_id uuid not null,
  developer_name text,
  impersonated_user_id uuid not null,
  impersonated_account_id uuid not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  return_to text,
  created_at timestamptz not null default now()
);
alter table public.developer_impersonation_grants enable row level security;
alter table public.developer_impersonation_grants force row level security;
revoke all on table public.developer_impersonation_grants from public, anon, authenticated;

commit;
