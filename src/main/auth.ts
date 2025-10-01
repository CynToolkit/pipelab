import { app } from 'electron'
import { join } from 'node:path'
import { writeFile, readFile } from 'node:fs/promises'
import { useLogger } from '@@/logger'

interface UserSubscription {
  userId: string
  subscriptions: Array<{
    id: string
    product: {
      benefits: Array<{
        id: string
        name: string
      }>
    }
  }>
  lastChecked: number
}

const AUTH_CACHE_FILE = join(app.getPath('userData'), 'auth-cache.json')
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export class MainProcessAuth {
  private logger = useLogger()
  private subscriptionCache: Map<string, UserSubscription> = new Map()

  private async loadCache(): Promise<void> {
    try {
      const data = await readFile(AUTH_CACHE_FILE, 'utf-8')
      const cache = JSON.parse(data)

      // Only use cache if it's not too old
      if (Date.now() - cache.timestamp < CACHE_DURATION) {
        this.subscriptionCache = new Map(Object.entries(cache.subscriptions))
      }
    } catch (error) {
      // Cache doesn't exist or is corrupted, start fresh
      this.subscriptionCache.clear()
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const cache = {
        timestamp: Date.now(),
        subscriptions: Object.fromEntries(this.subscriptionCache)
      }
      await writeFile(AUTH_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
    } catch (error) {
      this.logger.logger().error('Failed to save auth cache:', error)
    }
  }

  private async fetchUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      // In a real implementation, this would call your subscription service
      // For now, we'll simulate checking with Supabase
      const { createClient } = await import('@supabase/supabase-js')

      console.log('process.env.SUPABASE_URL', process.env.SUPABASE_URL)

      // You'll need to configure these with your actual Supabase credentials
      const supabaseUrl = process.env.SUPABASE_URL || 'your-supabase-url'
      const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key'

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      // Get user from Supabase Auth
      const { data: userData } = await supabase.auth.admin.getUserById(userId)

      if (!userData.user?.email) {
        return null
      }

      // Call the polar-user-plan function (same as in renderer)
      const { data: subscriptionData, error } = await supabase.functions.invoke('polar-user-plan')

      if (error || !subscriptionData) {
        this.logger.logger().error('Failed to fetch subscription data:', error)
        return null
      }

      const subscription: UserSubscription = {
        userId,
        subscriptions: subscriptionData.subscriptions || [],
        lastChecked: Date.now()
      }

      this.subscriptionCache.set(userId, subscription)
      await this.saveCache()

      return subscription
    } catch (error) {
      this.logger.logger().error('Error fetching user subscription:', error)
      return null
    }
  }

  async hasBenefit(userId: string, benefitId: string): Promise<boolean> {
    if (!userId) {
      return false
    }

    await this.loadCache()

    let userSubscription = this.subscriptionCache.get(userId)

    // Fetch fresh data if cache is missing or too old
    if (!userSubscription || Date.now() - userSubscription.lastChecked > CACHE_DURATION) {
      userSubscription = await this.fetchUserSubscription(userId)
    }

    if (!userSubscription) {
      return false
    }

    return userSubscription.subscriptions.some((sub) =>
      sub.product.benefits.some((benefit) => benefit.id === benefitId)
    )
  }

  async isPaidUser(userId: string): Promise<boolean> {
    // Check for the cloud-save benefit which indicates a paid user
    return this.hasBenefit(userId, '16955d3e-3e0f-4574-9093-87a32edf237c')
  }

  async clearCache(userId?: string): Promise<void> {
    if (userId) {
      this.subscriptionCache.delete(userId)
    } else {
      this.subscriptionCache.clear()
    }
    await this.saveCache()
  }
}

// Export singleton instance
export const mainProcessAuth = new MainProcessAuth()
