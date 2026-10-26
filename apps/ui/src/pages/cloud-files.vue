<template>
  <main class="cloud-files-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Pipelab Cloud</p>
        <h1>Cloud files</h1>
        <p class="muted">Manage release artifacts, storage, and private share links.</p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="load">
        Refresh
      </button>
    </header>

    <p v-if="!auth.user" class="notice" role="status">
      Sign in to view your Pipelab Cloud artifacts.
    </p>
    <p v-else-if="loading && !overview" class="notice" role="status">Loading Cloud files…</p>
    <p v-else-if="error" class="notice error" role="alert">{{ error }}</p>

    <template v-if="auth.user && overview">
      <section v-if="overview.notifications.length" class="warning" aria-label="Cloud notices">
        <article v-for="notice in overview.notifications" :key="notice.id">
          <strong>Artifacts scheduled for deletion</strong>
          <p>{{ notice.message }}</p>
        </article>
      </section>

      <section class="usage-card" aria-label="Cloud storage usage">
        <div>
          <h2>Storage</h2>
          <p>
            {{ formatBytes(overview.usage.usedBytes) }} used
            <span v-if="overview.usage.quotaBytes !== null">
              of {{ formatBytes(overview.usage.quotaBytes) }}
            </span>
          </p>
        </div>
        <div
          class="usage-track"
          role="progressbar"
          aria-label="Storage used"
          :aria-valuenow="usagePercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span :style="{ width: `${usagePercent}%` }" />
        </div>
        <p v-if="overview.usage.retentionDays" class="muted">
          Unpinned history is kept for {{ overview.usage.retentionDays }} days.
        </p>
        <p v-if="overview.entitlement.status === 'grace'" class="grace-copy">
          Your paid period has ended. Existing files and share links remain available until
          {{ formatDate(overview.entitlement.graceUntil) }}. New uploads are paused.
        </p>
        <p v-else-if="overview.entitlement.status !== 'active'" class="muted">
          An active paid plan is required for new uploads and share links.
        </p>
      </section>

      <section class="artifacts-section" aria-labelledby="artifacts-heading">
        <div class="section-heading">
          <h2 id="artifacts-heading">Artifacts</h2>
          <span class="muted">{{ overview.artifacts.length }} files</span>
        </div>
        <p v-if="overview.artifacts.length === 0" class="empty-state">
          No hosted artifacts yet. Add Pipelab Cloud as a Release Destination to upload a build.
        </p>
        <article v-for="artifact in overview.artifacts" :key="artifact.id" class="artifact-card">
          <div class="artifact-main">
            <div class="artifact-title-row">
              <h3>{{ artifact.original_name }}</h3>
              <span v-if="artifact.pinned" class="pin-badge">Latest release</span>
            </div>
            <p class="muted">
              {{ artifact.artifact_output_id }} · {{ formatBytes(Number(artifact.size)) }} ·
              uploaded {{ formatDate(artifact.uploaded_at) }}
            </p>
            <p class="identity muted">
              Project {{ artifact.project_id }} · Profile {{ artifact.build_profile_id }} · Target
              {{ artifact.build_target_id }}
            </p>
            <div v-if="shareUrls[artifact.id]" class="share-link-row">
              <label class="sr-only" :for="`share-${artifact.id}`">Share link</label>
              <input :id="`share-${artifact.id}`" :value="shareUrls[artifact.id]" readonly />
              <button type="button" class="secondary-button" @click="copyShareLink(artifact.id)">
                Copy link
              </button>
            </div>
          </div>
          <div class="artifact-actions">
            <button type="button" class="secondary-button" @click="download(artifact)">
              Download
            </button>
            <button
              v-if="artifact.hasShareLink"
              type="button"
              class="secondary-button"
              @click="share(artifact)"
            >
              {{ shareUrls[artifact.id] ? "Show link" : "Get link" }}
            </button>
            <button v-else type="button" class="secondary-button" @click="share(artifact)">
              Create share link
            </button>
            <button
              v-if="artifact.hasShareLink"
              type="button"
              class="text-button"
              @click="revoke(artifact)"
            >
              Revoke link
            </button>
            <button type="button" class="danger-button" @click="remove(artifact)">Delete</button>
          </div>
        </article>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useAuth } from "@renderer/store/auth";

