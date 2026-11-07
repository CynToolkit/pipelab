<template>
  <WorkflowShell
    v-if="!dashboardMode"
    :flow-id="flowId"
    :project-id="projectId"
    :title="flow?.name || 'Release'"
    active="configuration"
  >
    <template #actions>
      <span
        v-if="flow"
        class="workflow-readiness"
        :class="`state-${workflowReadinessState}`"
        role="status"
      >
        <i :class="workflowReadinessIcon" aria-hidden="true" />{{ workflowReadinessLabel }}
      </span>
      <span v-if="flow" class="autosave-state" :class="`state-${saveState}`"
        ><i
          :class="
            saveState === 'saving'
              ? 'pi pi-spin pi-spinner'
              : saveState === 'error'
                ? 'pi pi-exclamation-circle'
                : 'pi pi-check-circle'
          "
        />
        {{ saveStateLabel }}</span
      >
      <Button
        v-if="flow && plan?.graph.nodes.length"
        v-tooltip.top="'View resolved plan'"
        icon="pi pi-sitemap"
        text
        rounded
        severity="secondary"
        aria-label="View resolved plan"
        @click="planExpanded = true"
      />
      <Button
        class="ship-button"
        label="Ship"
        icon="mdi mdi-rocket-launch-outline"
        :loading="running"
        :disabled="!canShip"
        @click="ship"
      />
    </template>
    <div
      v-if="workflowLoading || sourceInspectionPending || planning"
      class="readiness-progress"
      role="status"
      aria-live="polite"
    >
      <span v-if="workflowLoading"><i class="pi pi-spin pi-spinner" /> Loading workflow…</span>
      <span v-if="sourceInspectionPending"
        ><i class="pi pi-spin pi-spinner" /> Inspecting source…</span
      >
      <span v-if="planning"><i class="pi pi-spin pi-spinner" /> Planning release…</span>
    </div>
    <main v-if="flow" class="release-page pl-workflow">
      <Message v-if="loadError" severity="error" role="alert">
        <div class="planner-error">
          <span>{{ loadError }}</span>
          <Button
            label="Retry loading workflow"
            text
            size="small"
            :disabled="!agent.isReady.value"
            @click="loadWorkflow"
          />
        </div>
      </Message>
      <Message v-if="error" severity="error" role="alert">{{ error }}</Message>
      <Message v-if="plannerError" severity="error" role="alert">
        <div class="planner-error">
          <span>Workflow readiness is unavailable: {{ plannerError }}</span>
          <Button label="Retry planning" text size="small" @click="refreshPlan" />
        </div>
      </Message>
      <Message v-if="knownFieldIssues.length" severity="warn" role="status">
        Required-field checks are static hints. Agent inspection, default resolution, and planning
        determine workflow readiness.
      </Message>
      <Message v-if="saveError" severity="error" role="alert">
        <div class="planner-error">
          <span>{{ saveError }}</span>
          <Button label="Retry save" text size="small" @click="save().catch(() => {})" />
        </div>
      </Message>
      <section v-if="selectedBlocker" class="action-required-card" aria-live="polite">
        <div class="blocker-icon" aria-hidden="true">
          <i class="pi pi-exclamation-circle" />
        </div>
        <div class="blocker-copy">
          <span class="eyebrow"
            >Action required
            <span class="blocker-count" aria-live="polite"
              >{{ activeBlockerIndex + 1 }} of {{ blockingIssues.length }}</span
            ></span
          >
          <strong>{{ blockerPresentation.title }}</strong>
          <span>{{ blockerPresentation.description }}</span>
        </div>
        <div class="blocker-actions">
          <div v-if="blockingIssues.length > 1" class="blocker-navigation">
            <Button
              icon="pi pi-chevron-left"
              text
              rounded
              size="small"
              severity="secondary"
              aria-label="Previous blocker"
              :disabled="activeBlockerIndex === 0"
              @click="moveBlocker(-1)"
            />
            <Button
              icon="pi pi-chevron-right"
              text
              rounded
              size="small"
              severity="secondary"
              aria-label="Next blocker"
              :disabled="activeBlockerIndex >= blockingIssues.length - 1"
              @click="moveBlocker(1)"
            />
          </div>
          <Button
            class="blocker-repair-button"
            size="small"
            :label="blockerPresentation.actionLabel"
            @click="repairSelectedBlocker"
          />
        </div>
      </section>
      <section class="release-section">
        <div class="section-heading">
          <div>
            <h2>Source</h2>
          </div>
        </div>
        <article class="source-card" :class="{ invalid: cardIssues('source').length }">
          <div class="provider-icon">
            <img
              v-if="providerIconImage(sourceIconFor(sourceDefinition))"
              :src="providerIconImage(sourceIconFor(sourceDefinition))"
              alt=""
            />
            <i
              v-else
              :class="providerIconClass(sourceIconFor(sourceDefinition))"
              aria-hidden="true"
            />
          </div>
          <div class="source-copy">
            <strong>{{ sourceDefinition?.label || flow.source.provider }}</strong>
            <span>{{ sourcePath || "No source selected" }}</span>
          </div>
          <ReleaseStatus
            :label="
              cardIssues('source').length
                ? 'Needs attention'
                : sourcePath
                  ? 'Ready'
                  : 'Not configured'
            "
          />
          <Button
            text
            rounded
            size="small"
            severity="secondary"
            icon="pi pi-pencil"
            v-tooltip.top="'Edit source'"
            aria-label="Edit source"
            @click="sourceSettingsVisible = true"
          />
        </article>
      </section>
      <section class="release-section">
        <div class="section-heading">
          <div>
            <h2>
              Destinations<span v-if="flow.destinations.length" class="section-count">{{
                flow.destinations.length
              }}</span>
            </h2>
          </div>
          <Button
            label="Add destination"
            icon="pi pi-plus"
            outlined
            size="small"
            severity="secondary"
            @click="addDestinationVisible = true"
          />
        </div>
        <div v-if="!flow.destinations.length" class="empty-card">
          <i class="mdi mdi-cloud-upload-outline" /><strong>No destinations yet</strong>
          <span>Add a destination when you are ready to ship this release.</span>
        </div>
        <article
          v-for="(destination, index) in flow.destinations"
          :key="destination.id"
          class="job-card"
          :class="{
            disabled: !destination.enabled,
            invalid: cardIssues(`destinations.${index}`).length,
          }"
        >
          <div class="job-header">
            <div class="provider-icon">
              <img
                v-if="
                  providerIconImage(
                    destinationIconFor(
                      destination.provider,
                      destinationDefinition(destination.provider)?.icon,
                    ),
                  )
                "
                :src="
                  providerIconImage(
                    destinationIconFor(
                      destination.provider,
                      destinationDefinition(destination.provider)?.icon,
                    ),
                  )
                "
                alt=""
              />
              <i
                v-else
                :class="
                  providerIconClass(
                    destinationIconFor(
                      destination.provider,
                      destinationDefinition(destination.provider)?.icon,
                    ),
                  )
                "
                aria-hidden="true"
              />
            </div>
            <div class="job-title">
              <strong>{{ destinationDisplayLabel(destination) }}</strong
              ><span>{{ destinationSummary(destination) }}</span>
            </div>
            <ReleaseStatus :label="destinationReadiness(destination, index)" />
            <Button
              text
              rounded
              size="small"
              severity="secondary"
              icon="pi pi-pencil"
              v-tooltip.top="'Edit destination settings'"
              :aria-label="`Edit ${destinationDisplayLabel(destination)}`"
              @click="openDestinationSettings(destination)"
            />
            <Button
              v-if="destination.enabled"
              class="destination-toggle"
              v-tooltip.top="
                isDestinationExpanded(destination.id) ? 'Hide deployments' : 'Show deployments'
              "
              text
              rounded
              severity="secondary"
              size="small"
              :icon="
                isDestinationExpanded(destination.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'
              "
              :aria-expanded="isDestinationExpanded(destination.id)"
              :aria-controls="`destination-slots-${destination.id}`"
              :aria-label="`${isDestinationExpanded(destination.id) ? 'Hide' : 'Show'} deployments for ${destinationDisplayLabel(destination)}`"
              @click="toggleDestinationExpanded(destination.id)"
            />
          </div>
          <div
            v-if="destination.enabled && isDestinationExpanded(destination.id)"
            :id="`destination-slots-${destination.id}`"
            class="slot-list"
          >
            <div v-for="(slot, slotIndex) in destination.slots" :key="slot.id" class="slot-row">
              <div class="deployment-main">
                <i class="mdi mdi-package-variant-closed" /><span
                  ><strong>{{ deploymentSlotLabel(slot, slotIndex) }}</strong
                  ><small>{{ artifactLabel(slot.input) }}</small></span
                >
              </div>
              <ReleaseStatus
                :label="
                  slotCardIssues(slot).length
                    ? 'Needs attention'
                    : slot.input
                      ? 'Ready'
                      : 'Output required'
                "
              />
              <Select
                v-if="!slot.input || slotIssues(slot).length"
                :key="`${slot.id}:${outputPickerResets}`"
                class="slot-output-select"
                size="small"
                :model-value="releaseOutputRefValue(slot.input)"
                :options="slotOutputChoices"
                optionLabel="label"
                optionValue="value"
                placeholder="Choose output"
                :aria-label="`Output for ${deploymentSlotLabel(slot, slotIndex)}`"
                @update:model-value="chooseSlotOutput(destination, slot, $event)"
              />
              <Button
                text
                rounded
                severity="secondary"
                size="small"
                icon="pi pi-pencil"
                v-tooltip.top="'Edit deployment settings'"
                :aria-label="`Edit ${deploymentSlotLabel(slot, slotIndex)}`"
                @click="openSlotSettings(destination, slot)"
              />
            </div>
            <Button
              label="Add deployment"
              icon="pi pi-plus"
              text
              severity="secondary"
              size="small"
              class="add-slot"
              @click="addSlot(destination)"
            />
          </div>
        </article>
      </section>
      <section v-if="planExpanded && plan" class="plan-panel" aria-label="Advanced workflow plan">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Advanced</span>
            <h2>Resolved plan</h2>
          </div>
          <Button label="Close" text size="small" @click="planExpanded = false" />
        </div>
        <ol class="plan-list">
          <li v-for="node in plan.graph.nodes" :key="node.id">
            <i :class="nodeIcon(node.kind)" /><span>{{ planNodeLabel(node.id, node.kind) }}</span>
          </li>
        </ol>
      </section>
    </main>
    <main v-else class="release-page">
      <Message v-if="loadError" severity="error" role="alert">
        {{ loadError }}
        <Button label="Retry" text @click="loadWorkflow" :disabled="!agent.isReady.value" />
        <Button :label="t('home.back-to-workflows')" text @click="router.push('/workflows')" />
      </Message>
      <p v-else role="status" aria-busy="true">
        {{
          agent.isReady.value
            ? "Loading workflow configuration…"
            : "Workflow configuration is unavailable while the engine is disconnected."
        }}
      </p>
    </main>
  </WorkflowShell>
  <Dialog
    class="pl-dialog"
    v-if="dashboardMode && dashboardRecoveryVisible"
    :visible="true"
    :modal="!(workflowLoading || sourceInspectionPending || planning || saveState === 'saving')"
    :header="
      loadError
        ? t('home.dashboard-ship-load-failed-title')
        : flow
          ? t('home.dashboard-ship-blocked')
          : t('home.dashboard-ship-loading-title')
    "
    :style="dialogStyle"
    @update:visible="(visible) => !visible && emit('closeDashboard')"
  >
    <p
      v-if="workflowLoading || sourceInspectionPending || planning || saveState === 'saving'"
      role="status"
      aria-busy="true"
    >
      {{ workflowLoading ? t("home.dashboard-ship-loading") : t("home.dashboard-ship-checking") }}
    </p>
    <Message v-else-if="loadError" severity="error" role="alert">
      <div class="planner-error">
        <span>{{ loadError }}</span>
        <Button
          :label="t('home.dashboard-ship-retry')"
          text
          size="small"
          :disabled="!agent.isReady.value"
          @click="loadWorkflow"
        />
        <Button
          v-if="!agent.isReady.value"
          :label="t('home.reconnect-engine')"
          text
          size="small"
          @click="
            agent.reconnect().catch((cause) => {
              error = String(cause);
            })
          "
        />
      </div>
    </Message>
    <template v-else>
      <p v-if="selectedBlocker">{{ t("home.dashboard-ship-resolve-blockers") }}</p>
      <ul v-if="blockingIssues.length" class="issue-summary">
        <li v-for="issue in blockingIssues" :key="`${issue.code}:${issue.path}:${issue.message}`">
          {{ issue.message }}
        </li>
      </ul>
      <p v-else>{{ dashboardRecoveryMessage }}</p>
      <Button
        v-if="saveError"
        :label="t('home.dashboard-ship-retry-save')"
        text
        @click="save().catch(() => {})"
      />
      <Button
        v-if="plannerError"
        :label="t('home.dashboard-ship-retry-planning')"
        text
        @click="refreshPlan"
      />
      <Button
        v-if="dashboardMode && error && canShip"
        :label="t('home.dashboard-ship-review-release')"
        text
        @click="reviewDashboardRelease"
      />
      <Button
        v-if="!agent.isReady.value"
        :label="t('home.reconnect-engine')"
        text
        @click="
          agent.reconnect().catch((cause) => {
            error = String(cause);
          })
        "
      />
    </template>
    <template #footer>
      <Button :label="t('home.dashboard-ship-back')" text @click="emit('closeDashboard')" />
      <Button
        v-if="flow"
        :label="t('home.dashboard-ship-configuration')"
        icon="pi pi-arrow-right"
        @click="openDashboardWorkflow"
      />
    </template>
  </Dialog>
  <ConfirmDialog group="workflow-destructive" />
  <Dialog
    class="pl-dialog"
    v-model:visible="addDestinationVisible"
    modal
    header="Add destination"
    :style="{ width: '500px', maxWidth: '94vw' }"
  >
    <div v-if="availableDestinations.length" class="destination-picker">
      <button
        v-for="destination in availableDestinations"
        :key="destination.id"
        type="button"
        class="destination-choice"
        @click="addDestination(destination.id)"
      >
        <span class="provider-icon">
          <img
            v-if="providerIconImage(destinationIconFor(destination.id, destination.icon))"
            :src="providerIconImage(destinationIconFor(destination.id, destination.icon))"
            alt=""
          />
          <i
            v-else
            :class="providerIconClass(destinationIconFor(destination.id, destination.icon))"
            aria-hidden="true"
          />
        </span>
        <span
          ><strong>{{ destination.label }}</strong></span
        >
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
    </div>
    <p v-else class="empty-card">All available destinations are already in this workflow.</p>
    <template #footer>
      <Button label="Cancel" text @click="addDestinationVisible = false" />
    </template>
  </Dialog>
  <Dialog
    class="pl-dialog"
    v-model:visible="attentionVisible"
    modal
    header="Needs attention"
    :style="dialogStyle"
  >
    <p class="attention-copy">The planner is authoritative. Fix these issues before shipping.</p>
    <ul class="issue-summary">
      <li
        v-for="issue in attentionIssues"
        :key="`${issue.code}:${issue.path}:${issue.severity}:${issue.message}`"
      >
        <Tag :value="issue.severity" :severity="issue.severity === 'error' ? 'danger' : 'warn'" />
        <span>{{ issue.message }}</span>
        <Button
          v-if="isBuildIssue(issue)"
          label="Configure build"
          text
          size="small"
          @click="openBuildIssue(issue)"
        />
        <Button
          v-else-if="issue.path?.startsWith('source')"
          label="Edit source"
          text
          size="small"
          @click="openIssueEditor(issue)"
        />
        <Button
          v-else-if="issue.path?.startsWith('destinations')"
          label="Edit destination"
          text
          size="small"
          @click="openIssueEditor(issue)"
        />
      </li>
    </ul>
  </Dialog>
  <NewBuildDialog
    v-model:visible="newBuildVisible"
    :flow="flow"
    :catalog="catalog"
    :destination-id="newBuildTarget?.destinationId"
    :slot-id="newBuildTarget?.slotId"
    @create="createNewBuild"
  />
  <Dialog
    class="pl-dialog"
    v-model:visible="sourceSettingsVisible"
    modal
    header="Edit source"
    :style="dialogStyle"
    ><div v-if="flow && sourceDefinition" class="settings-grid">
      <div class="release-field wide">
        <label for="source-provider">Source</label>
        <Select
          id="source-provider"
          :model-value="flow.source.provider"
          :options="catalog.sources"
          optionLabel="label"
          optionValue="id"
          @update:model-value="selectSource"
        />
      </div>
      <template v-for="field in sourceDefinition.fields || []" :key="field.key">
        <ReleaseFieldControl
          :field="field"
          :value="fieldValue(flow.source.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`source-${field.key}`"
          :issues="fieldIssues(`source.${field.key}`)"
          :connection-binding="connectionBindingFor(fieldValue(flow.source.config, field.key))"
          :connection-binding-suggestion="
            connectionBindingSuggestionFor(fieldValue(flow.source.config, field.key), field)
          "
          @update:value="
            field.type === 'connection'
              ? setConnectionFieldAlias(flow.source.config, field, $event)
              : setSourceField(field.key, $event)
          "
          @update:connection-binding="bindConnectionField(flow.source.config, field, $event)"
          @add-connection="openConnection($event, flow.source.config, field)"
        />
      </template>
    </div>
    <template #footer><Button label="Done" @click="sourceSettingsVisible = false" /></template
  ></Dialog>
  <Dialog
    class="pl-dialog"
    v-model:visible="destinationSettingsVisible"
    modal
    header="Edit destination"
    :style="dialogStyle"
    ><div v-if="settingsDestination" class="settings-grid">
      <div class="release-field wide destination-toggle">
        <label :for="`destination-enabled-${settingsDestination.id}`">Destination</label>
        <span>{{ settingsDestination.enabled ? "Included in this release" : "Disabled" }}</span>
        <ToggleSwitch
          v-model="settingsDestination.enabled"
          :inputId="`destination-enabled-${settingsDestination.id}`"
          aria-label="Destination enabled"
        />
      </div>
      <div class="release-field wide">
        <label :for="`destination-name-${settingsDestination.id}`">Destination name</label>
        <InputText
          :id="`destination-name-${settingsDestination.id}`"
          v-model="settingsDestination.name"
          :placeholder="'Optional, for example Studio'"
          autocomplete="off"
        />
      </div>
      <template
        v-for="field in destinationDefinition(settingsDestination.provider)?.fields || []"
        :key="field.key"
        ><ReleaseFieldControl
          :field="field"
          :value="fieldValue(settingsDestination.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`destination-${settingsDestination.id}-${field.key}`"
          :connection-binding="
            connectionBindingFor(fieldValue(settingsDestination.config, field.key))
          "
          :connection-binding-suggestion="
            connectionBindingSuggestionFor(fieldValue(settingsDestination.config, field.key), field)
          "
          :issues="
            fieldIssues(
              `destinations.${flow?.destinations.indexOf(settingsDestination)}.config.${field.key}`,
            )
          "
          @update:value="
            field.type === 'connection'
              ? setConnectionFieldAlias(settingsDestination.config, field, $event)
              : setField(settingsDestination.config, field.key, $event)
          "
          @update:connection-binding="
            bindConnectionField(settingsDestination.config, field, $event)
          "
          @add-connection="openConnection($event, settingsDestination.config, field)"
      /></template>
    </div>
    <template #footer>
      <div class="settings-footer">
        <Button
          label="Remove destination"
          icon="pi pi-trash"
          text
          severity="danger"
          @click="settingsDestination && removeDestination(settingsDestination.id)"
        />
        <span class="settings-footer-spacer" />
        <Button
          label="Add deployment"
          icon="pi pi-plus"
          text
          @click="settingsDestination && addSlot(settingsDestination)"
        />
        <Button label="Done" @click="destinationSettingsVisible = false" />
      </div>
    </template>
  </Dialog>
  <Dialog
    class="pl-dialog"
    v-model:visible="slotSettingsVisible"
    modal
    header="Deployment settings"
    :style="dialogStyle"
    ><div v-if="settingsDestination && settingsSlot" class="settings-grid">
      <div class="release-field wide">
        <label :for="`slot-${settingsSlot.id}-name`">Deployment name</label>
        <InputText
          :id="`slot-${settingsSlot.id}-name`"
          v-model="settingsSlot.name"
          placeholder="Deployment name"
        />
      </div>
      <div class="release-field wide destination-toggle">
        <label :for="`slot-enabled-${settingsSlot.id}`">Deployment</label>
        <span>{{ settingsSlot.enabled ? "Included in this release" : "Disabled" }}</span>
        <ToggleSwitch
          v-model="settingsSlot.enabled"
          :inputId="`slot-enabled-${settingsSlot.id}`"
          aria-label="Deployment enabled"
        />
      </div>
      <div class="release-field wide">
        <label>Output</label
        ><Select
          :model-value="releaseOutputRefValue(settingsSlot.input)"
          :options="outputOptions"
          optionLabel="label"
          optionValue="value"
          @update:model-value="setSlotInput(settingsSlot, $event)"
        />
        <small
          v-for="issue in slotIssues(settingsSlot)"
          :key="`${issue.code}:${issue.path}:${issue.severity}:${issue.message}`"
          class="field-issue"
          :class="issue.severity === 'error' ? 'field-issue-error' : 'field-issue-warning'"
          >{{ issue.message }}</small
        >
      </div>
      <template
        v-for="field in destinationDefinition(settingsDestination.provider)?.slotFields || []"
        :key="field.key"
        ><ReleaseFieldControl
          :field="field"
          :value="fieldValue(settingsSlot.config, field.key)"
          :options="fieldOptions(field)"
          :input-id="`slot-${settingsSlot.id}-${field.key}`"
          :connection-binding="connectionBindingFor(fieldValue(settingsSlot.config, field.key))"
          :connection-binding-suggestion="
            connectionBindingSuggestionFor(fieldValue(settingsSlot.config, field.key), field)
          "
          :issues="
            fieldIssues(
              `destinations.${flow?.destinations.indexOf(settingsDestination)}.slots.${settingsDestination?.slots.indexOf(settingsSlot)}.config.${field.key}`,
            )
          "
          @update:value="
            field.type === 'connection'
              ? setConnectionFieldAlias(settingsSlot.config, field, $event)
              : setField(settingsSlot.config, field.key, $event)
          "
          @update:connection-binding="bindConnectionField(settingsSlot.config, field, $event)"
          @add-connection="openConnection($event, settingsSlot.config, field)"
      /></template>
    </div>
    <template #footer>
      <div class="settings-footer">
        <Button
          label="Remove deployment"
          icon="pi pi-trash"
          text
          severity="danger"
          @click="
            settingsDestination && settingsSlot && removeSlot(settingsDestination, settingsSlot.id)
          "
        />
        <span class="settings-footer-spacer" />
        <Button label="Done" @click="slotSettingsVisible = false" />
      </div>
    </template>
  </Dialog>
  <Dialog
    class="pl-dialog"
    v-model:visible="connectionVisible"
    modal
    header="Add connection"
    :style="dialogStyle"
    ><div class="settings-grid">
      <div class="release-field">
        <label for="connection-name">Name</label
        ><InputText id="connection-name" v-model="connectionDraft.name" placeholder="My account" />
      </div>
      <div v-for="field in connectionFields" :key="field.key" class="release-field">
        <label :for="`connection-${field.key}`">{{ field.label }}</label
        ><InputText
          :id="`connection-${field.key}`"
          v-model="connectionDraft.values[field.key]"
          :type="field.type === 'password' ? 'password' : 'text'"
          :placeholder="field.placeholder || 'Stored securely'"
        />
      </div>
    </div>
    <template #footer
      ><Button label="Cancel" text @click="cancelConnection" /><Button
        label="Add connection"
        :loading="connectionSaving"
        :disabled="!connectionDraft.name.trim() || !connectionHasValue"
        @click="createConnection" /></template
  ></Dialog>
  <Dialog
    class="pl-dialog"
    v-if="!dashboardMode || releaseDetailsVisible"
    :visible="releaseDetailsVisible"
    modal
    :header="
      dashboardMode
        ? t('home.dashboard-ship-confirmation-title', { name: flow?.name || '' })
        : 'Release details'
    "
    :style="dialogStyle"
    @update:visible="(visible) => !visible && cancelReleaseDetails()"
    ><div class="settings-grid">
      <ReleaseDestinationAccountPreview :previews="shippingConnectionPreviews" />
      <div class="release-field">
        <label for="release-version">Version</label
        ><InputText id="release-version" v-model="releaseVersion" placeholder="1.0.0" />
      </div>
      <div class="release-field wide">
        <label for="release-description">Description</label
        ><Textarea id="release-description" v-model="releaseDescription" rows="3" />
      </div>
    </div>
    <template #footer
      ><Button
        :label="dashboardMode ? t('home.dashboard-ship-back') : 'Cancel'"
        text
        @click="cancelReleaseDetails" /><Button
        label="Ship release"
        icon="mdi mdi-rocket-launch-outline"
        :loading="running"
        :disabled="!releaseVersion.trim() || !canShip"
        @click="runShip" /></template
  ></Dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, toRaw, watch } from "vue";
