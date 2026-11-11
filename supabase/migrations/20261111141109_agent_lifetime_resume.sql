-- Agent-owned lifetime resumes. Brixeler verified entries are derived from
-- paid, non-demo Sales Claims; agents cannot insert or edit a verified entry.
-- Freeze the source details once a Sales Claim is paid. Otherwise its owner
-- could edit the claim after approval and still receive the Verified label.
create or replace function public.guard_paid_sales_claim_resume_details()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.stage = 'SalesClaim' and old.status = 'Paid' and (
    new.agent_id is distinct from old.agent_id or
    new.stage is distinct from old.stage or
    new.status is distinct from old.status or
    new.property_name is distinct from old.property_name or
    new.developer_name is distinct from old.developer_name or
    new.payload is distinct from old.payload or
    new.payment_approved_at is distinct from old.payment_approved_at
  ) then
    raise exception 'Paid Sales Claim resume details cannot be changed';
  end if;
  return new;
end;
$$;
create trigger deal_stage_entries_paid_resume_details_guard
before update on public.deal_stage_entries
for each row execute function public.guard_paid_sales_claim_resume_details();
revoke all on function public.guard_paid_sales_claim_resume_details() from public, anon, authenticated;

create table if not exists public.agent_resume_external_deals (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.users_profile(id) on delete cascade,
  developer_name text not null check (char_length(btrim(developer_name)) between 1 and 160),
  compound_name text not null check (char_length(btrim(compound_name)) between 1 and 160),
  client_name text not null check (char_length(btrim(client_name)) between 1 and 160),
  unit_type text not null check (char_length(btrim(unit_type)) between 1 and 100),
  bua_sqm numeric(12,2) not null check (bua_sqm > 0 and bua_sqm <= 1000000),
  unit_price numeric(16,2) not null check (unit_price > 0 and unit_price <= 1000000000000),
  transaction_date date not null check (transaction_date <= current_date),
  document_path text check (document_path is null or (char_length(document_path) <= 500 and document_path !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_resume_document_owner check (document_path is null or split_part(document_path, '/', 1) = agent_id::text)
);
create index if not exists agent_resume_external_deals_owner_date_idx
  on public.agent_resume_external_deals(agent_id, transaction_date desc);
alter table public.agent_resume_external_deals enable row level security;
alter table public.agent_resume_external_deals force row level security;
revoke all on public.agent_resume_external_deals from public, anon;
grant select, insert, update, delete on public.agent_resume_external_deals to authenticated;
create policy agent_resume_external_owner_select on public.agent_resume_external_deals
  for select to authenticated using (agent_id = (select auth.uid()));
create policy agent_resume_external_owner_insert on public.agent_resume_external_deals
  for insert to authenticated with check (agent_id = (select auth.uid()));
create policy agent_resume_external_owner_update on public.agent_resume_external_deals
  for update to authenticated using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));
create policy agent_resume_external_owner_delete on public.agent_resume_external_deals
  for delete to authenticated using (agent_id = (select auth.uid()));

