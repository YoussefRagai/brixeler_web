begin;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('44444444-4444-4444-8444-444444444444');
insert into public.users_profile (id, first_name_en, last_name_en, first_name_ar, last_name_ar, phone, referral_code) values
  ('11111111-1111-4111-8111-111111111111', 'Resume', 'Owner', 'Resume', 'Owner', '+201000000001', 'RESUMEQA1'),
  ('22222222-2222-4222-8222-222222222222', 'Resume', 'Viewer', 'Resume', 'Viewer', '+201000000002', 'RESUMEQA2');
insert into public.admins (id) values ('44444444-4444-4444-8444-444444444444');
insert into public.deal_stage_entries (id, agent_id, stage, property_name, developer_name, status, payload)
values ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
        'SalesClaim', 'Approved Compound', 'Approved Developer', 'Submitted', '{"saleAmount":"1000000"}');
select set_config('brixeler.sales_claim_transition', '1', true);
update public.deal_stage_entries set status = 'Paid', payment_approved_at = now(),
  payment_approved_by = '44444444-4444-4444-8444-444444444444'
where id = '33333333-3333-4333-8333-333333333333';
select set_config('brixeler.sales_claim_transition', '0', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.agent_resume_external_deals
  (agent_id, developer_name, compound_name, client_name, unit_type, bua_sqm, unit_price, transaction_date, document_path)
values
  ('11111111-1111-4111-8111-111111111111', 'Developer', 'Compound', 'Private Client', 'Apartment', 100, 1000000, '2026-01-01', '11111111-1111-4111-8111-111111111111/proof.pdf');
do $$ begin
  begin
    update public.deal_stage_entries set property_name = 'Altered Compound'
      where id = '33333333-3333-4333-8333-333333333333';
    raise exception 'Paid claim details remained editable';
  exception when raise_exception then
    if sqlerrm not like 'Paid Sales Claim resume details cannot be changed%' then raise; end if;
  end;
end $$;

do $$ begin
  if not exists (select 1 from jsonb_array_elements(public.get_my_agent_resume()->'deals') deal
                 where deal->>'source' = 'external' and deal->>'clientName' = 'Private Client') then
    raise exception 'Owner resume lost private client name';
  end if;
end $$;
select set_config('resume.share_token', public.my_agent_resume_share()::text, true);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$
declare shared jsonb := public.get_shared_agent_resume(current_setting('resume.share_token')::uuid);
begin
  if (select count(*) from public.agent_resume_external_deals) <> 0 then
    raise exception 'RLS exposed another agent''s deal';
  end if;
  if not exists (select 1 from jsonb_array_elements(shared->'deals') deal
                 where deal->>'source' = 'external' and deal->>'verified' = 'false') then
    raise exception 'External deal provenance changed';
  end if;
  if shared::text like '%Private Client%' or shared::text like '%proof.pdf%' then
    raise exception 'Shared resume leaked client or document';
  end if;
  begin
    insert into public.agent_resume_external_deals
      (agent_id, developer_name, compound_name, client_name, unit_type, bua_sqm, unit_price, transaction_date)
    values ('11111111-1111-4111-8111-111111111111', 'Other', 'Other', 'Other', 'Apartment', 90, 900000, '2026-01-01');
    raise exception 'Viewer inserted a deal for another agent';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  if has_function_privilege('anon', 'public.get_shared_agent_resume(uuid)', 'EXECUTE') then
    raise exception 'Anonymous role can call shared resume RPC';
  end if;
end $$;

update public.users_profile set account_status = 'suspended'
where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ begin
  if public.get_shared_agent_resume(current_setting('resume.share_token')::uuid) is not null then
    raise exception 'Suspended viewer can read shared resume';
  end if;
end $$;
reset role;

rollback;
