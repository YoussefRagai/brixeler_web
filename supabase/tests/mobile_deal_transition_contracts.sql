begin;

insert into auth.users(id) values ('97000000-0000-0000-0000-000000000001'), ('97000000-0000-0000-0000-000000000002');
insert into public.users_profile(id, first_name_en, last_name_en, first_name_ar, last_name_ar, phone, referral_code, account_status)
values
 ('97000000-0000-0000-0000-000000000001', 'Mobile', 'Test', 'Mobile', 'Test', '+201097000001', 'MOB970001', 'active'),
 ('97000000-0000-0000-0000-000000000002', 'Other', 'Test', 'Other', 'Test', '+201097000002', 'MOB970002', 'active');
insert into public.deal_stage_entries(id, agent_id, stage, property_name) values
 ('97000000-0000-0000-0000-000000000011', '97000000-0000-0000-0000-000000000001', 'CIL', 'Transition'),
 ('97000000-0000-0000-0000-000000000012', '97000000-0000-0000-0000-000000000002', 'CIL', 'Other tenant'),
 ('97000000-0000-0000-0000-000000000013', '97000000-0000-0000-0000-000000000001', 'CIL', 'Rollback');

-- Inject failure specifically into the second write after destination insertion.
create function public.mobile_transition_test_failure() returns trigger language plpgsql as $$
begin
 if old.property_name = 'Rollback' then raise exception 'injected source update failure'; end if;
 return new;
end;
$$;
create trigger mobile_transition_test_failure before update on public.deal_stage_entries
 for each row execute function public.mobile_transition_test_failure();

set local role authenticated;
select set_config('request.jwt.claim.sub', '97000000-0000-0000-0000-000000000001', true);
do $$
declare
 payload jsonb := '{"propertyName":"Transition","developer":"Developer","attachments":["agent/document.pdf"],"paymentMethod":"bank_transfer","agent_id":"97000000-0000-0000-0000-000000000002"}';
 first_id uuid;
 retry_id uuid;
 rejected boolean;
begin
 select id into first_id from public.transition_mobile_deal('97000000-0000-0000-0000-000000000011', 'Reservation', payload);
 if (select status from public.deal_stage_entries where id = '97000000-0000-0000-0000-000000000011') <> 'Moved to Reservation' then
   raise exception 'Source did not move';
 end if;
 if (select agent_id from public.deal_stage_entries where id = first_id) <> auth.uid() then
   raise exception 'Client actor was trusted';
 end if;
 select id into retry_id from public.transition_mobile_deal('97000000-0000-0000-0000-000000000011', 'Reservation', payload);
 if first_id <> retry_id or (select count(*) from public.deal_stage_entries where source_entry_id = '97000000-0000-0000-0000-000000000011') <> 1 then
   raise exception 'Retry duplicated transition';
 end if;
 rejected := false;
 begin
   perform public.transition_mobile_deal('97000000-0000-0000-0000-000000000012', 'Reservation', payload);
 exception when insufficient_privilege then rejected := true;
 end;
 if not rejected then raise exception 'Other agent transition allowed'; end if;
 rejected := false;
 begin
   perform public.transition_mobile_deal('97000000-0000-0000-0000-000000000011', 'CIL', payload);
 exception when raise_exception then rejected := true;
 end;
 if not rejected then raise exception 'Backward stage allowed'; end if;
 rejected := false;
 begin
   perform public.transition_mobile_deal('97000000-0000-0000-0000-000000000011', 'SalesClaim', payload);
 exception when raise_exception then rejected := true;
 end;
 if not rejected then raise exception 'Already moved source reused'; end if;
 rejected := false;
 begin
   perform public.transition_mobile_deal('97000000-0000-0000-0000-000000000013', 'EOI', payload);
 exception when raise_exception then
   if sqlerrm <> 'injected source update failure' then raise; end if;
   rejected := true;
 end;
 if not rejected then raise exception 'Failure injection did not run'; end if;
 if exists(select 1 from public.deal_stage_entries where source_entry_id = '97000000-0000-0000-0000-000000000013')
   or (select status from public.deal_stage_entries where id = '97000000-0000-0000-0000-000000000013') <> 'Submitted' then
   raise exception 'Failed transition partially persisted';
 end if;
end;
$$;
reset role;
do $$
begin
 if has_function_privilege('anon', 'public.transition_mobile_deal(uuid,text,jsonb)', 'EXECUTE') then
   raise exception 'Anonymous execution enabled';
 end if;
 if has_table_privilege('authenticated', 'public.mobile_deal_transition_receipts', 'INSERT') then
   raise exception 'Client can forge transition receipts';
 end if;
end;
$$;
rollback;
