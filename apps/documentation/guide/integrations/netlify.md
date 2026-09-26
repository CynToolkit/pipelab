# Netlify

The Netlify plugin provides two pipeline actions: **Build Netlify site** and **Upload to Netlify**. Both require a local input folder, a Personal Access Token, and a Netlify Site selected with that token. The integration also exposes a Netlify Account token field.

**Build Netlify site** requires `package.json` in the selected folder. It copies the project into the task working directory, associates the selected site, then runs Netlify CLI `build` followed by a production deploy. **Upload to Netlify** also requires `package.json`; it stages the supplied folder as `dist` in a bundled Netlify template and runs a production deploy. Both actions declare no output values.

## Minimal inputs

```text
input-folder: /work/site
token: <Netlify personal access token>
site: <site selected using that token>
```

Use a token authorized for the selected site. Missing folder, missing `package.json`, an invalid site, authentication failures, and Netlify CLI failures stop the action and appear in its logs. The plugin declares no OS-specific host allowlist. The build and publish names refer to these pipeline actions; Netlify is not registered as a Release workflow destination.