type Artifact = {
  id: string;
  original_name: string;
  artifact_output_id: string;
  project_id: string;
  build_profile_id: string;
  build_target_id: string;
  artifact_kind: "file" | "directory";
  size: number | string;
  uploaded_at: string;
  expires_at: string;
  pinned: boolean;
  hasShareLink: boolean;
};

type Overview = {
  artifacts: Artifact[];
  usage: { usedBytes: number; quotaBytes: number | null; retentionDays: number | null };
  entitlement: { status: string; graceUntil: string | null };
  notifications: Array<{ id: string; message: string; deadline_at: string }>;
};

const auth = useAuth();
const workerUrl = process.env.PIPELAB_CLOUD_WORKER_URL;
const overview = ref<Overview>();
const loading = ref(false);
const error = ref("");
const shareUrls = ref<Record<string, string>>({});
const usagePercent = computed(() => {
  const quota = overview.value?.usage.quotaBytes;
  if (!quota || quota <= 0) return 0;
  return Math.min(100, Math.round((overview.value!.usage.usedBytes / quota) * 100));
});

const callWorker = async (action: string, payload: Record<string, unknown> = {}) => {
  if (!workerUrl) throw new Error("Cloud files are not configured for this deployment.");
  const accessToken = await auth.getCloudAccessToken();
  if (!accessToken) throw new Error("Sign in to Pipelab Cloud to continue.");
  const response = await fetch(new URL("/", workerUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result && typeof result.error === "string"
        ? result.error
        : `Cloud request failed (${response.status}).`;
    throw new Error(message);
  }
  return result as Record<string, unknown>;
};

const load = async () => {
  if (!auth.user) {
    overview.value = undefined;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    overview.value = (await callWorker("listArtifacts")) as unknown as Overview;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Could not load Cloud files.";
  } finally {
    loading.value = false;
  }
};

const refreshAfterAction = async (action: () => Promise<void>) => {
  error.value = "";
  try {
    await action();
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Cloud action failed.";
  }
};

const download = (artifact: Artifact) =>
  refreshAfterAction(async () => {
    const result = await callWorker("getArtifactDownloadUrl", { hostedArtifactId: artifact.id });
    if (typeof result.downloadUrl !== "string")
      throw new Error("Cloud returned an invalid download URL.");
    const anchor = document.createElement("a");
    anchor.href = result.downloadUrl;
    anchor.rel = "noopener noreferrer";
    anchor.target = "_blank";
    anchor.click();
  });

const share = (artifact: Artifact) =>
  refreshAfterAction(async () => {
    const existing = await callWorker("getShareLink", { hostedArtifactId: artifact.id });
    let shareUrl = typeof existing.shareUrl === "string" ? existing.shareUrl : undefined;
    if (!shareUrl) {
      const created = await callWorker("createShareLink", { hostedArtifactId: artifact.id });
      if (typeof created.shareUrl !== "string")
        throw new Error("Cloud returned an invalid share link.");
      shareUrl = created.shareUrl;
    }
    shareUrls.value = { ...shareUrls.value, [artifact.id]: shareUrl };
  });

const copyShareLink = async (artifactId: string) => {
  const shareUrl = shareUrls.value[artifactId];
  if (!shareUrl) return;
  try {
    await navigator.clipboard.writeText(shareUrl);
    error.value = "Share link copied.";
  } catch {
    error.value = "Clipboard access is unavailable. Select and copy the share link.";
  }
};

const revoke = (artifact: Artifact) =>
  refreshAfterAction(async () => {
    await callWorker("revokeShareLink", { hostedArtifactId: artifact.id });
    const next = { ...shareUrls.value };
    delete next[artifact.id];
    shareUrls.value = next;
  });

const remove = (artifact: Artifact) => {
  if (
    !window.confirm(`Delete “${artifact.original_name}” from Pipelab Cloud? This cannot be undone.`)
  )
    return;
  return refreshAfterAction(async () => {
    await callWorker("deleteArtifact", { hostedArtifactId: artifact.id });
  });
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDate = (value: string | null) => {
  if (!value) return "an unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "an unknown date" : date.toLocaleDateString();
};

onMounted(() => void load());
watch(
  () => auth.user?.id,
  () => {
    shareUrls.value = {};
    void load();
  },
);
</script>

<style scoped>
.cloud-files-page {
  max-width: 1040px;
  margin: 0 auto;
  padding: 2rem;
  color: var(--text-color, #f5f5f5);
}
.page-header,
.section-heading,
.artifact-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.page-header {
  margin-bottom: 1.5rem;
}
h1,
h2,
h3,
p {
  margin-top: 0;
}
h1 {
  margin-bottom: 0.5rem;
  font-size: 1.8rem;
}
h2 {
  margin-bottom: 0.5rem;
  font-size: 1.1rem;
}
h3 {
  margin: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}
.eyebrow {
  margin-bottom: 0.4rem;
  color: var(--primary-color, #75a7ff);
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.muted {
  color: var(--text-color-secondary, #a1a1aa);
  font-size: 0.9rem;
}
.notice,
.warning,
.usage-card,
.artifact-card,
.empty-state {
  border: 1px solid var(--surface-border, #3f3f46);
  border-radius: 12px;
  background: var(--surface-card, #18181b);
}
.notice,
.warning {
  margin: 1rem 0;
  padding: 1rem;
}
.error {
  color: #fca5a5;
}
.warning {
  border-color: #b45309;
  background: #451a03;
  color: #fde68a;
}
.warning p {
  margin: 0.35rem 0 0;
}
.usage-card {
  margin-bottom: 1.5rem;
  padding: 1.2rem;
}
.usage-card > p:last-child {
  margin-bottom: 0;
}
.usage-track {
  height: 9px;
  margin: 1rem 0 0.6rem;
  overflow: hidden;
  border-radius: 99px;
  background: var(--surface-300, #3f3f46);
}
.usage-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary-color, #60a5fa);
}
.grace-copy {
  margin: 0.75rem 0 0;
  color: #fbbf24;
}
.section-heading {
  margin: 1.5rem 0 0.8rem;
}
.section-heading h2 {
  margin: 0;
}
.empty-state {
  padding: 1.2rem;
  color: var(--text-color-secondary, #a1a1aa);
}
.artifact-card {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
  padding: 1rem;
}
.artifact-main {
  min-width: 0;
}
.artifact-main p {
  margin: 0.45rem 0 0;
}
.identity {
  overflow-wrap: anywhere;
}
.pin-badge {
  flex: none;
  border-radius: 99px;
  padding: 0.2rem 0.55rem;
  background: #172554;
  color: #bfdbfe;
  font-size: 0.75rem;
}
.artifact-actions {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  justify-content: flex-end;
  gap: 0.5rem;
}
.secondary-button,
.danger-button,
.text-button {
  min-height: 36px;
  border: 1px solid var(--surface-border, #52525b);
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  background: var(--surface-ground, #27272a);
  color: inherit;
  cursor: pointer;
}
.secondary-button:hover {
  border-color: var(--primary-color, #60a5fa);
}
.secondary-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.danger-button {
  border-color: #7f1d1d;
  color: #fecaca;
}
.text-button {
  border: 0;
  background: transparent;
  color: #fca5a5;
}
.share-link-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.8rem;
}
.share-link-row input {
  min-width: 180px;
  flex: 1;
  border: 1px solid var(--surface-border, #52525b);
  border-radius: 8px;
  padding: 0.5rem;
  background: var(--surface-ground, #27272a);
  color: inherit;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 720px) {
  .cloud-files-page {
    padding: 1rem;
  }
  .artifact-card {
    flex-direction: column;
  }
  .artifact-actions {
    justify-content: flex-start;
  }
  .page-header {
    align-items: flex-start;
  }
}
</style>
