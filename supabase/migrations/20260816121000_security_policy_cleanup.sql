begin;

-- Remove legacy verification-docs policies that allowed arbitrary authenticated
-- paths or owner-based access in addition to the user-folder boundary.
drop policy if exists "verification-docs-insert" on storage.objects;
drop policy if exists "verification-docs-update" on storage.objects;
drop policy if exists "verification-docs-delete" on storage.objects;
drop policy if exists "verification-docs-authenticated-select" on storage.objects;

-- Commission lookup is server-side only; it is not a client authorization API.
revoke all on function public.resolve_commission_rate(text, text) from public, anon, authenticated;
grant execute on function public.resolve_commission_rate(text, text) to service_role;

commit;
