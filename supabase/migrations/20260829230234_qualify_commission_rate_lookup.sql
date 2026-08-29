begin;

create or replace function public.resolve_commission_rate(dev_name text, project_name text)
returns table(commission_rate numeric, platform_share numeric)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_developer uuid;
  target_project uuid;
  target_property uuid;
begin
  select developer.id
    into target_developer
    from public.developers as developer
   where lower(developer.name) = lower(dev_name)
   limit 1;

  if target_developer is null then
    return;
  end if;

  if project_name is not null and length(trim(project_name)) > 0 then
    select project.id
      into target_project
      from public.developer_projects as project
     where project.developer_id = target_developer
       and lower(project.name) = lower(project_name)
     limit 1;

    if target_project is null then
      select property.id
        into target_property
        from public.properties as property
       where property.developer_id = target_developer
         and lower(property.property_name) = lower(project_name)
       limit 1;
    end if;

    if target_project is not null then
      return query
        select rule.commission_rate, rule.platform_share
          from public.developer_commission_rules as rule
         where rule.developer_id = target_developer
           and rule.property_id = target_project
         limit 1;
    elsif target_property is not null then
      return query
        select rule.commission_rate, rule.platform_share
          from public.developer_commission_rules as rule
         where rule.developer_id = target_developer
           and rule.property_id = target_property
         limit 1;
    end if;
  end if;

  return query
    select rule.commission_rate, rule.platform_share
      from public.developer_commission_rules as rule
     where rule.developer_id = target_developer
       and rule.property_id is null
     limit 1;
end;
$$;

revoke all on function public.resolve_commission_rate(text, text) from public, anon, authenticated;
grant execute on function public.resolve_commission_rate(text, text) to service_role;

commit;
