begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

insert into auth.users (id, aud, role, email, encrypted_password)
values
  ('00000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated', 'verified@example.com', ''),
  ('00000000-0000-4000-8000-000000000202', 'authenticated', 'authenticated', 'unverified@example.com', ''),
  ('00000000-0000-4000-8000-000000000203', 'authenticated', 'authenticated', 'warning@example.com', ''),
  ('00000000-0000-4000-8000-000000000204', 'authenticated', 'authenticated', 'pending-cancel@example.com', ''),
  ('00000000-0000-4000-8000-000000000205', 'authenticated', 'authenticated', 'reactivated@example.com', '');

insert into public.pipelab_cloud_account_state (user_id, entitlement_status, grace_until)
values
  ('00000000-0000-4000-8000-000000000201', 'grace', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000202', 'grace', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000203', 'grace', now() + interval '6 days');

insert into public.hosted_artifacts (
  user_id,
  artifact_id,
  artifact_output_id,
  version,
  size,
  checksum,
  storage_key,
  expires_at,
  pinned,
  project_id,
  build_profile_id,
  build_target_id
) values (
  '00000000-0000-4000-8000-000000000201',
  'post-grace-cleanup',
  'web.html5',
  '1.0.0',
  1,
  repeat('a', 64),
  'post-grace-cleanup/artifact',
  now() + interval '30 days',
  true,
  'cleanup-project',
  'cleanup-profile',
  'web'
);

insert into public.hosted_artifact_share_links (
  user_id,
  artifact_id,
  token_hash,
  encrypted_token
)
select
  '00000000-0000-4000-8000-000000000201',
  id,
  repeat('1', 64),
  'encrypted-local-test-token'
from public.hosted_artifacts
where artifact_id = 'post-grace-cleanup';

select lives_ok(
  $$select * from public.claim_expired_pipelab_cloud_artifacts(
    100,
    array['00000000-0000-4000-8000-000000000201']::uuid[]
  )$$,
  'the expiry cleanup RPC accepts the successfully reconciled account batch'
);

select is(
  (select entitlement_status from public.pipelab_cloud_account_state where user_id = '00000000-0000-4000-8000-000000000201'),
  'deleting',
  'an expired account included in the verified reconciliation batch becomes eligible for deletion'
);

select is(
  (select entitlement_status from public.pipelab_cloud_account_state where user_id = '00000000-0000-4000-8000-000000000202'),
  'grace',
  'an expired account outside the verified batch stays in grace'
);

select ok(
  (select not pinned and deletion_requested_at is not null
   from public.hosted_artifacts
   where artifact_id = 'post-grace-cleanup'),
  'post-grace cleanup marks artifacts for deletion and removes latest protection'
);

select ok(
  (select revoked_at is not null
   from public.hosted_artifact_share_links
   where token_hash = repeat('1', 64)),
  'post-grace cleanup invalidates links before deleting their artifact'
);

select lives_ok(
  $$select public.finish_pipelab_cloud_artifact_cleanup(
    (select id from public.hosted_artifacts where artifact_id = 'post-grace-cleanup'),
    'deleted'
  )$$,
  'successful post-grace object cleanup removes its metadata'
);

select ok(
  not exists (select 1 from public.hosted_artifacts where artifact_id = 'post-grace-cleanup')
  and not exists (select 1 from public.hosted_artifact_share_links where token_hash = repeat('1', 64)),
  'deleted artifact metadata and its share link are both unavailable'
);

select is(
  (select count(*)::integer from public.claim_pipelab_cloud_deletion_warnings()),
  1,
  'a due warning can be claimed once'
);

select ok(
  (select warning_email_claimed_at is not null and warning_email_sent_at is null
   from public.pipelab_cloud_account_state
   where user_id = '00000000-0000-4000-8000-000000000203'),
  'claiming a warning leases it without marking it delivered'
);

select lives_ok(
  $$select public.release_pipelab_cloud_deletion_warning('00000000-0000-4000-8000-000000000203')$$,
  'releasing a failed warning clears its lease'
);

select is(
  (select count(*)::integer from public.claim_pipelab_cloud_deletion_warnings()),
  1,
  'a released warning can be claimed again'
);

select lives_ok(
  $$select public.complete_pipelab_cloud_deletion_warning('00000000-0000-4000-8000-000000000203')$$,
  'acknowledging a sent warning completes its lease'
);

select ok(
  (select warning_email_claimed_at is null and warning_email_sent_at is not null
   from public.pipelab_cloud_account_state
   where user_id = '00000000-0000-4000-8000-000000000203'),
  'acknowledging a delivered warning records it and clears the lease'
);

select ok(
  (select message like '%Renew your plan%' and message like '%download your artifacts before the deadline%'
   from public.pipelab_cloud_notifications
   where user_id = '00000000-0000-4000-8000-000000000203'),
  'the in-app warning states the deletion deadline and renewal or download options'
);

