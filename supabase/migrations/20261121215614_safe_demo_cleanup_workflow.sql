-- Read-only preflight contract for launch cleanup.
--
-- This migration intentionally does not delete, anonymize, revoke, or mutate
-- any row.  The returned JSON is the source for the local, mode-600 manifest
-- and must be reviewed before a separately generated execution script is run.
-- The cutoff is supplied by the caller from the same DB clock used to create
-- the manifest; it is never inferred from a client date.
begin;

create or replace function public.demo_cleanup_dependency_blockers(p_cutoff timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  edge record;
  blockers jsonb := '[]'::jsonb;
  added_rows integer := 0;
  inserted_rows integer := 0;
begin
  -- SECURITY DEFINER changes current_user to the function owner.  Only the
  -- caller's JWT role is authoritative here; never use current_user as an
  -- authorization fallback.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_cutoff is null then
    raise exception 'A fixed cutoff is required';
  end if;
  if p_cutoff > clock_timestamp() - interval '7 days' then
    raise exception 'Cutoff must be at least seven days before the database clock';
  end if;

  create temp table if not exists demo_cleanup_candidates (
    table_name text not null,
    row_id text not null,
    demo_batch text,
    created_at timestamptz not null,
    updated_at timestamptz,
    fingerprint text,
    reason text not null default 'explicit_demo',
    primary key (table_name, row_id)
  ) on commit drop;
  create temp table if not exists demo_cleanup_blockers (
    target_table text not null,
    target_id text not null,
    source_table text not null,
    source_count bigint not null,
    reason text not null
  ) on commit drop;
  truncate demo_cleanup_candidates, demo_cleanup_blockers;

  insert into demo_cleanup_candidates(table_name, row_id, demo_batch, created_at)
  select * from (
    select 'admin_rules'::text, id::text, demo_batch, created_at from public.admin_rules where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'admin_tasks', id::text, demo_batch, created_at from public.admin_tasks where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'badges', id::text, demo_batch, created_at from public.badges where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'dashboard_content', id::text, demo_batch, created_at from public.dashboard_content where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'deal_stage_entries', id::text, demo_batch, created_at from public.deal_stage_entries where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'deals', id::text, demo_batch, created_at from public.deals where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'developer_accounts', id::text, demo_batch, created_at from public.developer_accounts where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'developer_contact_requests', id::text, demo_batch, created_at from public.developer_contact_requests where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'developer_projects', id::text, demo_batch, created_at from public.developer_projects where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'developers', id::text, demo_batch, created_at from public.developers where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'gift_rules', id::text, demo_batch, created_at from public.gift_rules where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'gifts', id::text, demo_batch, created_at from public.gifts where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'growth_audiences', id::text, demo_batch, created_at from public.growth_audiences where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'notification_campaigns', id::text, demo_batch, created_at from public.notification_campaigns where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'properties', id::text, demo_batch, created_at from public.properties where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'support_macros', id::text, demo_batch, created_at from public.support_macros where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'support_tickets', id::text, demo_batch, created_at from public.support_tickets where is_demo and created_at < p_cutoff and updated_at < p_cutoff
    union all select 'tiers', id::text, demo_batch, created_at from public.tiers where is_demo and created_at < p_cutoff and updated_at < p_cutoff
  ) rows;

  -- Legacy child tables predate is_demo/demo_batch.  When a row is an old
  -- child of an explicit demo row, inherit the parent's batch for the
  -- manifest.  A child shared by two batches is marked ambiguous and is
  -- blocked below; it is never guessed from a name or title.
  loop
    added_rows := 0;
    for edge in
        select src.relname::text source_table,
               src_att.attname::text source_column,
               tgt.relname::text target_table,
               exists (
                 select 1 from pg_attribute a
                 where a.attrelid = src.oid and a.attname = 'created_at'
                   and a.attnum > 0 and not a.attisdropped
               ) as source_has_created_at,
               exists (
                 select 1 from pg_attribute a
                 where a.attrelid = src.oid and a.attname = 'updated_at'
                   and a.attnum > 0 and not a.attisdropped
               ) as source_has_updated_at,
               exists (
                 select 1 from pg_attribute a
                 where a.attrelid = src.oid and a.attname = 'is_demo'
                   and a.attnum > 0 and not a.attisdropped
               ) as source_has_demo,
               exists (
                 select 1 from pg_attribute a
                 where a.attrelid = src.oid and a.attname = 'demo_batch'
                   and a.attnum > 0 and not a.attisdropped
               ) as source_has_batch
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_class tgt on tgt.oid = con.confrelid
        join pg_namespace src_ns on src_ns.oid = src.relnamespace
        join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
        join lateral unnest(con.conkey) with ordinality s(attnum, ord) on true
        join lateral unnest(con.confkey) with ordinality t(attnum, ord) on t.ord = s.ord
        join pg_attribute src_att on src_att.attrelid = src.oid and src_att.attnum = s.attnum
        where con.contype = 'f'
          and src_ns.nspname = 'public'
          and tgt_ns.nspname = 'public'
          and src.relkind = 'r'
          and tgt.relkind = 'r'
          and tgt.relname <> 'demo_data_batches'
          and tgt.relname <> 'users_profile'
          and exists (
            select 1 from pg_attribute source_id
            where source_id.attrelid = src.oid
              and source_id.attname = 'id'
              and source_id.atttypid = 'uuid'::regtype
              and source_id.attnum > 0 and not source_id.attisdropped
          )
          and exists (
            select 1 from pg_attribute target_id
            where target_id.attrelid = tgt.oid
              and target_id.attname = 'id'
              and target_id.atttypid = 'uuid'::regtype
              and target_id.attnum > 0 and not target_id.attisdropped
          )
    loop
      if not edge.source_has_created_at then
        continue;
      end if;
      execute format(
          'insert into pg_temp.demo_cleanup_candidates(table_name,row_id,demo_batch,created_at,updated_at,fingerprint,reason)
           select %L, child.id::text, parent.demo_batch, child.created_at::timestamptz, %s, md5(to_jsonb(child)::text), %L
           from public.%I child
           join pg_temp.demo_cleanup_candidates parent
             on parent.table_name = %L
            and child.%I::text = parent.row_id
           where child.created_at::timestamptz < %L::timestamptz
             and %s
             and (%s)
           on conflict (table_name,row_id) do nothing',
          edge.source_table,
          case when edge.source_has_updated_at then 'child.updated_at::timestamptz' else 'null::timestamptz' end,
          'inherited_from:' || edge.target_table,
          edge.source_table,
          edge.target_table,
          edge.source_column,
          p_cutoff,
          case when edge.source_has_updated_at then 'child.updated_at::timestamptz < ' || quote_literal(p_cutoff) || '::timestamptz' else 'false' end,
          case when edge.source_has_demo and edge.source_has_batch
            then format('(not coalesce(child.%I,false) or child.%I = parent.demo_batch)', 'is_demo', 'demo_batch')
            when edge.source_has_demo then '(not coalesce(child.is_demo,false))'
            else 'true'
          end
      );
      get diagnostics inserted_rows = row_count;
      added_rows := added_rows + inserted_rows;
    end loop;
    exit when added_rows = 0;
  end loop;

  -- A parent is blocked when an inbound FK row is not itself an old demo row
  -- in the same batch.  In particular, a recent descendant or a legacy row
  -- without demo metadata blocks the parent instead of allowing ON DELETE
  -- CASCADE to erase it implicitly.
  for edge in
    select src.relname::text source_table,
           src_att.attname::text source_column,
           tgt.relname::text target_table,
           tgt_att.attname::text target_column
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
    join lateral unnest(con.conkey) with ordinality s(attnum, ord) on true
    join lateral unnest(con.confkey) with ordinality t(attnum, ord) on t.ord = s.ord
    join pg_attribute src_att on src_att.attrelid = src.oid and src_att.attnum = s.attnum
    join pg_attribute tgt_att on tgt_att.attrelid = tgt.oid and tgt_att.attnum = t.attnum
    where con.contype = 'f'
      and src_ns.nspname = 'public'
      and tgt_ns.nspname = 'public'
      and src.relkind = 'r'
      and tgt.relkind = 'r'
      and tgt.relname <> 'demo_data_batches'
      and tgt.relname <> 'users_profile'
      and exists (
        select 1 from pg_attribute source_id
        where source_id.attrelid = src.oid
          and source_id.attname = 'id'
          and source_id.atttypid = 'uuid'::regtype
          and source_id.attnum > 0
          and not source_id.attisdropped
      )
      and exists (
        select 1 from pg_attribute target_id
        where target_id.attrelid = tgt.oid
          and target_id.attname = 'id'
          and target_id.atttypid = 'uuid'::regtype
          and target_id.attnum > 0
          and not target_id.attisdropped
      )
  loop
    execute format(
      'insert into pg_temp.demo_cleanup_blockers(target_table,target_id,source_table,source_count,reason)
       select candidate.table_name,candidate.row_id,%L,count(*)::bigint,%L
       from public.%I child
       join pg_temp.demo_cleanup_candidates candidate
         on candidate.table_name = %L
        and child.%I::text = candidate.row_id
       where (
         not exists (
         select 1 from pg_temp.demo_cleanup_candidates child_candidate
         where child_candidate.table_name = %L
           and child_candidate.row_id = child.id::text
           and child_candidate.demo_batch = candidate.demo_batch
         )
         or exists (
           select 1 from pg_temp.demo_cleanup_candidates child_candidate
           where child_candidate.table_name = %L
             and child_candidate.row_id = child.id::text
             and child_candidate.demo_batch is distinct from candidate.demo_batch
         )
       )
       group by candidate.table_name,candidate.row_id',
      edge.source_table,
      'inbound row is not an old same-batch demo row',
      edge.source_table,
      edge.target_table,
      edge.source_column,
      edge.source_table,
      edge.source_table
    );
  end loop;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'target_table', b.target_table,
      'target_id', b.target_id,
      'source_table', b.source_table,
      'source_count', b.source_count,
      'reason', b.reason
    ) order by b.target_table,b.target_id,b.source_table
  ), '[]'::jsonb)
  into blockers
  from demo_cleanup_blockers b;
  return blockers;
