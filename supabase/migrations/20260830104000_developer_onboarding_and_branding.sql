begin;

-- Keep the first-login contract separate from the existing revision migration.
-- Slogan is optional brand copy; name, description, and logo remain the
-- completion boundary enforced by the portal action.
alter table public.developers
  add column if not exists slogan text;

alter table public.developer_profile_revisions
  add column if not exists slogan text;

alter table public.developers
  drop constraint if exists developers_slogan_length_check;
alter table public.developers
  add constraint developers_slogan_length_check
  check (slogan is null or char_length(slogan) <= 160);

alter table public.developer_profile_revisions
  drop constraint if exists developer_profile_revisions_slogan_length_check;
alter table public.developer_profile_revisions
  add constraint developer_profile_revisions_slogan_length_check
  check (slogan is null or char_length(slogan) <= 160);

-- Preserve the original five-argument service contract for existing callers,
-- while exposing an additive six-argument form that stores the optional
-- slogan in the same transaction as the submitted revision.
create or replace function public.submit_developer_profile_revision(
  p_developer_id uuid,
  p_account_id uuid,
  p_name text,
  p_description text,
  p_logo_url text,
  p_slogan text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
  revision_id uuid;
  normalized_slogan text := nullif(btrim(coalesce(p_slogan, '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if normalized_slogan is not null and char_length(normalized_slogan) > 160 then
    raise exception 'Developer slogan cannot exceed 160 characters';
  end if;
  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'A developer description is required to complete onboarding';
  end if;
  if nullif(btrim(coalesce(p_logo_url, '')), '') is null then
    raise exception 'A developer logo is required to complete onboarding';
  end if;

  result := public.submit_developer_profile_revision(
    p_developer_id,
    p_account_id,
    p_name,
    p_description,
    p_logo_url
  );
  revision_id := nullif(result->>'revision_id', '')::uuid;
  if revision_id is null then
    raise exception 'Profile revision was not created';
  end if;

  update public.developer_profile_revisions
  set slogan = normalized_slogan,
      updated_at = now()
  where id = revision_id;

  return result || jsonb_build_object('slogan', normalized_slogan);
end;
$$;

revoke all on function public.submit_developer_profile_revision(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_developer_profile_revision(uuid, uuid, text, text, text, text)
  to service_role;

-- The original approval RPC updates the public developer row before marking
-- the revision approved. This trigger adds slogan publication to that same
-- transaction without changing the phase migration's service-only function.
create or replace function public.sync_developer_profile_slogan()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.status = 'approved' and (
    old.status is distinct from new.status
    or old.slogan is distinct from new.slogan
  ) then
    update public.developers
    set slogan = new.slogan,
        updated_at = now()
    where id = new.developer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists developer_profile_revision_slogan_publication on public.developer_profile_revisions;
create trigger developer_profile_revision_slogan_publication
after update of status, slogan on public.developer_profile_revisions
for each row execute function public.sync_developer_profile_slogan();

revoke all on function public.sync_developer_profile_slogan() from public, anon, authenticated;
grant execute on function public.sync_developer_profile_slogan() to service_role;

commit;
