drop function if exists public.claim_expired_pipelab_cloud_artifacts(integer);

create function public.claim_expired_pipelab_cloud_artifacts(
  p_limit integer default 100,
  p_allow_account_deletion boolean default true
)
returns setof public.hosted_artifacts
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_allow_account_deletion then
    update public.pipelab_cloud_account_state
    set entitlement_status = 'deleting', updated_at = now()
    where entitlement_status = 'grace' and grace_until <= now();
  end if;

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

revoke all on function public.claim_expired_pipelab_cloud_artifacts(integer, boolean) from public, anon, authenticated;
grant execute on function public.claim_expired_pipelab_cloud_artifacts(integer, boolean) to service_role;
