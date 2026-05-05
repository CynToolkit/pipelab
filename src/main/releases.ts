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

/**
 * Fetches the latest release for a specific package.
 * Supports PIPELAB_OVERRIDE_RELEASE environment variable.
 */
export const fetchLatestRelease = async (packageName = '@pipelab/app'): Promise<Release | null> => {
  const { logger } = useLogger()

  try {
    const releases = await fetchAllReleases()

    // Handle environment variable override
    const override = process.env.PIPELAB_OVERRIDE_RELEASE
    if (override) {
      logger().info('Using release override:', override)
      const targetTag = override.includes('@') ? override : `${packageName}@${override}`
      const release = releases.find((r) => r.tag_name === targetTag)
      if (release) {
        return release
      }
      logger().warn(`Release override ${override} not found for package ${packageName}`)
    }

    // Filter for releases that follow the {packageName}@X.Y.Z tag pattern
    const packageReleases = releases.filter((r) => r.tag_name.startsWith(`${packageName}@`))

    if (packageReleases.length === 0) {
      return null
    }

    // Sort by semver
    const getVersion = (tagName: string) => tagName.split('@').pop() || '0.0.0'

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
