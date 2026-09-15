-- Developer support stays tenant-owned; both portals share the same conversation.
alter table public.developer_support_tickets add column if not exists unread_for_admin boolean not null default true;
alter table public.developer_support_tickets add column if not exists unread_for_developer boolean not null default false;
alter table public.developer_support_messages add column if not exists author_admin_id uuid references public.admins(id) on delete set null;

create or replace function public.developer_support_conversation_action(
  p_ticket_id uuid, p_developer_id uuid, p_actor_id uuid, p_is_admin boolean,
  p_action text, p_body text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare ticket public.developer_support_tickets; admin public.admins; actor_roles public.admin_role[];
begin
  if p_is_admin is null then raise exception 'Actor required'; end if;
  if p_is_admin then
    select * into admin from public.admins where id = p_actor_id and is_active = true;
    actor_roles := case when cardinality(admin.roles) > 0 then admin.roles else array[admin.role] end;
    if not found or not coalesce(actor_roles && array['super_admin','user_support_admin','developers_admin']::public.admin_role[],false) then raise exception 'Support access denied'; end if;
    if not ('super_admin'::public.admin_role = any(actor_roles)) and jsonb_typeof(admin.permissions->'developer_ids') = 'array' and not ((admin.permissions->'developer_ids') ? p_developer_id::text) then raise exception 'Tenant access denied'; end if;
  elsif not exists(select 1 from public.developer_accounts where id = p_actor_id and developer_id = p_developer_id and status = 'active') then
    raise exception 'Active developer membership required';
  end if;
  select * into ticket from public.developer_support_tickets where id = p_ticket_id and developer_id = p_developer_id for update;
  if not found then raise exception 'Ticket not found'; end if;
  if p_action = 'read' then
    update public.developer_support_tickets set unread_for_admin = case when p_is_admin then false else unread_for_admin end,
      unread_for_developer = case when not p_is_admin then false else unread_for_developer end where id = ticket.id;
  elsif p_action = 'reply' then
    if char_length(btrim(coalesce(p_body,''))) not between 1 and 20000 then raise exception 'Message required (maximum 20000 characters)'; end if;
    insert into public.developer_support_messages(developer_id,ticket_id,author_account_id,author_admin_id,author_type,body)
    values(p_developer_id,ticket.id,case when not p_is_admin then p_actor_id end,case when p_is_admin then p_actor_id end,case when p_is_admin then 'support' else 'developer' end,btrim(p_body));
    update public.developer_support_tickets set last_message_preview=left(btrim(p_body),240),last_message_at=now(),updated_at=now(),
      unread_for_admin=not p_is_admin,unread_for_developer=p_is_admin,status=case when p_is_admin then 'waiting_on_developer' else 'open' end,resolved_at=null where id=ticket.id;
    insert into public.developer_activity_events(developer_id,actor_account_id,event_type,entity_type,entity_id,summary,metadata)
    values(p_developer_id,case when not p_is_admin then p_actor_id end,'support.replied','support_ticket',ticket.id,'Support reply added',jsonb_build_object('author_type',case when p_is_admin then 'support' else 'developer' end,'admin_id',case when p_is_admin then p_actor_id end));
  else raise exception 'Invalid support action'; end if;
end $$;
revoke all on function public.developer_support_conversation_action(uuid,uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.developer_support_conversation_action(uuid,uuid,uuid,boolean,text,text) to service_role;
