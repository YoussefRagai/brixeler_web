alter table if exists public.project_unit_variants
  add column if not exists has_garden boolean,
  add column if not exists has_roof boolean,
  add column if not exists finishing_status text,
  add column if not exists delivery_date date,
  add column if not exists layout_options text[];
