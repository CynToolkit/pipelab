import semver from "semver";

export interface GitHubRelease {
  tag_name: string;
  prerelease: boolean;
  published_at: string;
  html_url: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

export interface FetchReleaseOptions {
  repo?: string;
  allowPrerelease?: boolean;
}

/**
 * Fetches all releases for a specific package from GitHub.
 * Tags are expected to follow the pattern "{packageName}@{version}"
 */
export async function fetchPackageReleases(
  packageName: string,
  options: FetchReleaseOptions = {},
): Promise<GitHubRelease[]> {
  const { repo = "CynToolkit/pipelab", allowPrerelease = false } = options;

  try {
    const override = process.env.PIPELAB_OVERRIDE_RELEASE;
    if (override) {
      const targetTag = override.includes("@") ? override : `${packageName}@${override}`;
      console.log(`[GitHub] Fetching specific override release: ${targetTag}`);
      const response = await fetch(
        `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(targetTag)}`,
        {
          headers: {
            "User-Agent": "Pipelab-Desktop-Updater",
            Accept: "application/vnd.github.v3+json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (response.ok) {
        const release: GitHubRelease = await response.json();
        return [release];
      }
      console.warn(`[GitHub] Override release tag ${targetTag} not found or error occurred`);
    }

    const matchingRefsUrl = `https://api.github.com/repos/${repo}/git/matching-refs/tags/${encodeURIComponent(packageName)}`;
    console.log(`[GitHub] Querying matching tags from ${matchingRefsUrl}...`);

    const response = await fetch(matchingRefsUrl, {
      headers: {
        "User-Agent": "Pipelab-Desktop-Updater",
        Accept: "application/vnd.github.v3+json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const refs = await response.json();
    if (!Array.isArray(refs)) {
      return [];
    }

    // Extract tags matching the packageName@ pattern
    const matchingTags = refs
      .map((r: any) => r.ref.replace("refs/tags/", ""))
      .filter((tag: string) => tag.startsWith(`${packageName}@`));

    // Filter by semver and prerelease options
    const filteredTags = matchingTags.filter((tag: string) => {
      const version = tag.split("@").pop();
      if (!version || !semver.valid(version)) {
        return false;
      }
      const isPrerelease = semver.prerelease(version) !== null;
      return allowPrerelease || !isPrerelease;
    });

    if (filteredTags.length === 0) {
      return [];
    }

    // Sort by version (newest/highest first)
    filteredTags.sort((a, b) => {
      const vA = a.split("@").pop() || "0.0.0";
      const vB = b.split("@").pop() || "0.0.0";
      return semver.rcompare(vA, vB);
    });

    // Walk tags from newest to oldest, skipping any that have no GitHub Release attached.
    // A bare git tag (no release) returns 404 from the releases/tags endpoint.
    for (const tag of filteredTags) {
      console.log(`[GitHub] Fetching release details for tag: ${tag}`);

      const releaseResponse = await fetch(
        `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
        {
          headers: {
            "User-Agent": "Pipelab-Desktop-Updater",
            Accept: "application/vnd.github.v3+json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (releaseResponse.status === 404) {
        // Tag exists but no Release was published for it — skip and try older tag
        console.warn(`[GitHub] Tag "${tag}" has no associated Release, skipping.`);
        continue;
      }

      if (!releaseResponse.ok) {
        throw new Error(
          `GitHub API error: ${releaseResponse.status} ${releaseResponse.statusText}`,
        );
      }

      const release: GitHubRelease = await releaseResponse.json();
      return [release];
    }

    // All tags were bare (no Release found)
    console.warn(`[GitHub] No published Release found for any matching tag of "${packageName}".`);
    return [];
  } catch (error) {
    console.error(`[GitHub] Failed to fetch releases for ${packageName}:`, error);
    return [];
  }
}

/**
 * Fetches the latest release for a specific package.
 * Supports PIPELAB_OVERRIDE_RELEASE environment variable.
 */
export async function fetchLatestPackageRelease(
  packageName: string,
  options: FetchReleaseOptions = {},
): Promise<GitHubRelease | null> {
  const releases = await fetchPackageReleases(packageName, options);

  if (releases.length === 0) {
    return null;
  }

  // Handle environment variable override
  const override = process.env.PIPELAB_OVERRIDE_RELEASE;
  if (override) {
    const targetTag = override.includes("@") ? override : `${packageName}@${override}`;
    const release = releases.find((r) => r.tag_name === targetTag);
    if (release) {
      console.log(
        `[GitHub] Using release override from PIPELAB_OVERRIDE_RELEASE: ${release.tag_name}`,
      );
      return release;
    }
    console.warn(`[GitHub] Override release ${override} not found for package ${packageName}`);
  }

  // Sort by semver
  const getVersion = (tagName: string) => tagName.split("@").pop() || "0.0.0";

  releases.sort((a, b) => {
    const vA = getVersion(a.tag_name);
    const vB = getVersion(b.tag_name);
    if (semver.valid(vA) && semver.valid(vB)) {
      return semver.rcompare(vA, vB);
    }
    return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
  });

  return releases[0];
}

/**
 * Fetches all releases from GitHub and finds the latest one that matches the Pipelab Desktop app tag.
 * This ensures we don't accidentally pick a package release (e.g. @pipelab/shared) as the "latest".
 */
export async function fetchLatestDesktopRelease(
  options: FetchReleaseOptions = {},
): Promise<GitHubRelease | null> {
  const latest = await fetchLatestPackageRelease("@pipelab/app", options);

  if (latest) {
    console.log(
      `[GitHub] Found latest desktop release: ${latest.tag_name} (${latest.prerelease ? "pre-release" : "stable"})`,
    );
  } else {
    console.warn(`[GitHub] No desktop releases found`);
  }

  return latest;
}
