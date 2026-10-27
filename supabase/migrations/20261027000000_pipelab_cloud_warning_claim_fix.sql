drop index if exists public.pipelab_cloud_notifications_dedup_idx;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'pipelab_cloud_notifications_dedup'
      and conrelid = 'public.pipelab_cloud_notifications'::regclass
  ) then
    alter table public.pipelab_cloud_notifications
      add constraint pipelab_cloud_notifications_dedup unique (user_id, kind, deadline_at);
  end if;
end;
$$;

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
