import { createRequire } from 'module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const Module = require('node:module');

const assetExtensions = ['.webp', '.png', '.jpg', '.jpeg', '.svg'];

/**
 * Handle CJS (require)
 */
for (const ext of assetExtensions) {
  Module._extensions[ext] = (module, filename) => {
    module.exports = filename;
  };
}

/**
 * Handle ESM (import)
 */
export async function resolve(specifier, context, nextResolve) {
  if (assetExtensions.some((ext) => specifier.endsWith(ext))) {
    return {
      format: 'module',
      shortCircuit: true,
      url: specifier.startsWith('file://') ? specifier : new URL(specifier, context.parentURL).href,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (assetExtensions.some((ext) => url.endsWith(ext))) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(url)};`,
    };
  }
  return nextLoad(url, context);
}
