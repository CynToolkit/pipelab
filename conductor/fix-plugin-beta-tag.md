# Plan: Fix Beta Publication Tags for Plugins

The plugins are currently being published as `latest` even on the `develop` branch because the Changesets `publish` command may not be correctly picking up the `NPM_CONFIG_TAG` environment variable defined in the GitHub Action step.

## Changes

### 1. Modify `.github/workflows/pipeline.yml`
Update the `Publish to NPM & Create GitHub Release` step to explicitly set the `--tag` argument based on the branch name.

Current step:
```yaml
      - name: Publish to NPM & Create GitHub Release
        id: changesets
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish --provenance
          createGithubReleases: true
        env:
          ...
```

Proposed change:
```yaml
      - name: Publish to NPM & Create GitHub Release
        id: changesets
        uses: changesets/action@v1
        with:
          publish: >-
            pnpm changeset publish --provenance --tag ${{ (github.ref_name == 'develop' || github.event.inputs.prerelease == 'true') && 'beta' || 'latest' }}
          createGithubReleases: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
```

## Verification

1.  Monitor the next release on the `develop` branch.
2.  Verify in the GitHub Action logs that the command executed is `pnpm changeset publish --provenance --tag beta`.
3.  Check npm registry to ensure the plugins are now tagged as `beta` instead of `latest`.
