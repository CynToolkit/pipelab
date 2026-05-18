import { useLogger } from '@@/logger'
import semver from 'semver'

export type Release = {
  id: number
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
  url: string
  prerelease?: boolean
}

const REPO = 'CynToolkit/pipelab'

export const fetchAllReleases = async (): Promise<Release[]> => {
  const { logger } = useLogger()
  const allReleases: Release[] = []
  try {
    // Fetch up to 5 pages (500 items total) to bypass monorepo package release noise
    for (let page = 1; page <= 5; page++) {
      const url = `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`
      logger().info(`Fetching releases from GitHub API (page ${page}):`, url)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Pipelab'
        }
      })
      if (!response.ok) {
        throw new Error(`Failed to fetch releases page ${page}: ${response.statusText}`)
      }
      const pageReleases = (await response.json()) as Release[]
      if (pageReleases.length === 0) {
        break
      }
      allReleases.push(...pageReleases)
    }
    return allReleases
  } catch (error) {
    logger().error('Error fetching all releases:', error)
    throw error
  }
}

export type FetchLatestReleaseOptions = {
  packageName?: string
  prerelease?: boolean
  overrideRelease?: string
}

/**
 * Fetches the latest release for a specific package.
 */
export const fetchLatestRelease = async (
  options: FetchLatestReleaseOptions = {}
): Promise<Release | null> => {
  const { packageName = '@pipelab/app', prerelease = false, overrideRelease } = options
  const { logger } = useLogger()

  try {
    logger().info('fetchLatestRelease called with options:', options)
    const releases = await fetchAllReleases()
    logger().info(`Total releases fetched from API: ${releases.length}`)

    // Handle command-line override
    if (overrideRelease) {
      logger().info('Using release override:', overrideRelease)
      const targetTag = overrideRelease.includes('@') ? overrideRelease : `${packageName}@${overrideRelease}`
      const release = releases.find((r) => r.tag_name === targetTag)
      if (release) {
        logger().info('Found matching release for override:', release.tag_name)
        return release
      }
      logger().warn(`Release override ${overrideRelease} not found for package ${packageName}`)
    }

    // Helper to get version from tag name
    const getVersion = (tagName: string) => tagName.split('@').pop() || '0.0.0'

    const matchedPrefixReleases = releases.filter((r) => r.tag_name.startsWith(`${packageName}@`))
    logger().info(`Found ${matchedPrefixReleases.length} releases matching prefix "${packageName}@"`)

    // Filter for releases that follow the {packageName}@X.Y.Z tag pattern and filter out prereleases unconditionally unless prerelease is true
    const packageReleases = matchedPrefixReleases.filter((r) => {
      const version = getVersion(r.tag_name)
      const isPrerelease = r.prerelease || semver.prerelease(version)

      if (prerelease) {
        logger().info(`[prerelease-mode] Keeping release: ${r.tag_name} (prerelease: ${!!isPrerelease})`)
        return true
      }
      if (isPrerelease) {
        logger().info(`[stable-mode] Skipping prerelease: ${r.tag_name}`)
        return false
      }
      logger().info(`[stable-mode] Keeping stable release: ${r.tag_name}`)
      return true
    })

    if (packageReleases.length === 0) {
      logger().info('No releases matched after filtering.')
      return null
    }

    packageReleases.sort((a, b) => {
      const vA = getVersion(a.tag_name)
      const vB = getVersion(b.tag_name)
      if (semver.valid(vA) && semver.valid(vB)) {
        return semver.rcompare(vA, vB)
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    })

    logger().info('Filtered releases order (sorted descending):', packageReleases.map((r) => r.tag_name))
    logger().info('Selected latest release:', packageReleases[0].tag_name)

    return packageReleases[0]
  } catch (error) {
    logger().error('Failed to fetch latest release:', error)
    return null
  }
}