import { nanoid } from "nanoid";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useConfirm } from "primevue/useconfirm";
import type {
  IconType,
  ReleaseConfig,
  ReleaseDestinationConfig,
  ReleaseDestinationSlot,
  ReleaseFieldDefinition,
  ReleaseFieldOption,
  ReleaseOutputRef,
  ReleasePlan,
  ValidationIssue,
} from "@pipelab/shared";
import WorkflowShell from "../components/WorkflowShell.vue";
import ReleaseFieldControl from "../components/ReleaseFieldControl.vue";
import ReleaseDestinationAccountPreview from "../components/ReleaseDestinationAccountPreview.vue";
import { useAPI } from "../composables/api";
import { publishRunEvent } from "./run-events";
import { useAppStore } from "../store/app";
import NewBuildDialog from "../components/NewBuildDialog.vue";
import ReleaseStatus from "../components/ReleaseStatus.vue";
import { useConnectionsStore } from "../store/connections";
import { useAgentAvailability } from "@renderer/composables/useAgentAvailability";
import { uiEnvironment } from "../composables/ui-runtime";
import {
  addCompatibleBuild,
  appendReleaseDestinationInstance,
  connectionMatchesIntegration,
  dashboardShipIntentAction,
  blockerAtIndex,
  clampBlockerIndex,
  createSerializedTaskQueue,
  createReleaseSourceConfig,
  deploymentSlotLabel,
  issuesForPath,
  deduplicateValidationIssues,
  invalidEnvironmentBindingPaths,
  missingRequiredFieldIssues,
  outputReferenceConsumers,
  planOutputOptions,
  readinessLabel,
  releaseCanRun,
  shouldInspectReleaseProviderConfig,
  releaseBlockerPresentation,
  releaseReadinessState,
  releaseRepairRoute,
  releaseOutputRefValue,
  runAfterSuccessfulSave,
  type CompatibleBuildCandidate,
} from "./release-flow-model";
import {
  hasUnsavedReleaseWorkflowState,
  preventBeforeUnloadIfUnsaved,
} from "./workflow-builds-state";
import {
  connectionDraftForIntegration,
  connectionFieldsForIntegration,
  connectionDraftMatchesIntegration,
  connectionOptionsForIntegration,
  persistWorkflowConnectionAliasRename,
  releaseWorkflowConnectionAliases,
  releaseDestinationConnectionPreviews,
  releaseDestinationLabel,
  renameWorkflowConnectionAlias,
  resolveDesktopWorkflowConnectionValues,
  setWorkflowConnectionBinding,
  suggestUniqueConnectionBinding,
  resolveFieldConnectionAlias,
  suggestWorkflowConnectionAlias,
  workflowConnectionBindingValue,
} from "../utils/release-connection-bindings";
import { submitDesktopWorkflowExecution } from "../utils/workflow-execution-input";
import {
  destinationIcon,
  providerIconClass,
  providerIconImage,
  sourceIcon,
} from "../utils/provider-icons";

