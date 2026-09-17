-- Before running this once, add these two named secrets in Supabase Vault:
--   pipelab_cloud_project_url        = https://<project-ref>.supabase.co
--   pipelab_cloud_service_role_key   = the project's service_role key
-- Then run this SQL in the Supabase SQL editor. The job invokes cleanup hourly.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'pipelab-cloud-artifact-cleanup',
  '17 * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'pipelab_cloud_project_url'
      ) || '/functions/v1/pipelab-cloud-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'pipelab_cloud_service_role_key'
        ),
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'pipelab_cloud_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);
