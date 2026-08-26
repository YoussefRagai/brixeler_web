alter table public.developer_projects
  add column if not exists location text,
  add column if not exists acres numeric,
  add column if not exists footprint numeric,
  add column if not exists maintenance numeric,
  add column if not exists payment_plans text,
  add column if not exists ch_fees numeric,
  add column if not exists project_types text[] not null default '{}',
  add column if not exists inventory_url text;

alter table public.project_unit_types
  add column if not exists land_area_min numeric,
  add column if not exists land_area_max numeric;
