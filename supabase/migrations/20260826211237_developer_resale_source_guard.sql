begin;

create or replace function public.guard_developer_renewal_source()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  listing_agent_id uuid;
begin
  if new.requested_by_role <> 'developer' then
    return new;
  end if;

  select property.listed_by_agent_id
  into listing_agent_id
  from public.properties property
  where property.id = new.property_id;

  if listing_agent_id is not null then
    raise exception 'Agent-submitted resales are read-only for developers';
  end if;

  return new;
end;
$$;

drop trigger if exists property_renewal_requests_developer_source_guard
  on public.property_renewal_requests;
create trigger property_renewal_requests_developer_source_guard
before insert on public.property_renewal_requests
for each row execute function public.guard_developer_renewal_source();

commit;
