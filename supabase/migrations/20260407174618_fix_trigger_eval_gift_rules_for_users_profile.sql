create or replace function public.trigger_eval_gift_rules()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  new_agent_id uuid;
  old_agent_id uuid;
begin
  if tg_table_name = 'users_profile' then
    new_agent_id := new.id;
    if tg_op = 'UPDATE' then
      old_agent_id := old.id;
    end if;
  else
    new_agent_id := nullif(to_jsonb(new)->>'agent_id', '')::uuid;
    if tg_op = 'UPDATE' then
      old_agent_id := nullif(to_jsonb(old)->>'agent_id', '')::uuid;
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') and new_agent_id is not null then
    perform public.evaluate_gift_rules_for_agent(new_agent_id);
  end if;

  if tg_op = 'UPDATE' and old_agent_id is not null and old_agent_id <> new_agent_id then
    perform public.evaluate_gift_rules_for_agent(old_agent_id);
  end if;

  return new;
end;
$function$;
