# Discord Activity

This plugin packages a web app as a Discord Activity asset bundle and can run a local preview. It does not provide game Rich Presence actions.

## Package and preview

**Package as Discord Activity** takes a required input folder and application name. The name defaults to `Pipelab`; the action returns the output folder path. **Preview Discord Activity app** takes the same values and an optional custom hostname, then serves the app through a temporary tunnel for preview. Preview needs network access for the tunnel and a browser-visible app. The plugin does not declare a host-platform matrix for these tasks.

The integration settings include a field labelled **Webhook URL**, but the registered package and preview actions do not consume it. No credential is required by these actions.

## Minimal package input

```text
input-folder: /work/site
name: My Activity
```

Packaging and preview failures appear in action logs. The custom hostname is optional and defaults to an empty value.
