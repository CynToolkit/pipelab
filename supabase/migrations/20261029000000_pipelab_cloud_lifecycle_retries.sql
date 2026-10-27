alter table public.pipelab_cloud_account_state
  add column warning_email_claimed_at timestamptz;

create or replace function public.claim_pipelab_cloud_deletion_warnings()
returns table (user_id uuid, email text, deadline_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select account.user_id, account.grace_until
    from public.pipelab_cloud_account_state account
    where account.entitlement_status = 'grace'
      and account.grace_until > now()
      and account.grace_until <= now() + interval '7 days'
      and account.warning_email_sent_at is null
      and (
        account.warning_email_claimed_at is null
        or account.warning_email_claimed_at < now() - interval '30 minutes'
      )
    order by account.grace_until
    limit 100
    for update skip locked
  ), claimed as (
    update public.pipelab_cloud_account_state account
    set warning_email_claimed_at = now(), updated_at = now()
    from due
    where account.user_id = due.user_id
      and account.warning_email_sent_at is null
    returning account.user_id, account.grace_until
  ), notifications as (
    insert into public.pipelab_cloud_notifications (user_id, kind, deadline_at, message)
    select claimed.user_id, 'artifact_deletion_warning', claimed.grace_until,
      'Your Pipelab Cloud artifacts and share links will be deleted after ' || claimed.grace_until::date ||
      '. Renew your plan to keep using Pipelab Cloud or download your artifacts before the deadline.'
    from claimed
    on conflict on constraint pipelab_cloud_notifications_dedup do nothing
  )
  select claimed.user_id, users.email::text, claimed.grace_until
  from claimed
  join auth.users users on users.id = claimed.user_id;
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
  set warning_email_claimed_at = null, updated_at = now()
  where user_id = p_user_id
    and entitlement_status = 'grace'
    and warning_email_sent_at is null;
$$;

revoke all on function public.release_pipelab_cloud_deletion_warning(uuid) from public, anon, authenticated;
grant execute on function public.release_pipelab_cloud_deletion_warning(uuid) to service_role;

create or replace function public.complete_pipelab_cloud_deletion_warning(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.pipelab_cloud_account_state
  set warning_email_sent_at = now(), warning_email_claimed_at = null, updated_at = now()
  where user_id = p_user_id
    and entitlement_status = 'grace'
    and warning_email_sent_at is null
    and warning_email_claimed_at is not null;
$$;

revoke all on function public.complete_pipelab_cloud_deletion_warning(uuid) from public, anon, authenticated;
grant execute on function public.complete_pipelab_cloud_deletion_warning(uuid) to service_role;

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
      warning_email_claimed_at = null,
      updated_at = now()
  where entitlement_status = 'active'
    and paid_through_at <= now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.start_pipelab_cloud_grace_periods() from public, anon, authenticated;
grant execute on function public.start_pipelab_cloud_grace_periods() to service_role;

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
    warning_email_sent_at, warning_email_claimed_at, last_entitlement_check_at, updated_at
  ) values (
    p_user_id, p_plan_product_id, p_quota_bytes, p_retention_days,
    p_paid_through_at, 'active', null, null, null, now(), now()
  )
  on conflict (user_id) do update set
    plan_product_id = excluded.plan_product_id,
    quota_bytes = excluded.quota_bytes,
    retention_days = excluded.retention_days,
    paid_through_at = excluded.paid_through_at,
    entitlement_status = 'active',
    grace_until = null,
    warning_email_sent_at = null,
    warning_email_claimed_at = null,
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
  insert into public.pipelab_cloud_account_state as existing (
    user_id, plan_product_id, quota_bytes, retention_days, paid_through_at,
    entitlement_status, grace_until, last_entitlement_check_at, updated_at
  ) values (
    p_user_id, p_plan_product_id, p_quota_bytes, p_retention_days, p_paid_through_at,
    case
      when p_paid_through_at > now() then 'active'
      when deadline > now() then 'grace'
      else 'deleting'
    end,
    deadline, now(), now()
  )
  on conflict (user_id) do update set
    plan_product_id = excluded.plan_product_id,
    quota_bytes = excluded.quota_bytes,
    retention_days = excluded.retention_days,
    paid_through_at = excluded.paid_through_at,
    entitlement_status = case
      when p_paid_through_at > now() then 'active'
      when deadline > now() then 'grace'
      else 'deleting'
    end,
    warning_email_sent_at = case
      when existing.grace_until is distinct from deadline then null
      else existing.warning_email_sent_at
    end,
    warning_email_claimed_at = case
      when existing.grace_until is distinct from deadline then null
      else existing.warning_email_claimed_at
    end,
    grace_until = deadline,
    last_entitlement_check_at = now(),
    updated_at = now();
end;
$$;

revoke all on function public.set_pipelab_cloud_expired_entitlement(uuid, text, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.set_pipelab_cloud_expired_entitlement(uuid, text, bigint, integer, timestamptz) to service_role;

drop function if exists public.claim_expired_pipelab_cloud_artifacts(integer, boolean);

create function public.claim_expired_pipelab_cloud_artifacts(
  p_limit integer default 100,
  p_verified_user_ids uuid[] default '{}'::uuid[]
)
returns setof public.hosted_artifacts
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pipelab_cloud_account_state
  set entitlement_status = 'deleting', updated_at = now()
  where entitlement_status = 'grace'
    and grace_until <= now()
    and user_id = any(coalesce(p_verified_user_ids, '{}'::uuid[]));

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

revoke all on function public.claim_expired_pipelab_cloud_artifacts(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.claim_expired_pipelab_cloud_artifacts(integer, uuid[]) to service_role;
