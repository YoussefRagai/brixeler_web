begin;

create or replace function public.reset_phone_verification_on_change()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified := false;
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists users_profile_reset_phone_verification on public.users_profile;
create trigger users_profile_reset_phone_verification
before update of phone on public.users_profile
for each row execute function public.reset_phone_verification_on_change();

commit;
