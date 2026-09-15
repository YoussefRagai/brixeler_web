begin;

alter table public.users_profile
  alter column phone_verified set default false;

comment on column public.users_profile.phone_verified is
  'True only after the current phone number has been approved by the server-side verification provider. Existing verified profiles remain unchanged.';

commit;
