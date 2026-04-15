import { readFileSync, writeFileSync } from 'node:fs';

/**
 * This script parses the JSON output of `turbo ls --output=json`
 * and exposes a single stringified JSON array of all affected package names.
 */

interface TurboPackage {
  name: string;
  path: string;
}

interface TurboLsOutput {
  packages: {
    items: TurboPackage[];
  };
}

function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Usage: tsx detect-changes.ts <turbo-ls-output.json>');
    process.exit(1);
  }

  try {
    const rawData = readFileSync(inputFile, 'utf-8');
    const data: TurboLsOutput = JSON.parse(rawData);
    
    // Extract all package names
    const affectedPackages = data.packages.items.map(p => p.name);

    console.log('--- Affected Packages Detected by Turbo ---');
    console.log(JSON.stringify(affectedPackages, null, 2));
    console.log('-------------------------------------------');

    // Set a single GitHub Action output named 'affected'
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      // The array needs to be stringified for GHA to handle it as a single string
      writeFileSync(githubOutput, `affected=${JSON.stringify(affectedPackages)}\n`, { flag: 'a' });
      console.log('Successfully set GITHUB_OUTPUT: affected');
    } else {
      console.log('Not running in GitHub Actions, skipping GITHUB_OUTPUT');
    }

  } catch (error) {
    console.error('Failed to parse turbo output:', error);
    process.exit(1);
  }
}

main();
