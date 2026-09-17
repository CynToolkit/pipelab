create table if not exists public.hosted_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id text not null,
  artifact_output_id text not null check (artifact_output_id in (
    'electron.windows', 'electron.linux', 'electron.macos.arm64',
    'tauri.windows', 'tauri.linux', 'tauri.macos.arm64', 'web.html5'
  )),
  version text not null,
  size bigint not null check (size >= 0),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  storage_key text not null unique,
  uploaded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  pinned boolean not null default false,
  cleanup_claimed_at timestamptz
);

create index if not exists hosted_artifacts_retention_idx
  on public.hosted_artifacts (expires_at)
  where pinned = false and cleanup_claimed_at is null;

create unique index if not exists hosted_artifacts_one_pin_per_output_idx
  on public.hosted_artifacts (user_id, artifact_output_id)
  where pinned = true;

alter table public.hosted_artifacts enable row level security;
revoke all on public.hosted_artifacts from anon, authenticated;
grant select on public.hosted_artifacts to authenticated;
create policy "Users can view their hosted artifacts"
  on public.hosted_artifacts for select to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.hosted_artifact_cleanup_results (
  id bigint generated always as identity primary key,
  artifact_id uuid,
  storage_key text not null,
  result text not null check (result in ('deleted', 'failed')),
  message text,
  attempted_at timestamptz not null default now()
);

alter table public.hosted_artifact_cleanup_results enable row level security;
revoke all on public.hosted_artifact_cleanup_results from anon, authenticated;

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
set search_path = public
as $$
declare
  created public.hosted_artifacts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_artifact_output_id, 0));

  update public.hosted_artifacts
  set pinned = false
  where user_id = p_user_id
    and artifact_output_id = p_artifact_output_id
    and pinned = true;

  insert into public.hosted_artifacts (
    user_id, artifact_id, artifact_output_id, version, size, checksum,
    storage_key, uploaded_at, expires_at, pinned
  ) values (
    p_user_id, p_artifact_id, p_artifact_output_id, p_version, p_size, p_checksum,
    p_storage_key, p_uploaded_at, p_expires_at, true
  ) returning * into created;

  return created;
end;
$$;

revoke all on function public.record_pipelab_cloud_artifact(uuid, text, text, text, bigint, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.record_pipelab_cloud_artifact(uuid, text, text, text, bigint, text, text, timestamptz, timestamptz) to service_role;

create or replace function public.claim_expired_pipelab_cloud_artifacts(p_limit integer default 100)
returns setof public.hosted_artifacts
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.hosted_artifacts
    where pinned = false
      and expires_at < now()
      and (cleanup_claimed_at is null or cleanup_claimed_at < now() - interval '1 hour')
    order by expires_at
    limit least(greatest(p_limit, 1), 500)
    for update skip locked
  )
  update public.hosted_artifacts artifacts
  set cleanup_claimed_at = now()
  from candidates
  where artifacts.id = candidates.id
  returning artifacts.*;
$$;

revoke all on function public.claim_expired_pipelab_cloud_artifacts(integer) from public, anon, authenticated;
grant execute on function public.claim_expired_pipelab_cloud_artifacts(integer) to service_role;

create or replace function public.finish_pipelab_cloud_artifact_cleanup(
  p_artifact_id uuid,
  p_result text,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  artifact public.hosted_artifacts;
begin
  select * into artifact
  from public.hosted_artifacts
  where id = p_artifact_id and pinned = false and cleanup_claimed_at is not null
  for update;

  if not found then return; end if;

  insert into public.hosted_artifact_cleanup_results (artifact_id, storage_key, result, message)
  values (artifact.id, artifact.storage_key, p_result, p_message);

  if p_result = 'deleted' then
    delete from public.hosted_artifacts where id = artifact.id;
  else
    update public.hosted_artifacts set cleanup_claimed_at = null where id = artifact.id;
  end if;
end;
$$;

revoke all on function public.finish_pipelab_cloud_artifact_cleanup(uuid, text, text) from public, anon, authenticated;
grant execute on function public.finish_pipelab_cloud_artifact_cleanup(uuid, text, text) to service_role;
