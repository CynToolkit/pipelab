begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  '00000000-0000-4000-8000-000000000501',
  'authenticated',
  'authenticated',
  'cloud-quota@example.com',
  ''
);

select lives_ok(
  $$select public.reserve_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501', 'quota/first', 'quota-first',
    'electron.windows', 'project-one', 'profile-one', 'windows-x64',
    '1.0.0', 'first.zip', 'file', 60, repeat('a', 64), 100, 30
  )$$,
  'the first project reserves bytes from the subscription-wide quota'
);

select lives_ok(
  $$select public.reserve_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501', 'quota/second', 'quota-second',
    'electron.windows', 'project-two', 'profile-two', 'windows-x64',
    '1.0.0', 'second.zip', 'file', 40, repeat('b', 64), 100, 30
  )$$,
  'another project can reserve the remaining pooled quota'
);

select throws_ok(
  $$select public.reserve_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501', 'quota/third', 'quota-third',
    'electron.windows', 'project-three', 'profile-three', 'windows-x64',
    '1.0.0', 'third.zip', 'file', 1, repeat('c', 64), 100, 30
  )$$,
  'P0001',
  'pipelab_cloud_quota_exceeded',
  'a reservation that crosses the pooled quota is rejected'
);

select is(
  (select sum(size)::bigint
   from public.hosted_artifact_upload_reservations
   where user_id = '00000000-0000-4000-8000-000000000501'),
  100::bigint,
  'active reservations count against the subscription-wide quota'
);

select lives_ok(
  $$select public.release_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501',
    (select id from public.hosted_artifact_upload_reservations where artifact_id = 'quota-first')
  )$$,
  'the first quota reservation can be released'
);

select lives_ok(
  $$select public.release_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501',
    (select id from public.hosted_artifact_upload_reservations where artifact_id = 'quota-second')
  )$$,
  'the second quota reservation can be released'
);

select lives_ok(
  $$select public.reserve_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501', 'identity/first', 'identity-first',
    'electron.windows', 'stable-project', 'stable-profile', 'windows-x64',
    '1.0.0', 'first-build.zip', 'file', 40, repeat('d', 64), 100, 30
  )$$,
  'the first artifact for a stable project-profile-target identity is reserved'
);

select lives_ok(
  $$select public.commit_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501',
    (select id from public.hosted_artifact_upload_reservations where artifact_id = 'identity-first'),
    40, 100, 30
  )$$,
  'actual stored bytes are committed under the configured 30-day retention'
);

select ok(
  (select pinned from public.hosted_artifacts where artifact_id = 'identity-first'),
  'the first successful artifact is pinned'
);

select lives_ok(
  $$select public.reserve_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501', 'identity/failed-replacement', 'identity-failed',
    'electron.windows', 'stable-project', 'stable-profile', 'windows-x64',
    '1.1.0', 'failed-build.zip', 'file', 50, repeat('e', 64), 100, 30
  )$$,
  'a replacement upload reserves quota without changing the current pin'
);

select throws_ok(
  $$select public.commit_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501',
    (select id from public.hosted_artifact_upload_reservations where artifact_id = 'identity-failed'),
    49, 100, 30
  )$$,
  '22023',
  'pipelab_cloud_upload_reservation_invalid',
  'a replacement with different actual bytes is rejected'
);

select ok(
  (select pinned from public.hosted_artifacts where artifact_id = 'identity-first'),
  'a failed replacement never demotes the previous pinned artifact'
);

select lives_ok(
  $$select public.release_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501',
    (select id from public.hosted_artifact_upload_reservations where artifact_id = 'identity-failed')
  )$$,
  'an incomplete replacement reservation can be released'
);

select lives_ok(
  $$select public.reserve_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501', 'identity/replacement', 'identity-replacement',
    'electron.windows', 'stable-project', 'stable-profile', 'windows-x64',
    '1.1.0', 'replacement-build.zip', 'file', 60, repeat('f', 64), 100, 30
  )$$,
  'a complete replacement can reserve remaining pooled quota while the old pin remains stored'
);

select lives_ok(
  $$select public.commit_pipelab_cloud_artifact_upload(
    '00000000-0000-4000-8000-000000000501',
    (select id from public.hosted_artifact_upload_reservations where artifact_id = 'identity-replacement'),
    60, 100, 30
  )$$,
  'the replacement commits atomically after its bytes are verified'
);

select is(
  (select count(*)::integer
   from public.hosted_artifacts
   where user_id = '00000000-0000-4000-8000-000000000501'
     and project_id = 'stable-project'
     and build_profile_id = 'stable-profile'
     and build_target_id = 'windows-x64'
     and pinned),
  1,
  'exactly one successful artifact is pinned for each stable project-profile-target identity'
);

select is(
  (select sum(size)::bigint
   from public.hosted_artifacts
   where user_id = '00000000-0000-4000-8000-000000000501'),
  100::bigint,
  'pinned and historical artifacts both remain quota-metered'
);

select ok(
  (select not pinned and expires_at = uploaded_at + interval '30 days'
   from public.hosted_artifacts
   where artifact_id = 'identity-first'),
  'replacing an artifact applies normal historical retention from its original upload time'
);

update public.hosted_artifacts
set expires_at = now() - interval '1 second'
where artifact_id = 'identity-first';

select is(
  (select count(*)::integer
   from public.claim_expired_pipelab_cloud_artifacts(100, '{}'::uuid[])
   where artifact_id = 'identity-first'),
  1,
  'expired historical artifacts are eligible for cleanup'
);

select * from finish();

rollback;
