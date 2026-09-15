-- Disposable database only. Fixtures and evaluator tripwires all roll back.
begin;
insert into auth.users(id,email) values
 ('96000000-0000-4000-8000-000000000001','demo-maintenance@example.invalid');
insert into public.users_profile(id,first_name_en,last_name_en,first_name_ar,last_name_ar,phone,referral_code)
values ('96000000-0000-4000-8000-000000000001','Demo','Maintenance','Demo','Maintenance','+201096000001','DEMO960001');
insert into public.demo_data_batches(batch_key,label) values ('demo-maintenance-contract','Maintenance contract');
insert into public.developers(id,name) values ('96000000-0000-4000-8000-000000000002','Maintenance company');
insert into public.developer_accounts(id,developer_id,auth_user_id,email,full_name,role,status)
values ('96000000-0000-4000-8000-000000000003','96000000-0000-4000-8000-000000000002',
 '96000000-0000-4000-8000-000000000001','demo-maintenance@example.invalid','Maintenance','developer_super_admin','active');
insert into public.properties(id,property_name,property_type,unit_area,price,description,photos,listed_by_agent_id,developer_id)
values ('96000000-0000-4000-8000-000000000004','Maintenance','apartment',100,1000000,'Maintenance',array[]::text[],
 '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002');
-- Real agent-only submission and price edit must work with all triggers active.
insert into public.properties(id,property_name,property_type,unit_area,price,description,photos,listed_by_agent_id)
values ('97000000-0000-4000-8000-000000000004','Agent-only maintenance','apartment',100,1000000,'Maintenance',array[]::text[],
 '96000000-0000-4000-8000-000000000001');
update public.properties set price=1100000 where id='97000000-0000-4000-8000-000000000004';
update public.properties set price=1100000 where id='96000000-0000-4000-8000-000000000004';
insert into public.deals(id,agent_id,property_name,developer_name,client_name,sale_amount,unit_code,deal_sheet_photos,commission_rate,base_rate,estimated_commission)
values ('96000000-0000-4000-8000-000000000005','96000000-0000-4000-8000-000000000001',
 'Maintenance','Maintenance','Maintenance',1000000,'M1',array[]::text[],1,1,10000);
insert into public.deal_stage_entries(id,agent_id,stage,property_name)
values ('96000000-0000-4000-8000-000000000006','96000000-0000-4000-8000-000000000001','SalesClaim','Maintenance');

insert into public.badges(id,name,icon_url,badge_type,unlock_criteria)
values ('96000000-0000-4000-8000-000000000007','Verified maintenance sentinel','https://example.invalid/badge.png','special','{}');
insert into public.agent_badges(agent_id,badge_id,expires_at)
values ('96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000007',now()-interval '1 day');
insert into public.gift_eligibilities(agent_id,expires_at)
values ('96000000-0000-4000-8000-000000000001',now()-interval '1 day');

-- A tripwire is stricter than counts: any evaluator invocation fails even if
-- the current fixture happens to have no eligible/expired reward rows.
create or replace function public.evaluate_admin_rules_for_agent(p_agent_id uuid)
returns void language plpgsql set search_path=public,extensions as $$
begin raise exception 'admin reward evaluator invoked'; end;
$$;
create or replace function public.evaluate_gift_rules_for_agent(p_agent_id uuid)
returns void language plpgsql set search_path=public,extensions as $$
begin raise exception 'gift reward evaluator invoked'; end;
$$;

-- A JWT claim alone is insufficient: the actual database role is required.
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare target text;
begin
  foreach target in array array['properties','deals','deal_stage_entries','developer_accounts'] loop
    begin
      execute format('update public.%I set is_demo=true,demo_batch=%L where id::text like %L',
        target,'demo-maintenance-contract','96000000-0000-4000-8000-%');
      raise exception 'Unauthorized demo update accepted';
    exception when raise_exception then
      if sqlerrm <> 'Demo metadata requires service-role flag-only maintenance' then raise; end if;
    end;
  end loop;
end;
$$;
set local role authenticated;
do $$
begin
  begin
    update public.developer_accounts set is_demo=true,demo_batch='demo-maintenance-contract'
    where id='96000000-0000-4000-8000-000000000003';
    raise exception 'Authenticated membership update accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role service_role;
