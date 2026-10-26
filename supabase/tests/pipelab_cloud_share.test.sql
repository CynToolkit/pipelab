begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password)
values (
  '00000000-0000-4000-8000-000000000502',
  'authenticated',
  'authenticated',
  'cloud-share@example.com',
  ''
);

select lives_ok(
  $$insert into public.hosted_artifacts (
    id, user_id, artifact_id, artifact_output_id, version, size, checksum,
    storage_key, expires_at, pinned, project_id, build_profile_id, build_target_id
  ) values (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000502',
    'shared-immutable-version', 'web.html5', '1.0.0', 10, repeat('a', 64),
    'share-test/artifact', now() + interval '30 days', true,
    'share-project', 'share-profile', 'web'
  )$$,
  'a successfully uploaded immutable artifact can be shared'
);

select lives_ok(
  $$insert into public.hosted_artifact_share_links (
    user_id, artifact_id, token_hash, encrypted_token
  ) values (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000502',
    repeat('a', 64), 'encrypted-share-token-one'
  )$$,
  'an owner can have one active link for an artifact'
);

select throws_ok(
  $$insert into public.hosted_artifact_share_links (
    user_id, artifact_id, token_hash, encrypted_token
  ) values (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000502',
    repeat('b', 64), 'encrypted-share-token-two'
  )$$,
  '23505',
  null,
  'a second active link for the same artifact is rejected'
);

select lives_ok(
  $$update public.hosted_artifact_share_links
    set revoked_at = now()
    where user_id = '00000000-0000-4000-8000-000000000502'
      and artifact_id = '00000000-0000-4000-8000-000000000502'
      and revoked_at is null$$,
  'the owner can revoke the active immutable link'
);

select lives_ok(
  $$insert into public.hosted_artifact_share_links (
    user_id, artifact_id, token_hash, encrypted_token
  ) values (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000502',
    repeat('c', 64), 'encrypted-share-token-replacement'
  )$$,
  'a replacement link can be issued after revocation'
);

select is(
  (select count(*)::integer
   from public.hosted_artifact_share_links
   where artifact_id = '00000000-0000-4000-8000-000000000502'
     and revoked_at is null),
  1,
  'only one active link remains after replacement'
);

select is(
  (select artifact_id
   from public.hosted_artifact_share_links
   where token_hash = repeat('c', 64)),
  '00000000-0000-4000-8000-000000000502'::uuid,
  'replacement links remain bound to the same immutable artifact'
);

select * from finish();

rollback;
