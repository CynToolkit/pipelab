import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DeleteObjectCommand, S3Client } from "https://esm.sh/@aws-sdk/client-s3@3.821.0";

const corsHeaders = { "Content-Type": "application/json" };

serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? secretKeys.default ?? "";
  if (!serviceRoleKey || request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET_NAME");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("Pipelab Cloud storage is not configured");
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const storage = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    const { data: artifacts, error: claimError } = await admin.rpc(
      "claim_expired_pipelab_cloud_artifacts",
      { p_limit: 100 },
    );
    if (claimError) throw claimError;

    let deleted = 0;
    let failed = 0;
    for (const artifact of artifacts ?? []) {
      try {
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: artifact.storage_key }));
        const { error } = await admin.rpc("finish_pipelab_cloud_artifact_cleanup", {
          p_artifact_id: artifact.id,
          p_result: "deleted",
        });
        if (error) throw error;
        deleted++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Could not clean up hosted artifact", artifact.id, message);
        await admin.rpc("finish_pipelab_cloud_artifact_cleanup", {
          p_artifact_id: artifact.id,
          p_result: "failed",
          p_message: message.slice(0, 1000),
        });
        failed++;
      }
    }

    return new Response(JSON.stringify({ deleted, failed }), { headers: corsHeaders });
  } catch (error) {
    console.error("Pipelab Cloud cleanup failed", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Cleanup failed" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
