begin;

do $$
declare
  missing_functions text[];
begin
  select array_agg(expected.name)
  into missing_functions
  from (values
    ('create_support_ticket_with_message'),
    ('create_developer_contact_request_with_notification'),
    ('update_developer_contact_request_with_notification'),
    ('admin_reply_to_support_ticket'),
    ('create_developer_account_invite'),
    ('activate_developer_account_invite'),
    ('record_developer_account_login'),
    ('revoke_developer_account'),
    ('cleanup_demo_developer_invites'),
    ('submit_developer_profile_revision'),
    ('review_developer_profile_revision')
  ) as expected(name)
  where not exists (
    select 1
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.proname = expected.name
  );

  if missing_functions is not null then
    raise exception 'Missing reliability functions: %', missing_functions;
  end if;

  if has_function_privilege('authenticated', 'public.create_developer_contact_request_with_notification(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,text,text,text)', 'execute') then
    raise exception 'Authenticated role must not execute the service contact-request transaction';
  end if;

  if not has_function_privilege('authenticated', 'public.create_support_ticket_with_message(text,text,text,text)', 'execute') then
    raise exception 'Authenticated role must execute atomic support creation';
  end if;
  if has_function_privilege('authenticated', 'public.create_developer_account_invite(uuid,text,text,text,boolean,uuid,text,uuid,text,boolean,text)', 'execute') then
    raise exception 'Authenticated role must not execute the developer invite transaction';
  end if;
  if not has_function_privilege('service_role', 'public.create_developer_account_invite(uuid,text,text,text,boolean,uuid,text,uuid,text,boolean,text)', 'execute') then
    raise exception 'Service role must execute the developer invite transaction';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'developers'
      and column_name in ('is_demo', 'demo_batch')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Developer demo columns are missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'developer_accounts'
      and column_name in ('is_demo', 'demo_batch', 'invite_request_id')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'Developer account invitation columns are missing';
  end if;

  if has_function_privilege('authenticated', 'public.submit_developer_profile_revision(uuid,uuid,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.review_developer_profile_revision(uuid,uuid,text,text)', 'execute') then
    raise exception 'Authenticated role must not execute developer profile workflow functions';
  end if;
  if not has_function_privilege('service_role', 'public.submit_developer_profile_revision(uuid,uuid,text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.review_developer_profile_revision(uuid,uuid,text,text)', 'execute') then
    raise exception 'Service role must execute developer profile workflow functions';
  end if;
  if has_table_privilege('authenticated', 'public.developer_accounts', 'update') then
    raise exception 'Developer memberships must not be directly updateable by authenticated users';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'developer_accounts'
      and policyname = 'developer_accounts_update_own'
  ) then
    raise exception 'Unsafe developer membership self-update policy still exists';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'developer_profile_revisions'
      and column_name in ('developer_id', 'version', 'status', 'submitted_by_account_id', 'reviewed_by_admin_id', 'published_at')
    group by table_schema, table_name
    having count(*) = 6
  ) then
    raise exception 'Developer profile revision contract is incomplete';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('project_unit_types', 'project_unit_variants')
      and column_name in ('archived_at', 'archived_by_account_id')
    group by table_schema
    having count(*) = 4
  ) then
    raise exception 'Recoverable project inventory archive columns are missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties'
      and column_name in ('archived_at', 'archived_by_developer_account_id')
    group by table_schema, table_name
    having count(*) = 2
  ) then
    raise exception 'Recoverable developer listing archive columns are missing';
  end if;
end;
$$;

rollback;