const route = useRoute();
const router = useRouter();
const props = withDefaults(
  defineProps<{
    dashboardMode?: boolean;
    dashboardFlowId?: string;
    dashboardProjectId?: string;
  }>(),
  { dashboardMode: false },
);
const emit = defineEmits<{ closeDashboard: [] }>();
const { t } = useI18n();
const api = useAPI();
const confirm = useConfirm();
const appStore = useAppStore();
const connectionsStore = useConnectionsStore();
const agent = useAgentAvailability();
const flowId = computed(() =>
  props.dashboardMode ? props.dashboardFlowId || "" : String(route.params.flowId),
);
const projectId = computed(() =>
  props.dashboardMode ? props.dashboardProjectId || "" : String(route.params.projectId),
);
const catalog = computed(() => appStore.releaseCatalog);
const flow = ref<ReleaseConfig>();
const plan = ref<ReleasePlan>();
const plannerIssues = ref<ValidationIssue[]>([]);
const inspectionIssues = ref<ValidationIssue[]>([]);
const invalidEnvironmentPaths = computed(() =>
  flow.value ? invalidEnvironmentBindingPaths(flow.value) : [],
);
const knownFieldIssues = computed(() =>
  flow.value && !plan.value
    ? missingRequiredFieldIssues(flow.value, catalog.value).map((issue) => ({
        ...issue,
        severity: "warning" as const,
      }))
    : [],
);
const issues = computed(() => [
  ...plannerIssues.value,
  ...inspectionIssues.value,
  ...knownFieldIssues.value,
]);
const summaryIssues = computed(() => deduplicateValidationIssues(issues.value));
const blockingIssues = computed(() =>
  summaryIssues.value.filter((issue) => issue.severity === "error"),
);
const blockerIndex = ref(0);
const activeBlockerIndex = computed(() =>
  clampBlockerIndex(blockerIndex.value, blockingIssues.value.length),
);
const selectedBlocker = computed(() =>
  blockerAtIndex(blockingIssues.value, activeBlockerIndex.value),
);
watch(
  blockingIssues,
  (current) => {
    blockerIndex.value = clampBlockerIndex(blockerIndex.value, current.length);
  },
  { deep: true },
);
const attentionVisible = ref(false);
const attentionIssues = ref<ValidationIssue[]>([]);
const planExpanded = ref(false);
const error = ref("");
const loadError = ref("");
const plannerError = ref("");
const saveError = ref("");
const running = ref(false);
const workflowLoading = ref(false);
const sourceInspectionPending = ref(false);
const planning = ref(false);
const saveState = ref<"saving" | "saved" | "error">("saved");
const inspectionOptions = ref<Record<string, ReleaseFieldOption[]>>({});
const addDestinationVisible = ref(false);
const sourceSettingsVisible = ref(false);
const destinationSettingsVisible = ref(false);
const slotSettingsVisible = ref(false);
const releaseDetailsVisible = ref(false);
const dashboardRecoveryVisible = ref(true);
const dashboardShipIntentCancelled = ref(false);
const dashboardRecoveryMessage = computed(() =>
  dashboardShipIntentCancelled.value
    ? t("home.dashboard-ship-cancelled")
    : error.value || plannerError.value || saveError.value || t("home.ship-requirements-not-ready"),
);
const settingsDestination = ref<ReleaseDestinationConfig>();
const settingsSlot = ref<ReleaseDestinationSlot>();
const releaseVersion = ref("1.0.0");
const releaseDescription = ref("");
const connectionVisible = ref(false);
const connectionSaving = ref(false);
const pendingBlockerConnection = ref<
  | {
      code: string;
      message: string;
      path: string;
      flowId: string;
      projectId: string;
      integration: string;
    }
  | undefined
