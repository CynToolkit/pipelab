---
"@pipelab/ui": patch
"@pipelab/shared": patch
"@pipelab/core-node": patch
"@pipelab/providers": patch
---

Simplify workflow creation and configuration: the new workflow wizard now has four steps (Name & description, Source & project path, Destinations, Review) with no Builds step, inline settings or notes, and non-clickable step headers. Providers choose which fields appear in the wizard with `showInWizard`. Configuration shows each provider's own icon, a compact destination list with expandable deployments and an inline Add deployment button, quieter status indicators with tooltips, an inline `$` button for environment variables, an auto-named workflow alias, and selects a Connection right after it is added from a field.
