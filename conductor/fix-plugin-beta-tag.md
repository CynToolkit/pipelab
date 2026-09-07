# OBSOLETE: Plugin Beta Publication Tags

> This document is obsolete. NPM publishing of plugins and packages has been **disabled** in bundled mode. Plugins are now regular monorepo packages bundled with the CLI and are not published to npm. See ARCHITECTURE.md for the current architecture.

---

The plugins were previously being published as `latest` even on the `develop` branch because the Changesets `publish` command may not have been correctly picking up the `NPM_CONFIG_TAG` environment variable defined in the GitHub Action step.

## Previous Fix (no longer applicable)

### `.github/workflows/pipeline.yml`

The fix was to explicitly set the `--tag` argument based on the branch name in the changesets action:

```yaml
# (Obsolete - NPM publishing disabled)
- name: Publish to NPM & Create GitHub Release
  id: changesets
  uses: changesets/action@v1
  with:
    publish: pnpm changeset publish --provenance --tag ${{ (github.ref_name == 'develop' || github.event.inputs.prerelease == 'true') && 'beta' || 'latest' }}
    createGithubReleases: true
```

## Verification (no longer applicable)

1.  Monitor the next release on the `develop` branch.
2.  Verify in the GitHub Action logs that the command executed is `pnpm changeset publish --provenance --tag beta`.
3.  Check npm registry to ensure the plugins are now tagged as `beta` instead of `latest`.