>();
const connectionDraft = ref({
  name: "",
  integration: "",
  integrationName: "",
  values: {} as Record<string, string>,
});
const dialogStyle = { width: "560px", maxWidth: "94vw" };
const saveStateLabel = computed(() =>
  saveState.value === "saving" ? "Saving…" : saveState.value === "error" ? "Error" : "Saved",
);
const workflowReadinessState = computed(() =>
  releaseReadinessState({
    loading: workflowLoading.value,
    inspectingSource: sourceInspectionPending.value,
    planning: planning.value,
    hasPlan: Boolean(plan.value),
    hasReadinessError: Boolean(plannerError.value || loadError.value),
    blockingIssueCount: blockingIssues.value.length,
    invalidFieldCount: invalidEnvironmentPaths.value.length,
  }),
);
const workflowReadinessLabel = computed(() =>
  workflowReadinessState.value === "error"
    ? "Readiness unavailable"
    : workflowReadinessState.value === "checking"
      ? "Checking readiness…"
      : workflowReadinessState.value === "attention"
        ? "Needs attention"
        : "Ready to ship",
);
const workflowReadinessIcon = computed(() =>
  workflowReadinessState.value === "error"
    ? "pi pi-exclamation-circle"
    : workflowReadinessState.value === "checking"
      ? "pi pi-spin pi-spinner"
      : workflowReadinessState.value === "attention"
        ? "pi pi-exclamation-triangle"
        : "pi pi-check-circle",
);
const canShip = computed(
  () =>
    agent.isReady.value &&
    connectionsStore.status === "ready" &&
    appStore.providerStatus === "ready" &&
    releaseCanRun(
      flow.value,
      plan.value,
      issues.value,
      running.value,
      planning.value,
      saveState.value,
      workflowLoading.value || sourceInspectionPending.value,
      Boolean(loadError.value || plannerError.value),
      invalidEnvironmentPaths.value.length > 0,
    ),
);
let dashboardShipIntentHandled = false;
watch(
  [
    () => props.dashboardMode || route.query.ship === "1",
    flow,
    flowId,
    projectId,
    workflowLoading,
    sourceInspectionPending,
    planning,
    workflowReadinessState,
    canShip,
    agent.isReady,
    loadError,
  ],
  ([intent, , , , , , , , , ready, failed]) => {
    if (!intent) {
      dashboardShipIntentHandled = false;
      return;
    }
    if (dashboardShipIntentHandled) return;

    if (failed) {
      dashboardShipIntentHandled = true;
      if (props.dashboardMode) {
        dashboardShipIntentCancelled.value = true;
        dashboardRecoveryVisible.value = true;
        return;
      }
      const query = { ...route.query };
      delete query.ship;
      void router.replace({ path: route.path, query, hash: route.hash }).catch(() => {});
      return;
    }

    if (!ready) {
      dashboardShipIntentHandled = true;
      if (props.dashboardMode) {
        dashboardShipIntentCancelled.value = true;
        dashboardRecoveryVisible.value = true;
        error.value = t("home.ship-engine-required");
        return;
      }
      const query = { ...route.query };
      delete query.ship;
      void router
        .replace({ path: route.path, query, hash: route.hash })
        .then(() => {
          error.value = t("home.ship-engine-required");
        })
        .catch(() => {
          dashboardShipIntentHandled = false;
        });
      return;
    }

    const action = dashboardShipIntentAction({
      intent: true,
      workflowMatchesRoute:
        flow.value?.id === flowId.value && flow.value?.project === projectId.value,
      loading: workflowLoading.value || sourceInspectionPending.value || planning.value,
      readiness: workflowReadinessState.value,
      canShip: canShip.value,
    });
    if (action === "wait") return;

    dashboardShipIntentHandled = true;
    const requestedFlowId = flowId.value;
    const requestedProjectId = projectId.value;
    if (props.dashboardMode) {
      if (
        action === "ship" &&
        requestedFlowId === flowId.value &&
        requestedProjectId === projectId.value &&
        canShip.value
      ) {
        void ship();
      } else {
        dashboardRecoveryVisible.value = true;
      }
      return;
    }
    const query = { ...route.query };
    delete query.ship;
    void router
      .replace({ path: route.path, query, hash: route.hash })
      .then(() => {
        if (
          action !== "ship" ||
          requestedFlowId !== flowId.value ||
          requestedProjectId !== projectId.value ||
          !canShip.value
        ) {
          if (action === "blocked" && workflowReadinessState.value === "ready")
            error.value = t("home.ship-requirements-not-ready");
          return;
        }
        if (props.dashboardMode) dashboardRecoveryVisible.value = false;
        void ship();
      })
      .catch(() => {
        dashboardShipIntentHandled = false;
      });
  },
  { immediate: true },
);
let latestSourceInspection = 0;
let latestPlanRequest = 0;
let workflowLoadGeneration = 0;
let saveGeneration = 0;
let connectionDialogGeneration = 0;
const changeRevision = ref(0);
const persistedRevision = ref(0);
let workflowHydrated = false;
const hasUnsavedState = computed(() =>
  hasUnsavedReleaseWorkflowState({
    changeRevision: changeRevision.value,
    persistedRevision: persistedRevision.value,
    saveState: saveState.value,
  }),
);
const beforeUnloadHandler = (event: BeforeUnloadEvent) =>
  preventBeforeUnloadIfUnsaved(event, hasUnsavedState.value);
let beforeUnloadRegistered = false;
watch(
  hasUnsavedState,
  (dirty) => {
    if (typeof window === "undefined") return;
    if (dirty && !beforeUnloadRegistered) {
      window.addEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadRegistered = true;
    } else if (!dirty && beforeUnloadRegistered) {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadRegistered = false;
    }
  },
  { flush: "sync", immediate: true },
);
const openAttention = (cardIssues: ValidationIssue[]) => {
  attentionIssues.value = cardIssues;
  attentionVisible.value = true;
};
const isBuildIssue = (issue: ValidationIssue) =>
  Boolean(
    issue.path?.startsWith("builds.") ||
    /^destinations\.\d+\.slots\.\d+\.input(?:\.|$)/.test(issue.path || ""),
  );
const openBuildIssue = (issue: ValidationIssue) => {
  if (!flow.value) return;
  attentionVisible.value = false;
  const slotMatch = issue.path?.match(/^destinations\.(\d+)\.slots\.(\d+)/);
  if (slotMatch) {
    const destination = flow.value.destinations[Number(slotMatch[1])];
    const slot = destination?.slots[Number(slotMatch[2])];
    if (destination && slot) void openBuildsForSlot(destination, slot);
    return;
  }
  const buildMatch = issue.path?.match(/^builds\.(\d+)/);
  const build = buildMatch ? flow.value.builds[Number(buildMatch[1])] : undefined;
  void router.push({
    name: "WorkflowBuilds",
    params: { flowId: flowId.value, projectId: projectId.value },
    query: { ...(build ? { buildId: build.id } : {}), issuePath: issue.path },
  });
};
const openIssueEditor = (issue: ValidationIssue) => {
  if (!flow.value) return;
  attentionVisible.value = false;
  if (issue.path?.startsWith("source")) {
    sourceSettingsVisible.value = true;
    return;
  }
  const match = issue.path?.match(/^destinations\.(\d+)(?:\.slots\.(\d+))?/);
  const destination = match ? flow.value.destinations[Number(match[1])] : undefined;
  const slot = match && match[2] ? destination?.slots[Number(match[2])] : undefined;
  if (destination && slot) openSlotSettings(destination, slot);
  else if (destination) openDestinationSettings(destination);
};
const moveBlocker = (delta: number) => {
  blockerIndex.value = clampBlockerIndex(
    activeBlockerIndex.value + delta,
    blockingIssues.value.length,
  );
};
const repairSelectedBlocker = () => {
  const issue = selectedBlocker.value;
  if (!issue || !blockingIssues.value.includes(issue)) return;
  const route = releaseRepairRoute(issue);
  const fieldContext = blockerFieldContext(issue);
  switch (route) {
    case "connections":
      attentionVisible.value = false;
      void router.push({ name: "Connections" });
      return;
    case "builds":
      openBuildIssue(issue);
      return;
    case "configuration":
      openIssueEditor(issue);
      if (
        fieldContext.field?.type === "connection" &&
        fieldContext.field.integration &&
        fieldContext.fieldConfig &&
        fieldContext.fieldKey &&
        issue.path &&
        !fieldContext.hasMatchingConnection
      ) {
        openConnection(fieldContext.field.integration);
        pendingBlockerConnection.value = {
          code: issue.code,
          message: issue.message,
          path: issue.path,
          flowId: flowId.value,
          projectId: projectId.value,
          integration: fieldContext.field.integration,
        };
      }
      return;
    default:
      openAttention(blockingIssues.value);
  }
};
const sourceDefinition = computed(() =>
  catalog.value.sources.find((item) => item.id === flow.value?.source.provider),
);
const producerDefinition = (id: string) => catalog.value.producers.find((item) => item.id === id);
const destinationDefinition = (id: string) =>
  catalog.value.destinations.find((item) => item.id === id);
const sourceIconFor = (source?: (typeof catalog.value.sources)[number]) =>
  sourceIcon(appStore.providerDefinitions, source);
const destinationIconFor = (id: string, icon?: IconType) =>
  destinationIcon(appStore.providerDefinitions, id, icon);
const fieldValue = (config: Record<string, unknown>, key: string) => String(config[key] ?? "");
const setField = (config: Record<string, unknown>, key: string, value: unknown) => {
  config[key] = String(value ?? "");
};
const connections = computed(() => connectionsStore.connections?.connections || []);
const localConnectionsConfig = computed(
  () => connectionsStore.connections || { version: "1.0.0" as const, connections: [] },
);
const shippingConnectionPreviews = computed(() =>
  flow.value
    ? releaseDestinationConnectionPreviews(flow.value, catalog.value, localConnectionsConfig.value)
    : [],
);
const destinationDisplayLabel = (destination: ReleaseConfig["destinations"][number]) =>
  releaseDestinationLabel(
    destinationDefinition(destination.provider)?.label || destination.provider,
    destination,
    flow.value?.destinations || [],
  );
const connectionOptions = (field: ReleaseFieldDefinition) =>
  connectionOptionsForIntegration(connections.value, field.integration);
const connectionFields = computed(() => {
  try {
    return connectionFieldsForIntegration(
      connectionDraft.value.integrationName || connectionDraft.value.integration,
      appStore.providerDefinitions,
    );
  } catch {
    return [];
  }
});
const connectionHasValue = computed(() =>
  connectionFields.value.some((field) => connectionDraft.value.values[field.key]?.trim()),
);
const fieldOptions = (field: ReleaseFieldDefinition) =>
  field.type === "connection"
    ? connectionOptions(field)
    : inspectionOptions.value[field.key] || field.options || [];
const connectionBindingFor = (alias: string) =>
  workflowConnectionBindingValue(
    localConnectionsConfig.value,
    flow.value?.id || flowId.value,
    alias,
  );