create table if not exists public.agent_resume_shares (
  agent_id uuid primary key references public.users_profile(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
alter table public.agent_resume_shares enable row level security;
alter table public.agent_resume_shares force row level security;
revoke all on public.agent_resume_shares from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('agent-resume-docs', 'agent-resume-docs', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;
create policy agent_resume_docs_owner_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'agent-resume-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy agent_resume_docs_owner_select on storage.objects
  for select to authenticated using (bucket_id = 'agent-resume-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy agent_resume_docs_owner_delete on storage.objects
  for delete to authenticated using (bucket_id = 'agent-resume-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.my_agent_resume_share(p_rotate boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare actor uuid := auth.uid(); result uuid;
begin
  if actor is null or not exists (select 1 from public.users_profile where id = actor and account_status = 'active') then
    raise exception 'Active agent required' using errcode = '42501';
  end if;
  insert into public.agent_resume_shares(agent_id) values (actor)
    on conflict (agent_id) do nothing;
  if p_rotate then
    update public.agent_resume_shares set token = gen_random_uuid(), rotated_at = now()
      where agent_id = actor returning token into result;
  else
    select token into result from public.agent_resume_shares where agent_id = actor;
  end if;
  return result;
end;
$$;

create or replace function public.get_my_agent_resume()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'agentName', coalesce(nullif(profile.display_name, ''), profile.first_name_en || ' ' || profile.last_name_en),
    'deals', coalesce((
      select jsonb_agg(deal order by deal->>'transactionDate' desc) from (
        select jsonb_build_object('id', external.id, 'source', 'external', 'verified', false,
          'developerName', external.developer_name, 'compoundName', external.compound_name,
          'clientName', external.client_name, 'unitType', external.unit_type,
          'buaSqm', external.bua_sqm, 'unitPrice', external.unit_price,
          'transactionDate', external.transaction_date, 'documentPath', external.document_path) as deal
        from public.agent_resume_external_deals external where external.agent_id = profile.id
        union all
        select jsonb_build_object('id', claim.id, 'source', 'brixeler', 'verified', true,
          'developerName', coalesce(claim.developer_name, claim.payload->>'developer', ''),
          'compoundName', claim.property_name, 'clientName', claim.payload->>'clientName',
          'unitType', coalesce(claim.payload->>'unitType', claim.payload->>'unitCode', ''),
          'buaSqm', nullif(claim.payload->>'bua', ''),
          'unitPrice', nullif(claim.payload->>'saleAmount', ''),
          'transactionDate', claim.payment_approved_at::date, 'documentPath', claim.sales_claim_document) as deal
        from public.deal_stage_entries claim
        where claim.agent_id = profile.id and claim.stage = 'SalesClaim'
          and claim.status = 'Paid' and claim.payment_approved_at is not null
          and coalesce(claim.is_demo, false) = false
      ) entries
    ), '[]'::jsonb)
  )
  from public.users_profile profile where profile.id = auth.uid() and profile.account_status = 'active';
$$;

create or replace function public.get_shared_agent_resume(p_token uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not exists (
    select 1 from public.users_profile viewer
    where viewer.id = auth.uid() and viewer.account_status = 'active'
  ) then null else jsonb_build_object(
    'agentName', coalesce(nullif(profile.display_name, ''), profile.first_name_en || ' ' || profile.last_name_en),
    'deals', coalesce((
      select jsonb_agg(deal order by deal->>'transactionDate' desc) from (
        select jsonb_build_object('id', external.id, 'source', 'external', 'verified', false,
          'developerName', external.developer_name, 'compoundName', external.compound_name,
          'unitType', external.unit_type, 'buaSqm', external.bua_sqm,
          'unitPrice', external.unit_price, 'transactionDate', external.transaction_date) as deal
        from public.agent_resume_external_deals external where external.agent_id = profile.id
        union all
        select jsonb_build_object('id', claim.id, 'source', 'brixeler', 'verified', true,
          'developerName', coalesce(claim.developer_name, claim.payload->>'developer', ''),
          'compoundName', claim.property_name,
          'unitType', coalesce(claim.payload->>'unitType', claim.payload->>'unitCode', ''),
          'buaSqm', nullif(claim.payload->>'bua', ''),
          'unitPrice', nullif(claim.payload->>'saleAmount', ''),
          'transactionDate', claim.payment_approved_at::date) as deal
        from public.deal_stage_entries claim
        where claim.agent_id = profile.id and claim.stage = 'SalesClaim'
          and claim.status = 'Paid' and claim.payment_approved_at is not null
          and coalesce(claim.is_demo, false) = false
      ) entries
    ), '[]'::jsonb)
  ) end
  from public.agent_resume_shares share
  join public.users_profile profile on profile.id = share.agent_id and profile.account_status = 'active'
  where share.token = p_token;
$$;

revoke all on function public.my_agent_resume_share(boolean), public.get_my_agent_resume(), public.get_shared_agent_resume(uuid) from public, anon, authenticated;
grant execute on function public.my_agent_resume_share(boolean), public.get_my_agent_resume(), public.get_shared_agent_resume(uuid) to authenticated;
