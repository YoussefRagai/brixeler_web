-- Storage bucket for gift icons
insert into storage.buckets (id, name, public)
values
  ('gift-icons', 'gift-icons', true)
on conflict (id) do update
  set public = excluded.public;

drop policy if exists "public-read-gift-icons" on storage.objects;
create policy "public-read-gift-icons"
  on storage.objects
  for select
  using (bucket_id = 'gift-icons');