end;
$$;

revoke all on function public.demo_cleanup_dependency_blockers(timestamptz) from public, anon, authenticated;
grant execute on function public.demo_cleanup_dependency_blockers(timestamptz) to service_role;

create or replace function public.preview_demo_cleanup(p_cutoff timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cutoff_value timestamptz := coalesce(p_cutoff, clock_timestamp() - interval '7 days');
  business_rows jsonb := '[]'::jsonb;
  identity_rows jsonb := '[]'::jsonb;
  profile_rows jsonb := '[]'::jsonb;
  admin_rows jsonb := '[]'::jsonb;
  protected_auth_ids jsonb := '[]'::jsonb;
  storage_rows jsonb := '[]'::jsonb;
  batch_rows jsonb := '[]'::jsonb;
  fk_rows jsonb := '[]'::jsonb;
  derived_rows jsonb := '{}'::jsonb;
  dependency_rows jsonb := '[]'::jsonb;
  inherited_rows jsonb := '[]'::jsonb;
  identity_policy jsonb := '{}'::jsonb;
  security_artifact_rows jsonb := '{}'::jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if cutoff_value > clock_timestamp() - interval '7 days' then
    raise exception 'Cutoff must be at least seven days before the database clock';
  end if;

  -- Every explicit business-demo row is included with its exact ID and the
  -- fixed age classification.  users_profile is intentionally separate:
  -- mobile identities are protected even when their profile is flagged demo.
  with rows as (
    select 'admin_agent_notes'::text table_name, r.id::text id, r.demo_batch, r.created_at, null::timestamptz updated_at, r.is_demo, md5(to_jsonb(r)::text) fingerprint from public.admin_agent_notes r where r.is_demo
    union all select 'admin_export_jobs', r.id::text, r.demo_batch, r.created_at, null::timestamptz, r.is_demo, md5(to_jsonb(r)::text) from public.admin_export_jobs r where r.is_demo
    union all select 'admin_rules', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.admin_rules r where r.is_demo
    union all select 'admin_tasks', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.admin_tasks r where r.is_demo
    union all select 'badges', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.badges r where r.is_demo
    union all select 'dashboard_content', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.dashboard_content r where r.is_demo
    union all select 'deal_operation_outbox', r.id::text, r.demo_batch, r.created_at, null::timestamptz, r.is_demo, md5(to_jsonb(r)::text) from public.deal_operation_outbox r where r.is_demo
    union all select 'deal_stage_entries', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.deal_stage_entries r where r.is_demo
    union all select 'deals', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.deals r where r.is_demo
    union all select 'developer_accounts', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.developer_accounts r where r.is_demo
    union all select 'developer_contact_requests', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.developer_contact_requests r where r.is_demo
    union all select 'developer_projects', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.developer_projects r where r.is_demo
    union all select 'developers', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.developers r where r.is_demo
    union all select 'gift_rules', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.gift_rules r where r.is_demo
    union all select 'gifts', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.gifts r where r.is_demo
    union all select 'growth_audiences', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.growth_audiences r where r.is_demo
    union all select 'notification_campaigns', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.notification_campaigns r where r.is_demo
    union all select 'notifications', r.id::text, r.demo_batch, r.created_at, null::timestamptz, r.is_demo, md5(to_jsonb(r)::text) from public.notifications r where r.is_demo
    union all select 'properties', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.properties r where r.is_demo
    union all select 'support_macros', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.support_macros r where r.is_demo
    union all select 'support_tickets', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.support_tickets r where r.is_demo
    union all select 'tiers', r.id::text, r.demo_batch, r.created_at, r.updated_at, r.is_demo, md5(to_jsonb(r)::text) from public.tiers r where r.is_demo
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'table_name', r.table_name,
      'id', r.id,
      'demo_batch', r.demo_batch,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'fingerprint', r.fingerprint,
      'window', case when r.created_at < cutoff_value then 'old' else 'recent' end,
      'eligibility', case
        when r.created_at >= cutoff_value then 'recent_created'
        when r.updated_at is null then 'unknown_recent_edit'
        when r.updated_at >= cutoff_value then 'recent_edit'
        else 'eligible'
      end
    ) order by r.table_name, r.created_at, r.id
  ), '[]'::jsonb)
  into business_rows
  from rows r;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', da.id,
      'developer_id', da.developer_id,
      'auth_user_id', da.auth_user_id,
      'role', da.role,
      'status', da.status,
      'demo_batch', da.demo_batch,
      'created_at', da.created_at,
      'window', case when da.created_at < cutoff_value then 'old' else 'recent' end,
      'has_mobile_profile', exists(select 1 from public.users_profile p where p.id = da.auth_user_id),
      'has_auth_phone', exists(select 1 from auth.users u where u.id = da.auth_user_id and u.phone is not null),
      'has_phone_identity', exists(select 1 from auth.identities i where i.user_id = da.auth_user_id and i.provider = 'phone'),
      'auth_identity_count', (select count(*) from auth.identities i where i.user_id = da.auth_user_id),
      'auth_session_count', (select count(*) from auth.sessions s where s.user_id = da.auth_user_id),
      'auth_refresh_token_count', (select count(*) from auth.refresh_tokens t where t.user_id = da.auth_user_id::text),
      'has_push_token', exists(select 1 from public.device_push_tokens t where t.agent_id = da.auth_user_id),
      'is_platform_admin', exists(select 1 from public.admins a where a.id = da.auth_user_id),
      'is_active_last_developer_super_admin',
        da.status = 'active'
        and da.role = 'developer_super_admin'
        and not exists (
          select 1 from public.developer_accounts replacement
          where replacement.developer_id = da.developer_id
            and replacement.id <> da.id
            and replacement.status = 'active'
            and replacement.role = 'developer_super_admin'
            and not coalesce(replacement.is_demo, false)
        ),
      'account_event_count', (select count(*) from public.developer_account_events e where e.developer_account_id = da.id),
      'other_account_count', (select count(*) from public.developer_accounts other_account where other_account.auth_user_id = da.auth_user_id and other_account.id <> da.id),
      'eligible_identity',
        da.created_at < cutoff_value
        and not exists(select 1 from public.users_profile p where p.id = da.auth_user_id)
        and not exists(select 1 from auth.users u where u.id = da.auth_user_id and u.phone is not null)
        and not exists(select 1 from auth.identities i where i.user_id = da.auth_user_id and i.provider = 'phone')
        and not exists(select 1 from public.device_push_tokens t where t.agent_id = da.auth_user_id)
        and not exists(select 1 from public.admins a where a.id = da.auth_user_id)
        and not (
          da.status = 'active'
          and da.role = 'developer_super_admin'
          and not exists (
            select 1 from public.developer_accounts replacement
            where replacement.developer_id = da.developer_id
              and replacement.id <> da.id
              and replacement.status = 'active'
              and replacement.role = 'developer_super_admin'
              and not coalesce(replacement.is_demo, false)
          )
        )
    ) order by da.created_at, da.id
  ), '[]'::jsonb)
  into identity_rows
  from public.developer_accounts da
  where da.is_demo;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'demo_batch', p.demo_batch,
      'account_status', p.account_status,
      'created_at', p.created_at,
      'updated_at', p.updated_at,
      'has_profile_phone', p.phone is not null,
      'has_auth_user', exists(select 1 from auth.users u where u.id = p.id),
      'has_auth_phone', exists(select 1 from auth.users u where u.id = p.id and u.phone is not null),
      'has_phone_identity', exists(select 1 from auth.identities i where i.user_id = p.id and i.provider = 'phone'),
      'push_token_count', (select count(*) from public.device_push_tokens t where t.agent_id = p.id),
      'protected', true
    ) order by p.created_at, p.id
  ), '[]'::jsonb)
  into profile_rows
  from public.users_profile p;

  -- All seven current admin identities are explicitly protected.  The
  -- cleanup workflow never infers an admin deletion candidate from age/name.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'role', a.role,
      'is_active', a.is_active,
      'created_at', a.created_at,
      'auth_user_exists', exists(select 1 from auth.users u where u.id = a.id),
      'protected', true
    ) order by a.created_at, a.id
  ), '[]'::jsonb)
  into admin_rows
  from public.admins a;

  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb)
  into protected_auth_ids
  from (
    select p.id from public.users_profile p
    union
    select a.id from public.admins a
    union
    select u.id from auth.users u where u.phone is not null
    union
    select i.user_id from auth.identities i where i.provider = 'phone'
    union
    select t.agent_id from public.device_push_tokens t
  ) x;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket_id', s.bucket_id,
      'object_count', s.object_count,
      'recent_object_count', s.recent_object_count,
      'protected_owner_object_count', s.protected_owner_object_count
    ) order by s.bucket_id
  ), '[]'::jsonb)
  into storage_rows
  from (
    select o.bucket_id,
           count(*)::bigint object_count,
           count(*) filter (where o.created_at >= cutoff_value)::bigint recent_object_count,
           count(*) filter (where o.owner_id in (select p.id::text from public.users_profile p)
                              or o.owner_id in (select a.id::text from public.admins a))::bigint protected_owner_object_count
    from storage.objects o
    group by o.bucket_id
  ) s;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'batch_key', b.batch_key,
      'status', b.status,
      'created_at', b.created_at,
      'removed_at', b.removed_at
    ) order by b.created_at, b.batch_key
  ), '[]'::jsonb)
  into batch_rows
  from public.demo_data_batches b;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source_table', e.source_table,
      'source_column', e.source_column,
      'target_table', e.target_table,
      'target_column', e.target_column,
      'delete_rule', e.delete_rule
    ) order by e.target_table, e.source_table, e.source_column
  ), '[]'::jsonb)
  into fk_rows
  from (
    select src.relname::text source_table,
           src_att.attname::text source_column,
           tgt.relname::text target_table,
           tgt_att.attname::text target_column,
           case con.confdeltype
             when 'a' then 'NO ACTION'
             when 'r' then 'RESTRICT'
             when 'c' then 'CASCADE'
             when 'n' then 'SET NULL'
             when 'd' then 'SET DEFAULT'
             else con.confdeltype::text
           end delete_rule
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace src_ns on src_ns.oid = src.relnamespace
    join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
    join lateral unnest(con.conkey) with ordinality s(attnum, ord) on true
    join lateral unnest(con.confkey) with ordinality t(attnum, ord) on t.ord = s.ord
    join pg_attribute src_att on src_att.attrelid = src.oid and src_att.attnum = s.attnum
    join pg_attribute tgt_att on tgt_att.attrelid = tgt.oid and tgt_att.attnum = t.attnum
    where con.contype = 'f'
      and src_ns.nspname = 'public'
      and tgt_ns.nspname = 'public'
  ) e;

  select jsonb_build_object(
    'profiles_with_nonzero_deal_counters', count(*) filter (where coalesce(p.total_deals, 0) <> 0 or coalesce(p.successful_deals, 0) <> 0),
    'profiles_with_nonzero_earnings', count(*) filter (where coalesce(p.total_earnings, 0) <> 0),
    'demo_gift_claims', (select count(*) from public.gift_claims gc join public.gifts g on g.id = gc.gift_id where g.is_demo),
    'demo_gift_eligibilities', (select count(*) from public.gift_eligibilities ge join public.gifts g on g.id = ge.gift_id where g.is_demo),
    'demo_growth_evaluations', (select count(*) from public.growth_evaluation_results er where er.entity_id in (select id from public.gifts where is_demo) or er.entity_id in (select id from public.badges where is_demo) or er.entity_id in (select id from public.tiers where is_demo)),
    'demo_verified_stage_rows', (select count(*) from public.deal_stage_entries dse where dse.is_demo and dse.status in ('paid','confirmed','approved')),
    'demo_commissions', (select count(*) from public.commissions c join public.deals d on d.id = c.deal_id where d.is_demo)
  )
  into derived_rows
  from public.users_profile p;

  dependency_rows := public.demo_cleanup_dependency_blockers(cutoff_value);

  -- Identity retirement is deliberately separate from business-row cleanup.
  -- A recently-created session or refresh token is an ephemeral security
  -- artifact: it does not turn an old non-mobile developer account into a
  -- recent user identity. The workflow reports these artifacts for review,
  -- but never revokes or deletes them and never deletes auth.users.
  select jsonb_build_object(
    'review_only', true,
    'revoke_sessions', false,
    'revoke_refresh_tokens', false,
    'delete_auth_users', false,
    'recent_sessions_do_not_protect_old_identity', true,
    'auth_sessions', jsonb_build_object(
      'total', (select count(*) from auth.sessions),
      'recent_created', (select count(*) from auth.sessions where created_at >= cutoff_value),
      'linked_old_nonmobile_identity_rows', (
        select count(*) from auth.sessions s
        where exists (
          select 1 from public.developer_accounts da
          where da.is_demo
            and da.created_at < cutoff_value
            and da.auth_user_id = s.user_id
            and not exists(select 1 from public.users_profile p where p.id = da.auth_user_id)
            and not exists(select 1 from auth.users u where u.id = da.auth_user_id and u.phone is not null)
            and not exists(select 1 from auth.identities i where i.user_id = da.auth_user_id and i.provider = 'phone')
            and not exists(select 1 from public.device_push_tokens t where t.agent_id = da.auth_user_id)
            and not exists(select 1 from public.admins a where a.id = da.auth_user_id)
        )
      )
    ),
    'auth_refresh_tokens', jsonb_build_object(
      'total', (select count(*) from auth.refresh_tokens),
      'recent_created', (select count(*) from auth.refresh_tokens where created_at >= cutoff_value),
      'linked_old_nonmobile_identity_rows', (
        select count(*) from auth.refresh_tokens t
        where exists (
          select 1 from public.developer_accounts da
          where da.is_demo
            and da.created_at < cutoff_value
            and da.auth_user_id::text = t.user_id
            and not exists(select 1 from public.users_profile p where p.id = da.auth_user_id)
            and not exists(select 1 from auth.users u where u.id = da.auth_user_id and u.phone is not null)
            and not exists(select 1 from auth.identities i where i.user_id = da.auth_user_id and i.provider = 'phone')
            and not exists(select 1 from public.device_push_tokens t2 where t2.agent_id = da.auth_user_id)
            and not exists(select 1 from public.admins a where a.id = da.auth_user_id)
        )
      )
    ),
    'action', 'owner-reviewed session/token revocation is a separate step; no auth artifact mutation is generated'
  )
  into security_artifact_rows;

  identity_policy := jsonb_build_object(
    'developer_account_action', 'review_only_no_identity_row_delete',
    'old_nonmobile_candidate_count', (
      select count(*)
      from public.developer_accounts da
      where da.is_demo
        and da.created_at < cutoff_value
        and not exists(select 1 from public.users_profile p where p.id = da.auth_user_id)
        and not exists(select 1 from auth.users u where u.id = da.auth_user_id and u.phone is not null)
        and not exists(select 1 from auth.identities i where i.user_id = da.auth_user_id and i.provider = 'phone')
        and not exists(select 1 from public.device_push_tokens t where t.agent_id = da.auth_user_id)
        and not exists(select 1 from public.admins a where a.id = da.auth_user_id)
        and not (
          da.status = 'active'
          and da.role = 'developer_super_admin'
          and not exists (
            select 1 from public.developer_accounts replacement
            where replacement.developer_id = da.developer_id
              and replacement.id <> da.id
              and replacement.status = 'active'
              and replacement.role = 'developer_super_admin'
              and not coalesce(replacement.is_demo, false)
          )
        )
    ),
    'protected_identity_rules', jsonb_build_array(
      jsonb_build_object('scope', 'admins', 'action', 'protect_all_existing_admins', 'reason', 'operator access and auth identity must remain intact'),
      jsonb_build_object('scope', 'users_profile', 'action', 'protect_all_profiles', 'reason', 'mobile app identities remain intact even when is_demo is true'),
      jsonb_build_object('scope', 'auth.users', 'action', 'protect_all_auth_users', 'reason', 'this workflow never deletes Auth users'),
      jsonb_build_object('scope', 'auth phone identities and push-token owners', 'action', 'protect', 'reason', 'mobile identity signal takes precedence over age or demo flags')
    ),
    'referential_stub_option', jsonb_build_object(
      'enabled', false,
      'requires_owner_approval', true,
      'applies_only_when', 'an old non-mobile developer account is required as a foreign-key parent of recent activity',
      'retained_fields', jsonb_build_array(
        jsonb_build_object('field', 'developer_accounts.id', 'reason', 'referenced account/activity rows need a stable FK target'),
        jsonb_build_object('field', 'developer_accounts.developer_id', 'reason', 'developer-owned business rows need their developer FK target'),
        jsonb_build_object('field', 'developer_accounts.auth_user_id', 'reason', 'preserve referential recovery mapping; never sever an admin/mobile Auth link here'),
        jsonb_build_object('field', 'developer_accounts.is_demo and demo_batch', 'reason', 'retain cleanup lineage and prevent cross-batch inference')
      ),
      'scrubbable_fields_after_approval', jsonb_build_array('status', 'role', 'display/name fields', 'email or login metadata'),
      'not_implemented_by_this_workflow', true
    ),
    'security_artifacts', security_artifact_rows
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'table_name', c.table_name,
      'id', c.row_id,
      'demo_batch', c.demo_batch,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'fingerprint', c.fingerprint,
      'window', 'old',
      'eligibility', 'eligible',
      'ownership', c.reason
    ) order by c.table_name, c.created_at, c.row_id
  ), '[]'::jsonb)
  into inherited_rows
  from pg_temp.demo_cleanup_candidates c
  where c.reason <> 'explicit_demo';
  business_rows := business_rows || inherited_rows;

  return jsonb_build_object(
    'manifest_version', 1,
    'cutoff', cutoff_value,
    'business_rows', business_rows,
    'developer_identity_rows', identity_rows,
    'mobile_profiles', profile_rows,
    'protected_admins', admin_rows,
    'protected_auth_ids', protected_auth_ids,
    'storage_summary', storage_rows,
    'demo_batches', batch_rows,
    'foreign_key_graph', fk_rows,
    'dependency_blockers', dependency_rows,
    'identity_policy', identity_policy,
    'derived_state', derived_rows,
    'business_eligibility_policy', jsonb_build_object(
      'created_at_before_cutoff_required', true,
      'updated_at_before_cutoff_required_when_present', true,
      'missing_updated_at_action', 'protect',
      'recent_created_action', 'protect',
      'recent_edit_action', 'protect'
    ),
    'execution_policy', jsonb_build_object(
      'delete_auth_users', false,
      'delete_storage_objects', false,
      'delete_admins', false,
      'delete_users_profile', false,
      'delete_recent_rows', false,
      'require_backup_and_hash_revalidation', true
    )
  );
end;
$$;

revoke all on function public.preview_demo_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.preview_demo_cleanup(timestamptz) to service_role;

commit;
