-- Storage buckets for tier/badge icons
insert into storage.buckets (id, name, public)
values
  ('badge-icons', 'badge-icons', true),
  ('tier-icons', 'tier-icons', true)
on conflict (id) do update
  set public = excluded.public;

-- Public read access for icon buckets (safe if already exists)
drop policy if exists "public-read-badge-icons" on storage.objects;
create policy "public-read-badge-icons"
  on storage.objects
  for select
  using (bucket_id = 'badge-icons');

drop policy if exists "public-read-tier-icons" on storage.objects;
create policy "public-read-tier-icons"
  on storage.objects
  for select
  using (bucket_id = 'tier-icons');
