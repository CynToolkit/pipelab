begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid in (
     'public.hosted_artifacts'::regclass,
     'public.hosted_artifact_share_links'::regclass,
     'public.hosted_artifact_upload_reservations'::regclass,
     'public.hosted_artifact_cleanup_results'::regclass,
     'public.pipelab_cloud_account_state'::regclass,
     'public.pipelab_cloud_notifications'::regclass,
     'public.pipelab_cloud_plan_limits'::regclass
   )),
  'RLS is enabled on all Cloud artifact and account tables'
);

select ok(
  not has_table_privilege('anon', 'public.hosted_artifacts', 'select'),
  'anonymous clients cannot read hosted artifact metadata'
);

select ok(
  not has_table_privilege('authenticated', 'public.hosted_artifacts', 'select'),
  'authenticated clients cannot read server-owned artifact metadata'
);

select ok(
  not has_column_privilege('authenticated', 'public.hosted_artifacts', 'storage_key', 'select'),
  'authenticated clients cannot read private object keys'
);

select ok(
  not has_table_privilege('authenticated', 'public.hosted_artifact_share_links', 'select'),
  'authenticated clients cannot read server-owned share-link metadata'
);

select ok(
  has_table_privilege('service_role', 'public.hosted_artifacts', 'select'),
  'the server role can read artifact metadata for owner-filtered requests'
);

select * from finish();

rollback;
