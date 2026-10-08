import {
  BROWSER_PROVIDER_SPECS_SCHEMA_VERSION,
  buildReleaseCatalog,
  RELEASE_CONFIG_VERSION,
  type BrowserProviderSpecs,
} from "@pipelab/shared";
import { builtInProviders } from "../providers-registry";
import { buildCoreReleaseRegistry } from "./registry";

/** Build the serializable provider data that the browser can use without a host. */
export const buildBrowserProviderSpecs = (): BrowserProviderSpecs => ({
  schemaVersion: BROWSER_PROVIDER_SPECS_SCHEMA_VERSION,
  releaseConfigVersion: RELEASE_CONFIG_VERSION,
  catalog: buildReleaseCatalog(buildCoreReleaseRegistry()),
  providers: builtInProviders.map(
    ({ id, name, icon, description, isOfficial, packageName, integrations }) => ({
      id,
      name,
      icon,
      description,
      isOfficial,
      packageName,
      integrations,
    }),
  ),
});

export const renderBrowserProviderSpecs = (
  specs: BrowserProviderSpecs = buildBrowserProviderSpecs(),
) =>
  `import type { BrowserProviderSpecs } from "@pipelab/shared";\n\nconst browserProviderSpecs = ${JSON.stringify(specs, null, 2)} satisfies BrowserProviderSpecs;\n\nexport default browserProviderSpecs;\n`;
