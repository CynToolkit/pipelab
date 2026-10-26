begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password)
values
  ('00000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated', 'verified@example.com', ''),
  ('00000000-0000-4000-8000-000000000202', 'authenticated', 'authenticated', 'unverified@example.com', ''),
  ('00000000-0000-4000-8000-000000000203', 'authenticated', 'authenticated', 'warning@example.com', '');

insert into public.pipelab_cloud_account_state (user_id, entitlement_status, grace_until)
values
  ('00000000-0000-4000-8000-000000000201', 'grace', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000202', 'grace', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000203', 'grace', now() + interval '6 days');

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

select is(
  (select count(*)::integer from public.claim_pipelab_cloud_deletion_warnings()),
  0,
  'an acknowledged warning is no longer eligible for another email'
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