const connectionBindingSuggestionFor = (alias: string, field: ReleaseFieldDefinition) =>
  alias
    ? suggestUniqueConnectionBinding(
        connections.value,
        field.integration,
        connectionBindingFor(alias),
      )
    : undefined;
const setConnectionBinding = async (alias: string, connectionId: string) => {
  if (!flow.value || connectionsStore.status !== "ready") return;
  try {
    const workflowBindings = setWorkflowConnectionBinding(
      localConnectionsConfig.value.workflowBindings,
      flow.value.id,
      alias,
      connectionId,
    );
    await connectionsStore.updateConnections({
      ...localConnectionsConfig.value,
      workflowBindings,
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Unable to remember this Connection.";
  }
};
const bindConnectionField = async (
  values: Record<string, unknown>,
  field: ReleaseFieldDefinition,
  connectionId: string,
) => {
  if (!flow.value) return;
  let alias = fieldValue(values, field.key);
  if (!alias && connectionId) {
    // Picking an account first gives the field a workflow alias, so the user never has to name one.
    alias = suggestWorkflowConnectionAlias(
      field.label || field.key,
      releaseWorkflowConnectionAliases(flow.value, catalog.value),
    );
    setField(values, field.key, alias);
  }
  if (alias) await setConnectionBinding(alias, connectionId);
};
const setConnectionFieldAlias = async (
  values: Record<string, unknown>,
  field: ReleaseFieldDefinition,
  value: unknown,
) => {
  if (!flow.value) return;
  const previous = fieldValue(values, field.key);
  const next = typeof value === "string" ? value : "";
  if (previous === next) return;
  if (!previous) {
    setField(values, field.key, next);
    return;
  }

  try {
    const renamed = renameWorkflowConnectionAlias(
      toRaw(flow.value),
      catalog.value,
      localConnectionsConfig.value.workflowBindings,
      previous,
      next,
    );
    const previousBindings = localConnectionsConfig.value.workflowBindings || [];
    const previousConnectionId = workflowConnectionBindingValue(
      localConnectionsConfig.value,
      flow.value.id,
      previous,
    );
    const nextBindings = previousConnectionId
      ? setWorkflowConnectionBinding(
          renamed.workflowBindings,
          flow.value.id,
          next,
          previousConnectionId,
        )
      : renamed.workflowBindings;
    const workflowChanged = JSON.stringify(renamed.config) !== JSON.stringify(flow.value);
    await persistWorkflowConnectionAliasRename({
      workflowId: flow.value.id,
      previousAlias: previous,
      previousBindings,
      nextBindings,
      saveConnections: async (workflowBindings) => {
        await connectionsStore.updateConnections({
          ...localConnectionsConfig.value,
          workflowBindings,
        });
      },
      saveWorkflow: async () => {
        if (!workflowChanged) return;
        const destinationId = settingsDestination.value?.id;
        const slotId = settingsSlot.value?.id;
        flow.value = renamed.config;
        settingsDestination.value = flow.value.destinations.find(
          (destination) => destination.id === destinationId,
        );
        settingsSlot.value = settingsDestination.value?.slots.find((slot) => slot.id === slotId);
        clearTimeout(saveTimer);
        await save();
      },
    });
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Unable to rename this Connection alias.";
  }
};
const cardIssues = (prefix: string) => issuesForPath(summaryIssues.value, prefix);
const fieldIssues = (path: string) => issues.value.filter((issue) => issue.path === path);
const slotIssuePath = (slot: ReleaseDestinationSlot) => {
  const destinationIndex = flow.value?.destinations.findIndex((destination) =>
    destination.slots.includes(slot),
  );
  const slotIndex =
    destinationIndex === undefined || destinationIndex < 0
      ? -1
      : flow.value?.destinations[destinationIndex].slots.indexOf(slot);
  return destinationIndex !== undefined &&
    destinationIndex >= 0 &&
    slotIndex !== undefined &&
    slotIndex >= 0
    ? `destinations.${destinationIndex}.slots.${slotIndex}`
    : undefined;
};
const slotIssues = (slot: ReleaseDestinationSlot) => {
  const path = slotIssuePath(slot);
  return path ? fieldIssues(`${path}.input`) : [];
};
const slotCardIssues = (slot: ReleaseDestinationSlot) => {
  const path = slotIssuePath(slot);
  return path ? issuesForPath(summaryIssues.value, path) : [];
};
const blockerFieldContext = (issue: ValidationIssue) => {
  if (!flow.value || !issue.path) return {};
  let field: ReleaseFieldDefinition | undefined;
  let targetLabel: string | undefined;
  let destinationLabel: string | undefined;
  let fieldKey: string | undefined;
  let fieldConfig: Record<string, unknown> | undefined;

  const sourceMatch = issue.path.match(/^source\.config\.(.+)$/);
  const buildMatch = issue.path.match(/^builds\.(\d+)\.(?:(?:targets\.(\d+)\.)?config)\.(.+)$/);
  const destinationMatch = issue.path.match(
    /^destinations\.(\d+)\.(?:(?:slots\.(\d+)\.)?config)\.(.+)$/,
  );
  if (sourceMatch) {
    fieldKey = sourceMatch[1];
    fieldConfig = flow.value.source.config;
    field = sourceDefinition.value?.fields?.find((candidate) => candidate.key === fieldKey);
    targetLabel = sourceDefinition.value?.label || "source";
  } else if (buildMatch) {
    const build = flow.value.builds[Number(buildMatch[1])];
    const producer = build ? producerDefinition(build.engine) : undefined;
    const target = buildMatch[2] ? build?.targets[Number(buildMatch[2])] : undefined;
    fieldKey = buildMatch[3];
    fieldConfig = target?.config || build?.config;
    field = target
      ? producer?.targets
          .find((candidate) => candidate.id === target.id)
          ?.fields?.find((candidate) => candidate.key === fieldKey)
      : producer?.fields?.find((candidate) => candidate.key === fieldKey);
    targetLabel = build?.name?.trim() || producer?.label || "build";
  } else if (destinationMatch) {
    const destination = flow.value.destinations[Number(destinationMatch[1])];
    const definition = destination ? destinationDefinition(destination.provider) : undefined;
    const slot = destinationMatch[2] ? destination?.slots[Number(destinationMatch[2])] : undefined;
    fieldKey = destinationMatch[3];
    fieldConfig = slot?.config || destination?.config;
    field = slot
      ? definition?.slotFields?.find((candidate) => candidate.key === fieldKey)
      : definition?.fields?.find((candidate) => candidate.key === fieldKey);
    targetLabel = definition?.label || "destination";
    destinationLabel = releaseDestinationLabel(targetLabel, destination, flow.value.destinations);
  }

  if (field?.type !== "connection" || !field.integration)
    return { targetLabel, destinationLabel, field, fieldKey, fieldConfig };
  const integrationProvider = appStore.providerDefinitions.find(
    (provider) => provider.packageName === field?.integration || provider.id === field?.integration,
  );
  const fallbackConnectionLabel = field.label.replace(/\s+(account|connection)$/i, "");
  const connectionLabel = integrationProvider?.name || fallbackConnectionLabel || "provider";
  const connectionFieldLabel = field.label.toLowerCase().startsWith(connectionLabel.toLowerCase())
    ? field.label.slice(connectionLabel.length).trim().toLowerCase()
    : field.label.toLowerCase();
  return {
    targetLabel,
    destinationLabel,
    connectionLabel,
    connectionFieldLabel,
    field,
    fieldKey,
    fieldConfig,
    integration: field.integration,
    hasMatchingConnection: connections.value.some((connection) =>
      connectionMatchesIntegration(connection, field?.integration || ""),
    ),
  };
};
const blockerPresentation = computed(() => {
  const issue = selectedBlocker.value;
  return issue
    ? releaseBlockerPresentation(issue, blockerFieldContext(issue))
    : { title: "", description: "", actionLabel: "Review issues" };
});
const destinationReadiness = (destination: ReleaseDestinationConfig, index: number) => {
  const enabledSlots = destination.slots.filter((slot) => slot.enabled);
  const childrenReady =
    enabledSlots.length > 0 &&
    enabledSlots.every((slot) => Boolean(slot.input) && !slotCardIssues(slot).length);
  return readinessLabel(
    destination.enabled,
    childrenReady,
    Boolean(cardIssues(`destinations.${index}`).length),
  );
};
const sourcePath = computed(() => {
  const field = sourceDefinition.value?.fields?.find(
    (item) => item.type === "file" || item.type === "directory",
  );
  return field && flow.value ? fieldValue(flow.value.source.config, field.key) : "";
});
const outputOptions = computed(() =>
  flow.value && plan.value ? planOutputOptions(flow.value, plan.value, catalog.value) : [],
);
const availableDestinations = computed(() => catalog.value.destinations);
const addDestination = (provider: string) => {
  if (!flow.value) return;
  const definition = destinationDefinition(provider);
  if (definition) appendReleaseDestinationInstance(flow.value, definition, nanoid, catalog.value);
  addDestinationVisible.value = false;
};
const hasConfiguredValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasConfiguredValue);
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).some(hasConfiguredValue);
  return true;
};
const confirmDestructiveChange = (
  header: string,
  message: string,
  acceptLabel: string,
  accept: () => void,
) =>
  confirm.require({
    group: "workflow-destructive",
    header,
    message,
    icon: "pi pi-exclamation-triangle",
    acceptLabel,
    rejectLabel: "Keep current setup",
    accept,
  });
