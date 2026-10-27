alter table public.hosted_artifacts
  add column if not exists project_id text not null default 'legacy',
  add column if not exists build_profile_id text not null default 'legacy',
  add column if not exists build_target_id text not null default 'legacy',
  add column if not exists original_name text not null default 'artifact',
  add column if not exists artifact_kind text not null default 'file'
    check (artifact_kind in ('file', 'directory')),
  add column if not exists retention_days integer not null default 30
    check (retention_days between 1 and 3650);

drop index if exists public.hosted_artifacts_one_pin_per_output_idx;
create unique index hosted_artifacts_one_pin_per_build_target_idx
  on public.hosted_artifacts (
    user_id,
    project_id,
    build_profile_id,
    build_target_id
  )
  where pinned = true;

-- The Worker owns all artifact reads so object keys never leave the server boundary.
revoke all on public.hosted_artifacts from anon, authenticated;

-- Keep the old signature for clean rollback history, but stop the old Worker
-- from recording uploads without the new entitlement and quota checks.
create or replace function public.record_pipelab_cloud_artifact(
  p_user_id uuid,
  p_artifact_id text,
  p_artifact_output_id text,
  p_version text,
  p_size bigint,
  p_checksum text,
  p_storage_key text,
  p_uploaded_at timestamptz default now(),
  p_expires_at timestamptz default now() + interval '7 days'
)
returns public.hosted_artifacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.hosted_artifacts;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':legacy:' || p_artifact_output_id, 0)
  );

  update public.hosted_artifacts
  set pinned = false
  where user_id = p_user_id
    and project_id = 'legacy'
    and build_profile_id = 'legacy'
    and build_target_id = p_artifact_output_id
    and pinned = true;

  insert into public.hosted_artifacts (
    user_id, artifact_id, artifact_output_id, version, size, checksum,
    storage_key, uploaded_at, expires_at, pinned,
    project_id, build_profile_id, build_target_id
  ) values (
    p_user_id, p_artifact_id, p_artifact_output_id, p_version, p_size, p_checksum,
    p_storage_key, p_uploaded_at, p_expires_at, true,
    'legacy', 'legacy', p_artifact_output_id
  ) returning * into created;

  return created;
end;
$$;

revoke all on function public.record_pipelab_cloud_artifact(uuid, text, text, text, bigint, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.record_pipelab_cloud_artifact(uuid, text, text, text, bigint, text, text, timestamptz, timestamptz) from service_role;

alter table public.hosted_artifacts
  add column if not exists upload_reservation_id uuid;

create unique index if not exists hosted_artifacts_upload_reservation_idx
  on public.hosted_artifacts (upload_reservation_id)
  where upload_reservation_id is not null;

create table public.pipelab_cloud_plan_limits (
  product_id text primary key,
  tier_name text not null,
  quota_bytes bigint not null check (quota_bytes > 0),
  history_retention_days integer not null check (history_retention_days between 1 and 3650),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.pipelab_cloud_plan_limits enable row level security;
revoke all on public.pipelab_cloud_plan_limits from anon, authenticated;

create table public.hosted_artifact_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null unique,
  artifact_id text not null,
  artifact_output_id text not null,
  project_id text not null,
  build_profile_id text not null,
  build_target_id text not null,
  version text not null,
  original_name text not null,
  artifact_kind text not null check (artifact_kind in ('file', 'directory')),
  size bigint not null check (size >= 0),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  quota_bytes bigint not null check (quota_bytes > 0),
  retention_days integer not null check (retention_days between 1 and 3650),
  multipart_upload_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  cleanup_claimed_at timestamptz
);

create index hosted_artifact_upload_reservations_expiry_idx
  on public.hosted_artifact_upload_reservations (expires_at)
  where cleanup_claimed_at is null;

alter table public.hosted_artifact_upload_reservations enable row level security;
revoke all on public.hosted_artifact_upload_reservations from anon, authenticated;

alter table public.hosted_artifacts
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_reason text
    check (deletion_reason in ('owner', 'entitlement_expired'));

create table public.hosted_artifact_share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid not null references public.hosted_artifacts(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  encrypted_token text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index hosted_artifact_one_active_share_link_idx
  on public.hosted_artifact_share_links (artifact_id)
  where revoked_at is null;
create index hosted_artifact_share_links_owner_idx
  on public.hosted_artifact_share_links (user_id, artifact_id)
  where revoked_at is null;

alter table public.hosted_artifact_share_links enable row level security;
revoke all on public.hosted_artifact_share_links from anon, authenticated;

create table public.pipelab_cloud_account_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_product_id text,
  quota_bytes bigint,
  retention_days integer,
  paid_through_at timestamptz,
  entitlement_status text not null default 'active'
    check (entitlement_status in ('active', 'grace', 'deleting')),
  grace_until timestamptz,
  warning_email_sent_at timestamptz,
  last_entitlement_check_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.pipelab_cloud_account_state enable row level security;
revoke all on public.pipelab_cloud_account_state from anon, authenticated;

-- Preserve pre-v1 artifact access while the first billing reconciliation runs.
insert into public.pipelab_cloud_account_state (user_id, entitlement_status, grace_until)
select distinct artifacts.user_id, 'grace', now() + interval '30 days'
from public.hosted_artifacts artifacts
on conflict (user_id) do nothing;

create table public.pipelab_cloud_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind = 'artifact_deletion_warning'),
  deadline_at timestamptz not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz
);

