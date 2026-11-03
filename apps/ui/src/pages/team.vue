<template>
  <main class="team-page">
    <header class="team-header">
      <p class="eyebrow">{{ $t("home.project") }}</p>
      <h1>Team</h1>
      <p class="description">Invite teammates and share workflows, connections, and releases.</p>
    </header>
    <div class="coming-soon" role="status">
      <i class="mdi mdi-account-group-outline" aria-hidden="true" />
      <h2>Team collaboration is coming soon</h2>
      <p>For now, workflows and connections belong to your own account.</p>
      <RouterLink class="back-link" to="/dashboard">Back to dashboard</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.team-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: min(100%, 1480px);
  margin: 0 auto;
  padding: 38px 44px 48px;
}

.team-header {
  padding-bottom: 26px;
  border-bottom: 1px solid var(--p-surface-200);

  :root.dark & {
    border-bottom-color: var(--p-surface-800);
  }
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.04em;
}

.description {
  margin: 8px 0 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 56px 24px;
  border: 1px dashed var(--p-surface-300);
  border-radius: 12px;
  text-align: center;

  :root.dark & {
    border-color: var(--p-surface-700);
  }

  i {
    color: var(--p-text-muted-color);
    font-size: 2rem;
    opacity: 0.7;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.1rem;
  }

  p {
    color: var(--p-text-muted-color);
    font-size: 0.875rem;
  }
}

.back-link {
  margin-top: 8px;
  color: var(--p-text-color);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>