const removeDestination = (id: string) => {
  const destination = flow.value?.destinations.find((item) => item.id === id);
  if (!flow.value || !destination) return;
  const label = destinationDefinition(destination.provider)?.label || destination.provider;
  const remove = () => {
    flow.value!.destinations = flow.value!.destinations.filter((item) => item.id !== id);
    destinationSettingsVisible.value = false;
    settingsDestination.value = undefined;
  };
  if (hasConfiguredValue(destination.config) || destination.slots.length) {
    confirmDestructiveChange(
      `Remove ${label}?`,
      `This removes ${label}'s settings and ${destination.slots.length} deployment slot${destination.slots.length === 1 ? "" : "s"}, including their selected outputs.`,
      "Remove destination",
      remove,
    );
  } else remove();
};
const expandedDestinations = ref<ReadonlySet<string>>(new Set());
const isDestinationExpanded = (id: string) => expandedDestinations.value.has(id);
const toggleDestinationExpanded = (id: string) => {
  const next = new Set(expandedDestinations.value);
  if (!next.delete(id)) next.add(id);
  expandedDestinations.value = next;
};
const destinationSummary = (destination: ReleaseDestinationConfig) => {
  if (!destination.enabled) return "Disabled";
  const slots = destination.slots.filter((slot) => slot.enabled);
  if (!slots.length) return "No deployments";
  return slots.length === 1 ? artifactLabel(slots[0].input) : `${slots.length} deployments`;
};
const addSlot = (destination: ReleaseDestinationConfig) => {
  expandedDestinations.value = new Set(expandedDestinations.value).add(destination.id);
  destination.slots.push({
    id: nanoid(),
    name: `Deployment ${destination.slots.length + 1}`,
    enabled: true,
    config: {},
  });
};
const removeSlot = (destination: ReleaseDestinationConfig, id: string) => {
  const slot = destination.slots.find((item) => item.id === id);
  if (!slot) return;
  const remove = () => {
    destination.slots = destination.slots.filter((item) => item.id !== id);
    if (settingsSlot.value?.id === id) {
      slotSettingsVisible.value = false;
      settingsSlot.value = undefined;
    }
  };
  const index = destination.slots.indexOf(slot);
  const hasCustomName = Boolean(slot.name?.trim()) && slot.name !== `Deployment ${index + 1}`;
  const configured = Boolean(slot.input) || hasConfiguredValue(slot.config) || hasCustomName;
  if (configured) {
    const destinationLabel =
      destinationDefinition(destination.provider)?.label || destination.provider;
    const output = artifactLabel(slot.input);
    confirmDestructiveChange(
      `Remove ${deploymentSlotLabel(slot, index)}?`,
      `${destinationLabel} will lose this deployment${slot.input ? ` and its selected output (${output})` : ""}.`,
      "Remove deployment",
      remove,
    );
  } else remove();
};
const setSlotInput = (slot: ReleaseDestinationSlot, value: string) => {
  const output = outputOptions.value.find((candidate) => candidate.value === value);
  if (output) slot.input = output.ref;
};
const newBuildChoice = "__new-build__";
const newBuildVisible = ref(false);
// "New build…" is an action, not a value: remounting the select makes it show its placeholder again.
const outputPickerResets = ref(0);
const newBuildTarget = ref<{ destinationId: string; slotId: string }>();
const createNewBuild = (choice: CompatibleBuildCandidate) => {
  const target = newBuildTarget.value;
  if (!flow.value || !target) return;
  addCompatibleBuild(
    flow.value,
    catalog.value,
    target.destinationId,
    target.slotId,
    choice,
    nanoid,
  );
};
// Existing outputs first, then a way to create the build this deployment is missing.
const slotOutputChoices = computed(() => [
  ...outputOptions.value.map((output) => ({ label: output.label, value: output.value })),
  { label: "New build…", value: newBuildChoice },
]);
const chooseSlotOutput = (
  destination: ReleaseDestinationConfig,
  slot: ReleaseDestinationSlot,
  value: string,
) => {
  if (value === newBuildChoice) {
    newBuildTarget.value = { destinationId: destination.id, slotId: slot.id };
    newBuildVisible.value = true;
    outputPickerResets.value++;
  } else setSlotInput(slot, value);
};
const openBuildsForSlot = (destination: ReleaseDestinationConfig, slot: ReleaseDestinationSlot) =>
  router.push({
    name: "WorkflowBuilds",
    params: { flowId: flowId.value, projectId: projectId.value },
    query: { destinationId: destination.id, slotId: slot.id },
  });
const artifactLabel = (ref?: ReleaseOutputRef) =>
  ref
    ? outputOptions.value.find((output) => output.value === releaseOutputRefValue(ref))?.label ||
      "Invalid output reference"
    : "Choose output";
