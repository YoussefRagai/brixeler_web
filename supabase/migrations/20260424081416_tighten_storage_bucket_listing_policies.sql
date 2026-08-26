drop policy if exists "cil-docs agents read/write" on storage.objects;
drop policy if exists "eoi-docs agents read/write" on storage.objects;
drop policy if exists "reservation-docs agents read/write" on storage.objects;
drop policy if exists "sales-claim-docs agents read/write" on storage.objects;
drop policy if exists "deal-docs-select" on storage.objects;
drop policy if exists "verification-docs-select" on storage.objects;
drop policy if exists "public-read-badge-icons" on storage.objects;
drop policy if exists "public-read-gift-icons" on storage.objects;
drop policy if exists "public-read-tier-icons" on storage.objects;

create policy "deal-docs-authenticated-select"
on storage.objects
for select
to authenticated
using ((bucket_id = 'deal-docs') and (owner = auth.uid()));

create policy "verification-docs-authenticated-select"
on storage.objects
for select
to authenticated
using ((bucket_id = 'verification-docs') and (owner = auth.uid()));
