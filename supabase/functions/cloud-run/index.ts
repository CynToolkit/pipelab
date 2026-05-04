import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AzureProvider } from "npm:@pipelab/cloud-azure";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { pipeline, options } = await req.json();

    // Azure Configuration from environment variables (managed by developer)
    const azureProvider = new AzureProvider({
      subscriptionId: Deno.env.get("AZURE_SUBSCRIPTION_ID")!,
      resourceGroup: Deno.env.get("AZURE_RESOURCE_GROUP")!,
      location: Deno.env.get("AZURE_LOCATION")!,
      storageAccountName: Deno.env.get("AZURE_STORAGE_ACCOUNT_NAME")!,
      storageAccountKey: Deno.env.get("AZURE_STORAGE_ACCOUNT_KEY")!,
      fileShareName: Deno.env.get("AZURE_FILE_SHARE_NAME")!,
      image: Deno.env.get("PIPELAB_CLI_IMAGE")!,
    });

    // 1. Create run record in DB
    const { data: run, error: runError } = await supabaseClient
      .from("cloud_runs")
      .insert({
        user_id: user.id,
        provider_id: azureProvider.id,
        status: "initializing",
      })
      .select()
      .single();

    if (runError) throw runError;

    // 2. Start ACI
    const cloudRun = await azureProvider.run(pipeline, {
      ...options,
      cloudRunId: run.id,
    });

    // 3. Update status
    await supabaseClient
      .from("cloud_runs")
      .update({ status: "running", provider_run_id: cloudRun.id })
      .eq("id", run.id);

    // 4. Start log polling worker (background)
    // In a real Edge Function, we might trigger another function or a queue
    // For now, we'll return the run info
    
    return new Response(JSON.stringify({ runId: run.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