const openDestinationSettings = (destination: ReleaseDestinationConfig) => {
  settingsDestination.value = destination;
  destinationSettingsVisible.value = true;
};
const openSlotSettings = (destination: ReleaseDestinationConfig, slot: ReleaseDestinationSlot) => {
  settingsDestination.value = destination;
  settingsSlot.value = slot;
  slotSettingsVisible.value = true;
};
const selectSource = (provider: string) => {
  if (!flow.value) return;
  const definition = catalog.value.sources.find((source) => source.id === provider);
  if (!definition || flow.value.source.provider === provider) return;
  const currentConfig = flow.value.source.config;
  const nextConfig = createReleaseSourceConfig(flow.value, definition, catalog.value);
  const discardedFields = Object.keys(currentConfig).filter(
    (key) =>
      hasConfiguredValue(currentConfig[key]) &&
      JSON.stringify(currentConfig[key]) !== JSON.stringify(nextConfig[key]),
  );
  const consumers = outputReferenceConsumers(flow.value, { source: true }, catalog.value).map(
    (consumer) => consumer.label,
  );
  const apply = () => {
    if (!flow.value) return;
    flow.value.source = { provider, config: nextConfig };
    inspectionOptions.value = {};
    void inspectSource();
  };
  if (discardedFields.length || consumers.length) {
    const details = [
      discardedFields.length
        ? `Provider-specific settings will be replaced: ${discardedFields.join(", ")}.`
        : "",
      consumers.length
        ? `Source output is selected by ${consumers.slice(0, 4).join(", ")}${consumers.length > 4 ? ` and ${consumers.length - 4} more` : ""}. Those routes will remain unchanged and may need a different output.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    confirmDestructiveChange(
      `Change source to ${definition.label}?`,
      details,
      "Change source",
      apply,
    );
  } else apply();
};
const setSourceField = (key: string, value: unknown) => {
  if (flow.value) {
    setField(flow.value.source.config, key, value);
    void inspectSource();
  }
};
// The field an inline "Add" was opened from, so the new Connection can be selected for it.
let pendingFieldConnection:
  | { config: Record<string, unknown>; field: ReleaseFieldDefinition }
  | undefined;
const openConnection = (
  integration: string,
  config?: Record<string, unknown>,
  field?: ReleaseFieldDefinition,
) => {
  connectionDialogGeneration++;
  pendingBlockerConnection.value = undefined;
  pendingFieldConnection = config && field ? { config, field } : undefined;
  try {
    connectionDraft.value = {
      name: "",
      ...connectionDraftForIntegration(integration, appStore.providerDefinitions),
    };
    error.value = "";
    connectionVisible.value = true;
  } catch (cause) {
    connectionVisible.value = false;
    error.value =
      cause instanceof Error ? cause.message : "Provider Connection schema is unavailable.";
  }
};
const cancelConnection = () => {
  connectionDialogGeneration++;
  pendingBlockerConnection.value = undefined;
  pendingFieldConnection = undefined;
  connectionVisible.value = false;
};
const createConnection = async () => {
  if (!connectionFields.value.length || !connectionHasValue.value) return;
  const dialogGeneration = connectionDialogGeneration;
  const pendingAtStart = pendingBlockerConnection.value;
  const fieldAtStart = pendingFieldConnection;
  connectionSaving.value = true;
  try {
    const integration = connectionDraft.value.integration;
    const record = {
      id: nanoid(),
      pluginName: integration,
      integrationName: connectionDraft.value.integrationName || undefined,
      name: connectionDraft.value.name.trim(),
      ...Object.fromEntries(
        Object.entries(connectionDraft.value.values).map(([key, value]) => [key, value.trim()]),
      ),
      createdAt: new Date().toISOString(),
      isDefault: false,
    };
    let workflowBindings = localConnectionsConfig.value.workflowBindings || [];
    let pendingAlias: string | undefined;
    let fieldAlias: string | undefined;
    if (
      fieldAtStart &&
      flow.value &&
      fieldAtStart.field.integration &&
      connectionDraftMatchesIntegration(fieldAtStart.field.integration, connectionDraft.value)
    ) {
      fieldAlias = resolveFieldConnectionAlias(
        fieldValue(fieldAtStart.config, fieldAtStart.field.key),
        fieldAtStart.field.label || fieldAtStart.field.key,
        connections.value.map((connection) => connection.id),
        releaseWorkflowConnectionAliases(flow.value, catalog.value),
      );
      workflowBindings = setWorkflowConnectionBinding(
        workflowBindings,
        flow.value.id,
        fieldAlias,
        record.id,
      );
    }
    if (pendingAtStart && pendingAtStart.flowId === flow.value?.id) {
      const currentIssue = blockingIssues.value.find(
        (issue) =>
          issue.code === pendingAtStart.code &&
          issue.message === pendingAtStart.message &&
          issue.path === pendingAtStart.path,
      );
      const target = currentIssue ? blockerFieldContext(currentIssue) : undefined;
      if (
        target &&
        connectionDraftMatchesIntegration(target.integration, connectionDraft.value) &&
        target.fieldConfig &&
        target.fieldKey &&
        flow.value
      ) {
        const existingAlias = String(target.fieldConfig[target.fieldKey] || "");
        pendingAlias =
          /^[A-Za-z_][A-Za-z0-9_-]*$/.test(existingAlias) &&
          !connections.value.some((connection) => connection.id === existingAlias)
            ? existingAlias
            : suggestWorkflowConnectionAlias(
                record.name,
                releaseWorkflowConnectionAliases(flow.value, catalog.value),
              );
        workflowBindings = setWorkflowConnectionBinding(
          workflowBindings,
          flow.value.id,
          pendingAlias,
          record.id,
        );
      }
    }
    const result = await api.execute("connections:save", {
      data: {
        ...localConnectionsConfig.value,
        connections: [...connections.value, record],
        workflowBindings,
      },
    });
    if (result.type === "error") {
      error.value = result.ipcError;
      return;
    }
    await connectionsStore.load(true);
    if (fieldAtStart && fieldAlias && fieldAtStart === pendingFieldConnection)
      setField(fieldAtStart.config, fieldAtStart.field.key, fieldAlias);
    if (fieldAtStart === pendingFieldConnection) pendingFieldConnection = undefined;
    const pending = pendingBlockerConnection.value;
    if (
      pendingAtStart &&
      pending === pendingAtStart &&
      pending &&
      pending.integration === integration &&
      pending.flowId === flowId.value &&
      pending.projectId === projectId.value
    ) {
      const currentIssue = blockingIssues.value.find(
        (issue) =>
          issue.code === pending.code &&
          issue.message === pending.message &&
          issue.path === pending.path,
      );
      if (currentIssue) {
        const target = blockerFieldContext(currentIssue);
        if (target.integration === integration && target.fieldConfig && target.fieldKey)
          target.fieldConfig[target.fieldKey] = pendingAlias || record.id;
      }
    }
    if (pendingBlockerConnection.value === pendingAtStart)
      pendingBlockerConnection.value = undefined;
    if (dialogGeneration === connectionDialogGeneration) connectionVisible.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unable to save connection.";
  } finally {
    connectionSaving.value = false;
  }
};
const inspectSource = async () => {
  if (!flow.value || !agent.isReady.value) {
    sourceInspectionPending.value = false;
    return;
  }
  const requestId = ++latestSourceInspection;
  const provider = flow.value.source.provider;
  const config = structuredClone(toRaw(flow.value.source.config));
  if (!shouldInspectReleaseProviderConfig(config)) {
    sourceInspectionPending.value = false;
    inspectionIssues.value = [];
    inspectionOptions.value = {};
    return;
  }
  sourceInspectionPending.value = true;
  inspectionIssues.value = [];
  inspectionOptions.value = {};
  const isCurrent = () =>
    requestId === latestSourceInspection &&
    flow.value?.source.provider === provider &&
    JSON.stringify(flow.value.source.config) === JSON.stringify(config);
  try {
    const result = await api.execute("release:source:inspect", { provider, config });
    if (!isCurrent()) return;
    if (result.type === "error") {
      inspectionIssues.value = [
        {
          code: "release.source.inspect",
          message: result.ipcError,
          severity: "error",
          path: "source",
        },
      ];
      return;
    }
    const data = result.result as {
      issues?: ValidationIssue[];
      fieldOptions?: Record<string, ReleaseFieldOption[]>;
    };
    inspectionIssues.value = (data.issues || []).map((issue) => ({
      ...issue,
      path: issue.path?.startsWith("source.")
        ? issue.path
        : issue.path
          ? `source.${issue.path}`
          : "source",
    }));
    inspectionOptions.value = data.fieldOptions || {};
  } catch (cause) {
    if (!isCurrent()) return;
    inspectionIssues.value = [
      {
        code: "release.source.inspect",
        message: cause instanceof Error ? cause.message : String(cause),
        severity: "error",
        path: "source",
      },
    ];
  } finally {
    if (requestId === latestSourceInspection) sourceInspectionPending.value = false;
  }
};
const planNodeLabel = (id: string, kind: string) => {
  if (kind === "source") return sourceDefinition.value?.label || id;
  if (kind === "build") {
    const build = flow.value?.builds.find((candidate) => candidate.id === id);
    return build
      ? `${catalog.value.buildTypes.find((type) => type.id === build.type)?.label || build.type} / ${producerDefinition(build.engine)?.label || build.engine}`
      : id;
  }
  const [destinationId, slotId] = id.split(":");
  const destination = flow.value?.destinations.find((candidate) => candidate.id === destinationId);
  return kind === "destination"
    ? `${destinationDefinition(destination?.provider || "")?.label || destinationId} / ${slotId}`
    : id;
};
const nodeIcon = (kind: string) =>
  kind === "source"
    ? "mdi mdi-source-branch"
    : kind === "destination"
      ? "mdi mdi-cloud-upload-outline"
      : kind === "automatic"
        ? "mdi mdi-cog-transfer-outline"
        : "mdi mdi-hammer-wrench";
const refreshPlan = async (): Promise<ReleasePlan | undefined> => {
  if (!flow.value || !agent.isReady.value) return undefined;
  const requestId = ++latestPlanRequest;
  const revision = changeRevision.value;
  const config = structuredClone(toRaw(flow.value));
  const fingerprint = JSON.stringify(config);
  planning.value = true;
  plannerError.value = "";
  try {
    const result = await api.execute("release:plan", { config });
    if (
      requestId !== latestPlanRequest ||
      revision !== changeRevision.value ||
      JSON.stringify(flow.value) !== fingerprint
    )
      return undefined;
    if (result.type === "error") {
      plan.value = undefined;
      plannerIssues.value = [];
      plannerError.value = result.ipcError;
      return undefined;
    }
    plan.value = result.result;
    plannerIssues.value = result.result.issues;
    plannerError.value = "";
    return result.result;
  } catch (cause) {
    if (requestId === latestPlanRequest && revision === changeRevision.value) {
      plan.value = undefined;
      plannerIssues.value = [];
      plannerError.value = cause instanceof Error ? cause.message : String(cause);
    }
    return undefined;
  } finally {
    if (requestId === latestPlanRequest) planning.value = false;
  }
};
const save = createSerializedTaskQueue(async () => {
  if (!flow.value) return;
  if (invalidEnvironmentPaths.value.length > 0) {
    saveState.value = "error";
    saveError.value = "Fix invalid environment variable names before saving workflow changes.";
    throw new Error(saveError.value);
  }
  if (
    !agent.isReady.value ||
    connectionsStore.status !== "ready" ||
    appStore.providerStatus !== "ready"
  ) {
    if (!hasUnsavedState.value) return;
    saveState.value = "error";
    saveError.value = "The engine or required workflow data is unavailable before save.";
    throw new Error(saveError.value);
  }
  const requestGeneration = ++saveGeneration;
  const revision = changeRevision.value;
  const snapshot = structuredClone(toRaw(flow.value));
  saveState.value = "saving";
  const result = await api.execute("workflow:save", {
    workflowId: flowId.value,
    data: snapshot,
    projectId: projectId.value,
  });
  if (requestGeneration !== saveGeneration || !agent.isReady.value)
    throw new Error("The connection changed before the save could be confirmed.");
  if (result.type === "error") {
    saveState.value = "error";
    saveError.value = result.ipcError;
    throw new Error(result.ipcError);
  }
  persistedRevision.value = revision;
  saveError.value = "";
  if (
    persistedRevision.value !== changeRevision.value ||
    JSON.stringify(flow.value) !== JSON.stringify(snapshot)
  )
    void save().catch(() => {});
  else saveState.value = "saved";
});
const ship = async () => {
  if (!flow.value || !canShip.value) return;
  try {
    await save();
    const revision = changeRevision.value;
    const fingerprint = JSON.stringify(flow.value);
    const currentPlan = await refreshPlan();
    if (
      !currentPlan ||
      revision !== changeRevision.value ||
      JSON.stringify(flow.value) !== fingerprint ||
      issues.value.some((issue) => issue.severity === "error")
    ) {
      if (props.dashboardMode) dashboardRecoveryVisible.value = true;
      return;
    }
    releaseVersion.value = "1.0.0";
    releaseDescription.value = flow.value?.description || flow.value?.name || "";
    releaseDetailsVisible.value = true;
    if (props.dashboardMode) dashboardRecoveryVisible.value = false;
  } catch {
    // The autosave state provides the retry action and its error message.
    if (props.dashboardMode) dashboardRecoveryVisible.value = true;
  }
};
const cancelReleaseDetails = () => {
  if (props.dashboardMode) emit("closeDashboard");
  else releaseDetailsVisible.value = false;
};
const reviewDashboardRelease = () => {
  dashboardRecoveryVisible.value = false;
  releaseDetailsVisible.value = true;
};
const openDashboardWorkflow = () => {
  dashboardRecoveryVisible.value = false;
  void router.push(`/workflows/${flowId.value}/${projectId.value}`);
};
const runShip = async () => {
  if (!flow.value || !canShip.value) return;
  releaseDetailsVisible.value = false;
  running.value = true;
  try {
    await runAfterSuccessfulSave(save, async () => {
      const revision = changeRevision.value;
      const fingerprint = JSON.stringify(flow.value);
      const currentPlan = await refreshPlan();
      if (
        !currentPlan ||
        revision !== changeRevision.value ||
        JSON.stringify(flow.value) !== fingerprint ||
        persistedRevision.value !== revision ||
        issues.value.some((issue) => issue.severity === "error")
      ) {
        throw new Error("The saved workflow is no longer ready to ship. Review the latest issues.");
      }
      if (!flow.value) throw new Error("The workflow is no longer available.");
      let runId = "";
      const connectionValues = resolveDesktopWorkflowConnectionValues(
        flow.value,
        catalog.value,
        localConnectionsConfig.value,
        appStore.providerDefinitions,
      );
      const result = await submitDesktopWorkflowExecution({
        workflow: flow.value,
        catalog: catalog.value,
        request: {
          name: `workflows/${flowId.value}`,
          release: {
            version: releaseVersion.value.trim(),
            description: releaseDescription.value.trim(),
          },
          connectionValues,
        },
        readEnvironment: async (names) => {
          if (uiEnvironment !== "desktop") return Promise.resolve({});
          if (!window.pipelab?.readWorkflowEnvironment)
            throw new Error("Desktop cannot read workflow environment bindings. Restart Pipelab.");
          const environment = await window.pipelab.readWorkflowEnvironment(flowId.value);
          return Object.fromEntries(
            names.flatMap((name) =>
              Object.hasOwn(environment, name) ? [[name, environment[name]]] : [],
            ),
          );
        },
        execute: (request) =>
          api.execute("workflow:execute", request, async (event) => {
            if (event.type === "workflow-run") {
              runId = event.data.runId;
              await router.push(`/workflows/${flowId.value}/${projectId.value}/runs/${runId}`);
            } else if (event.type === "workflow-event" && runId) {
              publishRunEvent(runId, event.data);
            }
          }),
      });
      if (result.type === "error") throw new Error(result.ipcError);
      else if (!runId)
        await router.push(
          `/workflows/${flowId.value}/${projectId.value}/runs/${result.result.runId}`,
        );
    });
  } catch (cause) {
    if (!error.value) error.value = cause instanceof Error ? cause.message : String(cause);
    if (props.dashboardMode) dashboardRecoveryVisible.value = true;
  } finally {
    running.value = false;
  }
};
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  flow,
  () => {
    if (!workflowHydrated || !flow.value) return;
    changeRevision.value += 1;
    latestPlanRequest += 1;
    plan.value = undefined;
    plannerIssues.value = [];
    plannerError.value = "";
    planning.value = true;
    clearTimeout(saveTimer);
    clearTimeout(planTimer);
    if (flow.value) {
      saveTimer = setTimeout(() => void save().catch(() => {}), 700);
      planTimer = setTimeout(() => void refreshPlan(), 300);
    }
  },
  { deep: true, flush: "sync" },
);
onBeforeRouteLeave(async () => {
  if (!flow.value || !hasUnsavedState.value) return true;
  clearTimeout(saveTimer);
  try {
    await save();
    return true;
  } catch {
    return false;
  }
});
onUnmounted(() => {
  if (beforeUnloadRegistered && typeof window !== "undefined") {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadRegistered = false;
  }
  clearTimeout(saveTimer);
  clearTimeout(planTimer);
});
const loadWorkflow = async () => {
  if (!agent.isReady.value) return;
  const generation = ++workflowLoadGeneration;
  const requestedFlowId = flowId.value;
  const requestedProjectId = projectId.value;
  workflowLoading.value = true;
  loadError.value = "";
  try {
    const [, flowResult] = await Promise.all([
      appStore.loadReleaseCatalog(),
      api.execute("workflow:load", { workflowId: requestedFlowId, projectId: requestedProjectId }),
      connectionsStore.init(),
      appStore.loadProviderDefinitions(),
    ]).then(([catalog, workflow]) => [catalog, workflow] as const);
    if (
      generation !== workflowLoadGeneration ||
      requestedFlowId !== flowId.value ||
      requestedProjectId !== projectId.value
    )
      return;
    if (flowResult.type === "error") throw new Error(flowResult.ipcError);
    if (connectionsStore.status === "error")
      throw new Error(connectionsStore.error || "Unable to load connections.");
    if (appStore.providerStatus === "error")
      throw new Error(appStore.providerError || "Unable to load provider definitions.");
    const loaded = flowResult.result;
    if (loaded.id !== requestedFlowId || loaded.project !== requestedProjectId)
      throw new Error("Loaded workflow identity does not match the requested route.");
    const preserveDraft =
      flow.value?.id === requestedFlowId &&
      flow.value?.project === requestedProjectId &&
      hasUnsavedState.value;
    if (!preserveDraft) {
      workflowHydrated = false;
      flow.value = loaded;
      workflowHydrated = true;
    }
    inspectionIssues.value = [];
    inspectionOptions.value = {};
    plannerIssues.value = [];
    plannerError.value = "";
    plan.value = undefined;
    workflowLoading.value = false;
    await Promise.all([inspectSource(), refreshPlan()]);
  } catch (cause) {
    if (generation === workflowLoadGeneration)
      loadError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (generation === workflowLoadGeneration) workflowLoading.value = false;
  }
};
watch(
  agent.isReady,
  (ready) => {
    if (!ready) {
      workflowLoadGeneration++;
      saveGeneration++;
      latestSourceInspection++;
      latestPlanRequest++;
      workflowLoading.value = false;
      sourceInspectionPending.value = false;
      planning.value = false;
      clearTimeout(saveTimer);
      clearTimeout(planTimer);
      if (hasUnsavedState.value) {
        saveState.value = "error";
        saveError.value = "The engine disconnected before these workflow changes could be saved.";
      }
      return;
    }
    void loadWorkflow();
  },
  { immediate: true },
);
watch([flowId, projectId], () => {
  pendingBlockerConnection.value = undefined;
  workflowLoadGeneration++;
  saveGeneration++;
  latestSourceInspection++;
  latestPlanRequest++;
  workflowLoading.value = false;
  sourceInspectionPending.value = false;
  planning.value = false;
  workflowHydrated = false;
  flow.value = undefined;
  plan.value = undefined;
  if (agent.isReady.value) void loadWorkflow();
});
</script>

<style scoped>
.release-page {
  display: grid;
  gap: 28px;
  max-width: 1040px;
  margin: 0 auto;
  padding-bottom: 48px;
}

/* ── Header actions ─────────────────────────────────────────────── */
.workflow-readiness {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border: 1px solid var(--pl-border);
  border-radius: 999px;
  color: var(--pl-muted);
  background: var(--pl-sunken);
  font-size: 0.75rem;
  font-weight: 600;
}
.workflow-readiness i {
  font-size: 0.78rem;
}
.workflow-readiness.state-ready {
  color: color-mix(in srgb, var(--pl-ok) 80%, var(--p-text-color));
  border-color: color-mix(in srgb, var(--pl-ok) 30%, transparent);
  background: color-mix(in srgb, var(--pl-ok) 9%, var(--pl-card));
}
.workflow-readiness.state-attention,
.workflow-readiness.state-error {
  color: color-mix(in srgb, var(--pl-warn) 82%, var(--p-text-color));
  border-color: color-mix(in srgb, var(--pl-warn) 32%, transparent);
  background: color-mix(in srgb, var(--pl-warn) 9%, var(--pl-card));
}
.autosave-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--pl-muted);
  font-size: 0.75rem;
}
.state-saved i {
  color: var(--pl-ok);
}
.state-error i {
  color: var(--red-500, #ef4444);
}
.ship-button {
  min-width: 5.5rem;
}
.readiness-progress {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  color: var(--pl-muted);
  font-size: 0.78rem;
}
.readiness-progress i {
  margin-right: 5px;
}
.planner-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* ── Action required ────────────────────────────────────────────── */
.action-required-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-sm);
}
.blocker-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: color-mix(in srgb, var(--pl-warn) 85%, var(--p-text-color));
  background: color-mix(in srgb, var(--pl-warn) 12%, var(--pl-card));
  font-size: 1.1rem;
}
.blocker-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.blocker-copy .eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--pl-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.blocker-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--pl-hover);
  font-size: 0.68rem;
  letter-spacing: 0;
  text-transform: none;
}
.blocker-copy strong {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.blocker-copy > span:not(.eyebrow) {
  color: var(--pl-muted);
  font-size: 0.82rem;
}
.blocker-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.blocker-navigation {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ── Sections ───────────────────────────────────────────────────── */
.release-section,
.plan-panel {
  display: grid;
  gap: 0;
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 12px;
}
.section-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}
.section-count {
  min-width: 1.35rem;
  padding: 1px 7px;
  border-radius: 999px;
  color: var(--pl-muted);
  background: var(--pl-hover);
  font-size: 0.72rem;
  font-weight: 600;
  text-align: center;
}
.section-heading p {
  margin: 3px 0 0;
  color: var(--pl-muted);
  font-size: 0.82rem;
}
.eyebrow,
.field-label {
  color: var(--pl-muted);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ── Cards ──────────────────────────────────────────────────────── */
.source-card,
.job-card,
.empty-card,
.plan-panel {
  border: 1px solid var(--pl-border);
  border-radius: var(--pl-radius);
  background: var(--pl-card);
  box-shadow: var(--pl-shadow-xs);
}
.source-card,
.job-card {
  transition:
    border-color 0.15s var(--pl-ease),
    box-shadow 0.2s var(--pl-ease);
}
.source-card:hover,
.job-card:hover {
  border-color: var(--pl-border-strong);
  box-shadow: var(--pl-shadow-sm);
}
.source-card,
.job-header {
  display: flex;
  align-items: center;
  gap: 14px;
}
.source-card {
  padding: 12px 16px;
}
.job-card {
  overflow: hidden;
}
.job-card + .job-card {
  margin-top: 8px;
}
.job-card.disabled .job-header {
  opacity: 0.6;
}
.job-header {
  padding: 12px 14px 12px 16px;
}
.source-copy,
.job-title {
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.source-copy strong,
.job-title strong {
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.source-copy span,
.job-title span,
.field-value {
  overflow: hidden;
  color: var(--pl-muted);
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-copy small {
  color: var(--pl-muted);
  font-size: 0.72rem;
}
.provider-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--pl-border);
  border-radius: 11px;
  color: var(--pl-accent);
  background: linear-gradient(
    145deg,
    var(--pl-card),
    color-mix(in srgb, var(--p-text-color) 5%, var(--pl-card))
  );
  box-shadow: var(--pl-shadow-xs);
  font-size: 18px;
}
.provider-icon > img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.destination-toggle {
  flex: 0 0 auto;
}

/* Deployments */
.slot-list {
  display: grid;
  gap: 2px;
  padding: 6px 14px 12px 16px;
  border-top: 1px solid var(--pl-border);
  background: var(--pl-sunken);
  animation: pl-reveal 0.18s var(--pl-ease);
}
@keyframes pl-reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
.slot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 4px 7px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--p-text-color);
  text-align: left;
  transition: background 0.15s var(--pl-ease);
}
.slot-row:hover {
  background: var(--pl-hover);
}
.slot-row > :first-child {
  flex: 1;
}
.deployment-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.deployment-main > i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--pl-border);
  border-radius: 8px;
  color: var(--pl-muted);
  background: var(--pl-card);
  font-size: 15px;
}
.deployment-main > span {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.deployment-main strong {
  font-size: 0.82rem;
  font-weight: 600;
}
.deployment-main small {
  overflow: hidden;
  color: var(--pl-muted);
  font-size: 0.74rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-output-select {
  min-width: 13rem;
  max-width: 16rem;
  height: 2.1rem;
  border-radius: var(--pl-radius-sm);
}
.slot-output-select :deep(.p-select-label) {
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  font-size: 0.8rem;
}
.slot-output-select :deep(.p-select-dropdown) {
  width: 2rem;
}
.add-slot {
  justify-self: start;
  margin-top: 4px;
}

.empty-card {
  display: grid;
  place-items: center;
  gap: 6px;
  padding: 36px;
  border-style: dashed;
  box-shadow: none;
  color: var(--pl-muted);
  text-align: center;
}
.empty-card i {
  color: var(--pl-accent);
  font-size: 26px;
}

/* ── Plan panel ─────────────────────────────────────────────────── */
.plan-panel {
  margin-top: 8px;
  padding: 18px;
}
.plan-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.plan-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
  border-bottom: 1px solid var(--pl-border);
  font-size: 0.82rem;
}
.plan-list li:last-child {
  border-bottom: 0;
}
.plan-list i {
  color: var(--pl-accent);
}

/* ── Dialogs: pickers, forms, footers ───────────────────────────── */
.destination-picker {
  display: grid;
  gap: 8px;
}
.destination-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  background: var(--pl-card);
  color: var(--p-text-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s var(--pl-ease),
    box-shadow 0.15s var(--pl-ease),
    background 0.15s var(--pl-ease);
}
.destination-choice > span:nth-child(2) {
  display: grid;
  flex: 1;
  gap: 2px;
}
.destination-choice small {
  color: var(--pl-muted);
  font-size: 0.74rem;
}
.destination-choice:hover {
  border-color: var(--pl-border-strong);
  background: var(--pl-sunken);
  box-shadow: var(--pl-shadow-xs);
}
.destination-choice:focus-visible {
  outline: none;
  border-color: var(--pl-accent);
  box-shadow: var(--pl-ring);
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 16px;
}
.settings-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.settings-footer-spacer {
  flex: 1;
}
.release-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.release-field > label,
.field-label {
  color: var(--p-text-color);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.release-field > small {
  color: var(--pl-muted);
  font-size: 0.74rem;
  line-height: 1.4;
}
.release-field.wide,
.wide {
  grid-column: 1 / -1;
}
.release-field.destination-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--pl-border);
  border-radius: 12px;
  background: var(--pl-sunken);
}
.destination-toggle label {
  margin-right: auto;
}
.destination-toggle span {
  color: var(--pl-muted);
  font-size: 0.78rem;
}
.field-issue {
  display: block;
  margin-top: 4px;
  font-size: 0.74rem;
}
.field-issue-error {
  color: var(--red-500, #ef4444);
}
.field-issue-warning {
  color: color-mix(in srgb, var(--pl-warn) 85%, var(--p-text-color));
}
.field-note {
  margin: 0;
  color: var(--pl-muted);
  font-size: 0.78rem;
}
.issue-summary {
  display: grid;
  gap: 6px;
  margin: 10px 0 0;
  padding-left: 18px;
}
.issue-summary li {
  font-size: 0.8rem;
}
.issue-summary .p-tag {
  margin-right: 6px;
}

@media (max-width: 640px) {
  .release-page {
    gap: 22px;
  }
  .action-required-card {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .blocker-actions {
    grid-column: 1 / -1;
    justify-content: space-between;
  }
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .section-heading,
  .job-header,
  .source-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .slot-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