create index pipelab_cloud_notifications_owner_idx
  on public.pipelab_cloud_notifications (user_id, created_at desc);
alter table public.pipelab_cloud_notifications enable row level security;
revoke all on public.pipelab_cloud_notifications from anon, authenticated;
grant select on public.pipelab_cloud_notifications to authenticated;
create policy "Users can view their Pipelab Cloud notifications"
  on public.pipelab_cloud_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

alter table public.pipelab_cloud_notifications
  add constraint pipelab_cloud_notifications_dedup unique (user_id, kind, deadline_at);

create or replace function public.start_pipelab_cloud_grace_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.pipelab_cloud_account_state
  set entitlement_status = 'grace',
      grace_until = paid_through_at + interval '30 days',
      warning_email_sent_at = null,
      updated_at = now()
  where entitlement_status = 'active'
    and paid_through_at <= now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.start_pipelab_cloud_grace_periods() from public, anon, authenticated;
grant execute on function public.start_pipelab_cloud_grace_periods() to service_role;

create or replace function public.claim_expired_pipelab_cloud_artifacts(p_limit integer default 100)
returns setof public.hosted_artifacts
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pipelab_cloud_account_state
  set entitlement_status = 'deleting', updated_at = now()
  where entitlement_status = 'grace' and grace_until <= now();

  update public.hosted_artifacts artifacts
  set pinned = false,
      deletion_requested_at = coalesce(deletion_requested_at, now()),
      deletion_reason = coalesce(deletion_reason, 'entitlement_expired')
  from public.pipelab_cloud_account_state account
  where artifacts.user_id = account.user_id
    and account.entitlement_status = 'deleting'
    and artifacts.deletion_requested_at is null;

  update public.hosted_artifact_share_links links
  set revoked_at = now()
  from public.pipelab_cloud_account_state account
  where links.user_id = account.user_id
    and account.entitlement_status = 'deleting'
    and links.revoked_at is null;

  return query
  with candidates as (
    select id
    from public.hosted_artifacts
    where (
      deletion_requested_at is not null
      or (pinned = false and expires_at <= now())
    )
      and (cleanup_claimed_at is null or cleanup_claimed_at < now() - interval '1 hour')
    order by coalesce(deletion_requested_at, expires_at)
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  )
  update public.hosted_artifacts artifacts
  set cleanup_claimed_at = now()
  from candidates
  where artifacts.id = candidates.id
  returning artifacts.*;
end;
$$;

