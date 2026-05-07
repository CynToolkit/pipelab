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
  const url = `https://api.github.com/repos/${repo}/releases`;

  console.log(`[GitHub] Fetching releases for ${packageName} from ${url}...`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Pipelab-Desktop-Updater",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const releases: GitHubRelease[] = await response.json();

    // Filter for releases that follow the {packageName}@X.Y.Z tag pattern
    const packageReleases = releases
      .filter((r) => r.tag_name.startsWith(`${packageName}@`))
      .filter((r) => allowPrerelease || !r.prerelease);

    return packageReleases;
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
