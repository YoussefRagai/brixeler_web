begin;
insert into auth.users(id) values('a1000000-0000-4000-8000-000000000001'),('a1000000-0000-4000-8000-000000000002');
insert into public.users_profile(id,first_name_en,last_name_en,first_name_ar,last_name_ar,phone,referral_code,account_status,is_demo)
values('a1000000-0000-4000-8000-000000000001','Audit','Analytics','Audit','Analytics','+19990007771','AUDITANALYTICS1','active',false),
('a1000000-0000-4000-8000-000000000002','Audit','Demo','Audit','Demo','+19990007772','AUDITANALYTICS2','active',true);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$
declare events jsonb; result integer;
begin
  if public.get_app_analytics_consent() then raise exception 'Consent must default off'; end if;
  begin
    perform public.set_app_analytics_consent(true,'a1000000-0000-4000-8000-000000000002');
    raise exception 'Cross-account consent allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.ingest_app_usage_events('[]'::jsonb,'a1000000-0000-4000-8000-000000000002');
    raise exception 'Cross-account batch allowed';
  exception when insufficient_privilege then null; end;
  events := jsonb_build_array(jsonb_build_object('event_id','a2000000-0000-4000-8000-000000000001','session_id','a3000000-0000-4000-8000-000000000001','event_name','screen_view','screen','Properties','platform','ios','occurred_at',now()-interval '3 minutes'));
  if public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => events)<>0 then raise exception 'Collected without consent'; end if;
  perform public.set_app_analytics_consent(p_expected_user_id => auth.uid(), p_enabled => true);
  if public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => events)<>1 then raise exception 'Valid event rejected'; end if;
  if public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => events)<>0 then raise exception 'Retry duplicated event'; end if;
  begin
    perform public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => jsonb_build_array((events->0)||jsonb_build_object('email','private@example.test')));
    raise exception 'Unknown field accepted';
  exception when raise_exception then if sqlerrm='Unknown field accepted' then raise; end if; end;
  begin
    perform public.app_usage_summary(30,'all');
    raise exception 'Client could read aggregate';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.app_usage_events;
    raise exception 'Client could read raw events';
  exception when insufficient_privilege then null; end;
  perform public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => jsonb_build_array(jsonb_build_object('event_id','a2000000-0000-4000-8000-000000000002','session_id','a3000000-0000-4000-8000-000000000001','event_name','property_view','screen','Properties','platform','ios','occurred_at',now()-interval '2 minutes')));
  perform public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => jsonb_build_array(jsonb_build_object('event_id','a2000000-0000-4000-8000-000000000003','session_id','a3000000-0000-4000-8000-000000000001','event_name','contact_requested','screen','Properties','platform','ios','occurred_at',now()-interval '1 minute')));
end $$;
reset role;
do $$ declare summary jsonb; begin
  summary := public.app_usage_summary(7,'ios');
  if (summary->>'active_users')::integer<>1 or (summary->>'sessions')::integer<>1 or (summary->'funnel'->>'contact_sessions')::integer<>1 then raise exception 'Aggregation mismatch: %',summary; end if;
  if (public.app_usage_summary(7,'android')->>'events')::integer<>0 then raise exception 'Platform filter mismatch'; end if;
end $$;
set local role authenticated;
select public.set_app_analytics_consent(p_expected_user_id => auth.uid(), p_enabled => false);
reset role;
do $$ begin if exists(select 1 from public.app_usage_events where user_id='a1000000-0000-4000-8000-000000000001') then raise exception 'Opt-out did not erase events'; end if; end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select public.set_app_analytics_consent(p_expected_user_id => auth.uid(), p_enabled => true);
do $$ begin
  if public.ingest_app_usage_events(p_expected_user_id => auth.uid(), p_events => jsonb_build_array(jsonb_build_object('event_id',gen_random_uuid(),'session_id',gen_random_uuid(),'event_name','screen_view','screen','Properties','platform','ios','occurred_at',now())))<>0 then raise exception 'Demo telemetry collected'; end if;
end $$;
reset role;
rollback;