revoke all on function public.claim_expired_pipelab_cloud_artifacts(integer) from public, anon, authenticated;
grant execute on function public.claim_expired_pipelab_cloud_artifacts(integer) to service_role;

create or replace function public.claim_expired_pipelab_cloud_upload_reservations(p_limit integer default 100)
returns setof public.hosted_artifact_upload_reservations
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select id
    from public.hosted_artifact_upload_reservations
    where expires_at <= now()
      and (cleanup_claimed_at is null or cleanup_claimed_at < now() - interval '1 hour')
    order by expires_at
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  )
  update public.hosted_artifact_upload_reservations reservations
  set cleanup_claimed_at = now()
  from candidates
  where reservations.id = candidates.id
  returning reservations.*;
$$;

revoke all on function public.claim_expired_pipelab_cloud_upload_reservations(integer) from public, anon, authenticated;
grant execute on function public.claim_expired_pipelab_cloud_upload_reservations(integer) to service_role;

create or replace function public.finish_pipelab_cloud_upload_reservation_cleanup(
  p_reservation_id uuid,
  p_result text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_result = 'deleted' then
    delete from public.hosted_artifact_upload_reservations
    where id = p_reservation_id and cleanup_claimed_at is not null;
  else
    update public.hosted_artifact_upload_reservations
    set cleanup_claimed_at = null
    where id = p_reservation_id and cleanup_claimed_at is not null;
  end if;
end;
$$;

revoke all on function public.finish_pipelab_cloud_upload_reservation_cleanup(uuid, text) from public, anon, authenticated;
grant execute on function public.finish_pipelab_cloud_upload_reservation_cleanup(uuid, text) to service_role;

create or replace function public.claim_pipelab_cloud_deletion_warnings()
returns table (user_id uuid, email text, deadline_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    update public.pipelab_cloud_account_state account
    set warning_email_sent_at = now(), updated_at = now()
    where account.entitlement_status = 'grace'
      and account.grace_until > now()
      and account.grace_until <= now() + interval '7 days'
      and account.warning_email_sent_at is null
    returning account.user_id, account.grace_until
  ), notifications as (
    insert into public.pipelab_cloud_notifications (user_id, kind, deadline_at, message)
    select due.user_id, 'artifact_deletion_warning', due.grace_until,
      'Your Pipelab Cloud artifacts and share links will be deleted after ' || due.grace_until::date || '.'
    from due
    on conflict on constraint pipelab_cloud_notifications_dedup do nothing
  )
  select due.user_id, users.email::text, due.grace_until
  from due
  join auth.users users on users.id = due.user_id;
end;
$$;

revoke all on function public.claim_pipelab_cloud_deletion_warnings() from public, anon, authenticated;
grant execute on function public.claim_pipelab_cloud_deletion_warnings() to service_role;

create or replace function public.release_pipelab_cloud_deletion_warning(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.pipelab_cloud_account_state
  set warning_email_sent_at = null, updated_at = now()
  where user_id = p_user_id and entitlement_status = 'grace';
$$;

revoke all on function public.release_pipelab_cloud_deletion_warning(uuid) from public, anon, authenticated;
grant execute on function public.release_pipelab_cloud_deletion_warning(uuid) to service_role;

create or replace function public.set_pipelab_cloud_active_entitlement(
  p_user_id uuid,
  p_plan_product_id text,
  p_quota_bytes bigint,
  p_retention_days integer,
  p_paid_through_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_quota_bytes <= 0 or p_retention_days not between 1 and 3650 then
    raise exception using errcode = '22023', message = 'Invalid Pipelab Cloud plan limits';
  end if;
  insert into public.pipelab_cloud_account_state (
    user_id, plan_product_id, quota_bytes, retention_days,
    paid_through_at, entitlement_status, grace_until,
    warning_email_sent_at, last_entitlement_check_at, updated_at
  ) values (
    p_user_id, p_plan_product_id, p_quota_bytes, p_retention_days,
    p_paid_through_at, 'active', null, null, now(), now()
  )
  on conflict (user_id) do update set
    plan_product_id = excluded.plan_product_id,
    quota_bytes = excluded.quota_bytes,
    retention_days = excluded.retention_days,
    paid_through_at = excluded.paid_through_at,
    entitlement_status = 'active',
    grace_until = null,
    warning_email_sent_at = null,
    last_entitlement_check_at = now(),
    updated_at = now();

  update public.pipelab_cloud_notifications
  set resolved_at = now()
  where user_id = p_user_id and resolved_at is null;
end;
$$;

revoke all on function public.set_pipelab_cloud_active_entitlement(uuid, text, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.set_pipelab_cloud_active_entitlement(uuid, text, bigint, integer, timestamptz) to service_role;

create or replace function public.set_pipelab_cloud_expired_entitlement(
  p_user_id uuid,
  p_plan_product_id text,
  p_quota_bytes bigint,
  p_retention_days integer,
  p_paid_through_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deadline timestamptz := p_paid_through_at + interval '30 days';
begin
  if p_quota_bytes <= 0 or p_retention_days not between 1 and 3650 then
    raise exception using errcode = '22023', message = 'Invalid Pipelab Cloud plan limits';
  end if;
  insert into public.pipelab_cloud_account_state (
    user_id, plan_product_id, quota_bytes, retention_days, paid_through_at,
    entitlement_status, grace_until, last_entitlement_check_at, updated_at
  ) values (
    p_user_id, p_plan_product_id, p_quota_bytes, p_retention_days, p_paid_through_at,
    case when deadline > now() then 'grace' else 'deleting' end,
    deadline, now(), now()
  )
  on conflict (user_id) do update set
    plan_product_id = excluded.plan_product_id,
    quota_bytes = excluded.quota_bytes,
    retention_days = excluded.retention_days,
    paid_through_at = excluded.paid_through_at,
    entitlement_status = case when deadline > now() then 'grace' else 'deleting' end,
    grace_until = deadline,
    last_entitlement_check_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.set_pipelab_cloud_expired_entitlement(uuid, text, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.set_pipelab_cloud_expired_entitlement(uuid, text, bigint, integer, timestamptz) to service_role;

create or replace function public.reserve_pipelab_cloud_artifact_upload(
  p_user_id uuid,
  p_storage_key text,
  p_artifact_id text,
  p_artifact_output_id text,
  p_project_id text,
  p_build_profile_id text,
  p_build_target_id text,
  p_version text,
  p_original_name text,
  p_artifact_kind text,
  p_size bigint,
  p_checksum text,
  p_quota_bytes bigint,
  p_retention_days integer
)
returns public.hosted_artifact_upload_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.hosted_artifact_upload_reservations;
  used_bytes bigint;
begin
  if p_size < 0 or p_quota_bytes <= 0 or p_retention_days not between 1 and 3650 then
    raise exception using errcode = '22023', message = 'Invalid Pipelab Cloud upload limits';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1));
  select coalesce(sum(size), 0) into used_bytes
  from public.hosted_artifacts
  where user_id = p_user_id;
  select used_bytes + coalesce(sum(size), 0) into used_bytes
  from public.hosted_artifact_upload_reservations
  where user_id = p_user_id and expires_at > now();

  if used_bytes + p_size > p_quota_bytes then
    raise exception using
      errcode = 'P0001',
      message = 'pipelab_cloud_quota_exceeded',
      detail = pg_catalog.json_build_object(
        'usedBytes', used_bytes,
        'requestedBytes', p_size,
        'quotaBytes', p_quota_bytes
      )::text;
  end if;

  insert into public.hosted_artifact_upload_reservations (
    user_id, storage_key, artifact_id, artifact_output_id, project_id,
    build_profile_id, build_target_id, version, original_name, artifact_kind,
    size, checksum, quota_bytes, retention_days
  ) values (
    p_user_id, p_storage_key, p_artifact_id, p_artifact_output_id, p_project_id,
    p_build_profile_id, p_build_target_id, p_version, p_original_name, p_artifact_kind,
    p_size, p_checksum, p_quota_bytes, p_retention_days
  ) returning * into reservation;

  return reservation;
end;
$$;

revoke all on function public.reserve_pipelab_cloud_artifact_upload(uuid, text, text, text, text, text, text, text, text, text, bigint, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.reserve_pipelab_cloud_artifact_upload(uuid, text, text, text, text, text, text, text, text, text, bigint, text, bigint, integer) to service_role;

create or replace function public.set_pipelab_cloud_multipart_upload(
  p_user_id uuid,
  p_reservation_id uuid,
  p_multipart_upload_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.hosted_artifact_upload_reservations
  set multipart_upload_id = p_multipart_upload_id
  where id = p_reservation_id and user_id = p_user_id;
$$;

revoke all on function public.set_pipelab_cloud_multipart_upload(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_pipelab_cloud_multipart_upload(uuid, uuid, text) to service_role;

create or replace function public.release_pipelab_cloud_artifact_upload(
  p_user_id uuid,
  p_reservation_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.hosted_artifact_upload_reservations
  where id = p_reservation_id and user_id = p_user_id;
$$;

revoke all on function public.release_pipelab_cloud_artifact_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_pipelab_cloud_artifact_upload(uuid, uuid) to service_role;

create or replace function public.commit_pipelab_cloud_artifact_upload(
  p_user_id uuid,
  p_reservation_id uuid,
  p_actual_size bigint,
  p_current_quota_bytes bigint,
  p_current_retention_days integer
)
returns public.hosted_artifacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.hosted_artifact_upload_reservations;
  created public.hosted_artifacts;
  used_bytes bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 1));

  select * into reservation
  from public.hosted_artifact_upload_reservations
  where id = p_reservation_id and user_id = p_user_id
  for update;

  if not found then
    select * into created
    from public.hosted_artifacts
    where upload_reservation_id = p_reservation_id and user_id = p_user_id;
    if found then return created; end if;
    raise exception using errcode = 'P0002', message = 'pipelab_cloud_upload_reservation_not_found';
  end if;

  if reservation.expires_at <= now() or reservation.size <> p_actual_size
     or p_current_quota_bytes <= 0
     or p_current_retention_days not between 1 and 3650 then
    raise exception using errcode = '22023', message = 'pipelab_cloud_upload_reservation_invalid';
  end if;

  select coalesce(sum(size), 0) into used_bytes
  from public.hosted_artifacts
  where user_id = p_user_id;
  select used_bytes + coalesce(sum(size), 0) into used_bytes
  from public.hosted_artifact_upload_reservations
  where user_id = p_user_id and expires_at > now();
  if used_bytes > p_current_quota_bytes then
    raise exception using errcode = 'P0001', message = 'pipelab_cloud_quota_exceeded';
  end if;

  update public.hosted_artifacts
  set pinned = false
  where user_id = p_user_id
    and project_id = reservation.project_id
    and build_profile_id = reservation.build_profile_id
    and build_target_id = reservation.build_target_id
    and pinned = true;

  insert into public.hosted_artifacts (
    user_id, artifact_id, artifact_output_id, version, size, checksum,
    storage_key, uploaded_at, expires_at, pinned, project_id,
    build_profile_id, build_target_id, original_name, artifact_kind,
    retention_days, upload_reservation_id
  ) values (
    p_user_id, reservation.artifact_id, reservation.artifact_output_id,
    reservation.version, reservation.size, reservation.checksum,
    reservation.storage_key, now(), now() + pg_catalog.make_interval(days => p_current_retention_days),
    true, reservation.project_id, reservation.build_profile_id,
    reservation.build_target_id, reservation.original_name, reservation.artifact_kind,
    p_current_retention_days, reservation.id
  ) returning * into created;

  delete from public.hosted_artifact_upload_reservations where id = reservation.id;
  return created;
end;
$$;

revoke all on function public.commit_pipelab_cloud_artifact_upload(uuid, uuid, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.commit_pipelab_cloud_artifact_upload(uuid, uuid, bigint, bigint, integer) to service_role;
