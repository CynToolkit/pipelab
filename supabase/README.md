# Pipelab Cloud artifact storage

Cloud artifacts are uploaded directly from the local workflow runner to Cloudflare R2 using short-lived signed URLs. Files up to 5 GiB use a single PUT; larger files use multipart upload (up to R2's 5 TiB object limit). R2 credentials stay in Supabase Edge Function secrets; the desktop stores only its normal Supabase auth session. `hosted_artifacts` metadata is owned by the signed-in user and is written only after R2 confirms the uploaded object.

## Deploy

1. Configure these Supabase Edge Function secrets:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `SUPABASE_SERVICE_ROLE_KEY` (if not supplied automatically by the project)
   The R2 token should have object read/write access scoped to the artifact bucket.
2. Apply `migrations/20260916000000_pipelab_cloud_artifacts.sql` and deploy the `pipelab-cloud-artifacts` and `pipelab-cloud-cleanup` functions.
3. Add these named secrets in Supabase Vault:
   - `pipelab_cloud_project_url`: `https://<project-ref>.supabase.co`
   - `pipelab_cloud_service_role_key`: the project's service-role key
4. Run `cron/pipelab-cloud-artifact-cleanup.sql` once in the Supabase SQL editor. It schedules cleanup hourly. Check Supabase Cron run history after deployment.

Unpinned metadata expires seven days after upload. Cleanup claims only expired, unpinned records; an R2 deletion failure is recorded and retried on a later run. New uploads pin the latest artifact per signed-in user and artifact output, and move the previous pin to normal retention.
