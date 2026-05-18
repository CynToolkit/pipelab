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
  try {
    const url = `https://api.github.com/repos/${REPO}/releases`
    logger().info('Fetching releases from GitHub API:', url)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Pipelab'
      }
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch releases: ${response.statusText}`)
    }
    return (await response.json()) as Release[]
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
    const releases = await fetchAllReleases()

    // Handle command-line override
    if (overrideRelease) {
      logger().info('Using release override:', overrideRelease)
      const targetTag = overrideRelease.includes('@') ? overrideRelease : `${packageName}@${overrideRelease}`
      const release = releases.find((r) => r.tag_name === targetTag)
      if (release) {
        return release
      }
      logger().warn(`Release override ${overrideRelease} not found for package ${packageName}`)
    }

    // Helper to get version from tag name
    const getVersion = (tagName: string) => tagName.split('@').pop() || '0.0.0'

    // Filter for releases that follow the {packageName}@X.Y.Z tag pattern and filter out prereleases unconditionally unless prerelease is true
    const packageReleases = releases
      .filter((r) => r.tag_name.startsWith(`${packageName}@`))
      .filter((r) => {
        if (prerelease) {
          return true
        }
        if (r.prerelease) {
          return false
        }
        const version = getVersion(r.tag_name)
        return !semver.prerelease(version)
      })

    if (packageReleases.length === 0) {
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

    return packageReleases[0]
  } catch (error) {
    logger().error('Failed to fetch latest release:', error)
    return null
  }
}