do $$
declare target text; before_row jsonb; after_row jsonb; reward_snapshot jsonb;
begin
  select jsonb_build_object('catalog',(select jsonb_agg(to_jsonb(b)) from public.badges b),
    'badges',(select jsonb_agg(to_jsonb(b)) from public.agent_badges b),
    'gifts',(select jsonb_agg(to_jsonb(g)) from public.gift_eligibilities g)) into reward_snapshot;
  foreach target in array array['properties','deals','deal_stage_entries','developer_accounts'] loop
    execute format('select to_jsonb(t) from public.%I t where id::text like %L',target,'96000000-0000-4000-8000-%') into strict before_row;
    execute format('update public.%I set is_demo=true,demo_batch=%L where id=%L returning to_jsonb(%I)',
      target,'demo-maintenance-contract',before_row->>'id',target) into strict after_row;
    if before_row - array['is_demo','demo_batch','updated_at'] <> after_row - array['is_demo','demo_batch','updated_at'] then
      raise exception 'Business fields changed on %',target;
    end if;
    -- Recovery also avoids evaluations and preserves membership identity/role.
    execute format('update public.%I set is_demo=false,demo_batch=null where id=%L',target,before_row->>'id');
  end loop;
  update public.properties set is_demo=true,demo_batch='demo-maintenance-contract'
  where id='97000000-0000-4000-8000-000000000004';
  update public.properties set is_demo=false,demo_batch=null
  where id='97000000-0000-4000-8000-000000000004';
  if (select count(*) from public.developer_inventory_versions
    where entity_id='97000000-0000-4000-8000-000000000004') <> 0 then
    raise exception 'Agent-only inventory received company history';
  end if;
  if (select count(*) from public.developer_inventory_versions
    where entity_id='96000000-0000-4000-8000-000000000004') <> 4 then
    raise exception 'Developer inventory history was not preserved';
  end if;
  if exists (select 1 from public.developer_property_price_history
    where property_id='97000000-0000-4000-8000-000000000004') then
    raise exception 'Agent-only inventory received company price history';
  end if;
  if (select count(*) from public.developer_property_price_history
    where property_id='96000000-0000-4000-8000-000000000004') <> 2
    or (select count(*) from public.developer_property_price_history
      where property_id='96000000-0000-4000-8000-000000000004' and effective_to is null) <> 1 then
    raise exception 'Developer price history initial/update intervals were not preserved';
  end if;
  if reward_snapshot is distinct from jsonb_build_object(
    'catalog',(select jsonb_agg(to_jsonb(b)) from public.badges b),
    'badges',(select jsonb_agg(to_jsonb(b)) from public.agent_badges b),
    'gifts',(select jsonb_agg(to_jsonb(g)) from public.gift_eligibilities g)) then
    raise exception 'Classification modified rewards';
  end if;
  begin
    update public.developer_accounts set is_demo=true,demo_batch='demo-maintenance-contract',role='sales_manager'
    where id='96000000-0000-4000-8000-000000000003';
    raise exception 'Mixed role/demo mutation accepted';
  exception when raise_exception then
    if sqlerrm <> 'Demo metadata requires service-role flag-only maintenance' then raise; end if;
  end;
  begin
    update public.developer_accounts set role='sales_manager' where id='96000000-0000-4000-8000-000000000003';
    raise exception 'Final administrator demotion accepted';
  exception when raise_exception then
    if sqlerrm <> 'Cannot remove or demote the final active developer super admin' then raise; end if;
  end;
  -- Actual business updates still invoke the admin evaluator for each source.
  foreach target in array array['properties','deals','deal_stage_entries'] loop
    begin
      execute format('update public.%I set property_name=%L where id::text like %L',target,'Changed','96000000-0000-4000-8000-%');
      raise exception 'Business update skipped evaluation';
    exception when raise_exception then
      if sqlerrm <> 'admin reward evaluator invoked' then raise; end if;
    end;
  end loop;
  begin
    update public.properties set price=1200000 where id='97000000-0000-4000-8000-000000000004';
    raise exception 'Agent-only price update skipped admin evaluation';
  exception when raise_exception then
    if sqlerrm <> 'admin reward evaluator invoked' then raise; end if;
  end;
end;
$$;
reset role;
-- Reach the second evaluator independently; all replacements roll back.
create or replace function public.evaluate_admin_rules_for_agent(p_agent_id uuid)
returns void language plpgsql set search_path=public,extensions as $$ begin return; end; $$;
set local role service_role;
do $$
declare target text;
begin
  foreach target in array array['properties','deals','deal_stage_entries'] loop
    begin
      execute format('update public.%I set property_name=%L where id::text like %L',target,'Changed','96000000-0000-4000-8000-%');
      raise exception 'Business update skipped gift evaluation';
    exception when raise_exception then
      if sqlerrm <> 'gift reward evaluator invoked' then raise; end if;
    end;
  end loop;
  begin
    update public.properties set price=1200000 where id='97000000-0000-4000-8000-000000000004';
    raise exception 'Agent-only price update skipped gift evaluation';
  exception when raise_exception then
    if sqlerrm <> 'gift reward evaluator invoked' then raise; end if;
  end;
end;
$$;
rollback;