select is(
  (select count(*)::integer from public.claim_pipelab_cloud_deletion_warnings()),
  0,
  'an acknowledged warning is no longer eligible for another email'
);

select lives_ok(
  $$select public.set_pipelab_cloud_expired_entitlement(
    '00000000-0000-4000-8000-000000000204', 'plan-basic', 100, 30, now() + interval '10 days'
  )$$,
  'a cancellation with paid time remaining can be reconciled'
);

select is(
  (select entitlement_status from public.pipelab_cloud_account_state where user_id = '00000000-0000-4000-8000-000000000204'),
  'active',
  'a cancellation does not start grace or interrupt access before paid-through time'
);

select ok(
  (select grace_until = paid_through_at + interval '30 days'
   from public.pipelab_cloud_account_state
   where user_id = '00000000-0000-4000-8000-000000000204'),
  'the deletion deadline remains 30 days after the paid-through date'
);

select lives_ok(
  $$select public.set_pipelab_cloud_active_entitlement(
    '00000000-0000-4000-8000-000000000205', 'plan-basic', 100, 30, now() - interval '1 second'
  )$$,
  'a paid entitlement can be tracked before its expiry transition'
);

select is(
  public.start_pipelab_cloud_grace_periods(),
  1,
  'only an account whose paid-through time has ended starts grace'
);

select is(
  (select entitlement_status from public.pipelab_cloud_account_state where user_id = '00000000-0000-4000-8000-000000000205'),
  'grace',
  'the account enters grace after paid-through time ends'
);

select ok(
  (select grace_until = paid_through_at + interval '30 days'
   from public.pipelab_cloud_account_state
   where user_id = '00000000-0000-4000-8000-000000000205'),
  'grace lasts 30 days from paid-through time'
);

insert into public.pipelab_cloud_notifications (user_id, kind, deadline_at, message)
values (
  '00000000-0000-4000-8000-000000000205',
  'artifact_deletion_warning',
  now() + interval '29 days',
  'Renew or download before the deadline.'
);

select lives_ok(
  $$select public.set_pipelab_cloud_active_entitlement(
    '00000000-0000-4000-8000-000000000205', 'plan-basic', 100, 30, now() + interval '30 days'
  )$$,
  'renewal during grace restores paid access'
);

select is(
  (select entitlement_status from public.pipelab_cloud_account_state where user_id = '00000000-0000-4000-8000-000000000205'),
  'active',
  'reactivation returns the account to active'
);

select ok(
  (select grace_until is null and warning_email_sent_at is null and warning_email_claimed_at is null
   from public.pipelab_cloud_account_state
   where user_id = '00000000-0000-4000-8000-000000000205'),
  'reactivation clears grace and pending warning state'
);

select ok(
  (select resolved_at is not null
   from public.pipelab_cloud_notifications
   where user_id = '00000000-0000-4000-8000-000000000205'),
  'reactivation resolves the pending deletion notice'
);

insert into auth.users (id, aud, role, email, encrypted_password)
select
  ('00000000-0000-4000-8000-' || lpad(account_number::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'batch-' || account_number || '@example.com',
  ''
from generate_series(300, 400) as account_number;

insert into public.pipelab_cloud_account_state (user_id, entitlement_status, grace_until)
select
  ('00000000-0000-4000-8000-' || lpad(account_number::text, 12, '0'))::uuid,
  'grace',
  now() - interval '1 hour'
from generate_series(300, 400) as account_number;

insert into public.hosted_artifacts (
  user_id,
  artifact_id,
  artifact_output_id,
  version,
  size,
  checksum,
  storage_key,
  expires_at,
  pinned
) values (
  '00000000-0000-4000-8000-000000000400',
  'renewed-outside-batch',
  'web.html5',
  '1.0.0',
  1,
  repeat('a', 64),
  'renewed-outside-batch/artifact',
  now() + interval '7 days',
  true
);

select lives_ok(
  $$select * from public.claim_expired_pipelab_cloud_artifacts(
    100,
    array(
      select ('00000000-0000-4000-8000-' || lpad(account_number::text, 12, '0'))::uuid
      from generate_series(300, 399) as account_number
    )
  )$$,
  'expiry cleanup accepts a 100-account verification batch with another renewed account outside it'
);

select is(
  (select entitlement_status from public.pipelab_cloud_account_state where user_id = '00000000-0000-4000-8000-000000000400'),
  'grace',
  'an expired grace row outside the verification batch is not transitioned based on stale entitlement data'
);

select ok(
  (select pinned and deletion_requested_at is null
   from public.hosted_artifacts
   where user_id = '00000000-0000-4000-8000-000000000400'),
  'artifacts for the out-of-batch renewed account remain pinned and eligible for retention'
);

select * from finish();

rollback;
