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
    ('admin_reply_to_support_ticket')
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
end;
$$;

rollback;
