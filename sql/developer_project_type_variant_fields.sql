-- Add category, price range, land range, and EOI launch fields for developer dashboard flows.

alter table if exists public.developer_projects
  add column if not exists eoi_value_apt numeric(18,2),
  add column if not exists eoi_value_villa numeric(18,2);

alter table if exists public.project_unit_types
  add column if not exists category text,
  add column if not exists max_price numeric(18,2);

alter table if exists public.project_unit_variants
  add column if not exists category text,
  add column if not exists label text,
  add column if not exists max_price numeric(18,2),
  add column if not exists land_area_min numeric(12,2),
  add column if not exists land_area_max numeric(12,2);

