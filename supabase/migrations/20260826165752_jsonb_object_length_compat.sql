begin;

-- PostgreSQL exposes jsonb_array_length but not an object-count helper on this
-- project version. Receipt processing uses this stable public helper.
create or replace function public.jsonb_object_length(p_value jsonb)
returns integer
language sql
immutable
strict
set search_path = public, extensions
as $$
  select count(*)::integer from jsonb_object_keys(p_value);
$$;

revoke all on function public.jsonb_object_length(jsonb) from public, anon, authenticated;
grant execute on function public.jsonb_object_length(jsonb) to service_role;

commit;
