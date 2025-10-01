import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SubscriptionRequiredError, BenefitNotFoundError } from '../shared/subscription-errors'
import { mainProcessAuth } from '../main/auth'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data')
  }
}))

// Mock file system
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn()
}))

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn()
      }
    },
    functions: {
      invoke: vi.fn()
    }
  }))
}))

// Mock logger
vi.mock('../shared/logger', () => ({
  useLogger: vi.fn(() => ({
    logger: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }))
  }))
}))

describe('Build History Authorization', () => {
  let auth: typeof mainProcessAuth

  beforeEach(() => {
    auth = new (mainProcessAuth.constructor as any)()
    vi.clearAllMocks()
  })

  describe('Subscription Error Types', () => {
    it('should create SubscriptionRequiredError with correct properties', () => {
      const error = new SubscriptionRequiredError('build-history')

      expect(error.code).toBe('SUBSCRIPTION_REQUIRED')
      expect(error.benefit).toBe('build-history')
      expect(error.userMessage).toContain('premium feature')
      expect(error.userMessage).toContain('upgrade your subscription')
    })

    it('should create BenefitNotFoundError with correct properties', () => {
      const error = new BenefitNotFoundError('test-benefit')

      expect(error.code).toBe('BENEFIT_NOT_FOUND')
      expect(error.benefit).toBe('test-benefit')
      expect(error.userMessage).toContain('not available in your current subscription')
    })

    it('should identify subscription errors correctly', () => {
      const { isSubscriptionError } = require('../shared/subscription-errors')

      expect(isSubscriptionError(new SubscriptionRequiredError())).toBe(true)
      expect(isSubscriptionError(new BenefitNotFoundError('test'))).toBe(true)
      expect(isSubscriptionError(new Error('Regular error'))).toBe(false)
    })
  })

  describe('Main Process Authorization', () => {
    it('should return false for unauthorized user', async () => {
      // Mock the subscription check to return no subscriptions
      const mockSupabase = require('@supabase/supabase-js').createClient()
      mockSupabase.functions.invoke.mockResolvedValue({
        data: { subscriptions: [] }
      })

      const hasAccess = await auth.hasBenefit('user123', '16955d3e-3e0f-4574-9093-87a32edf237c')
      expect(hasAccess).toBe(false)
    })

    it('should return true for authorized user', async () => {
      // Mock the subscription check to return valid subscription
      const mockSupabase = require('@supabase/supabase-js').createClient()
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          subscriptions: [
            {
              product: {
                benefits: [
                  {
                    id: '16955d3e-3e0f-4574-9093-87a32edf237c',
                    name: 'cloud-save'
                  }
                ]
              }
            }
          ]
        }
      })

      const hasAccess = await auth.hasBenefit('user123', '16955d3e-3e0f-4574-9093-87a32edf237c')
      expect(hasAccess).toBe(true)
    })

    it('should handle subscription check errors gracefully', async () => {
      // Mock the subscription check to throw an error
      const mockSupabase = require('@supabase/supabase-js').createClient()
      mockSupabase.functions.invoke.mockRejectedValue(new Error('Network error'))

      const hasAccess = await auth.hasBenefit('user123', '16955d3e-3e0f-4574-9093-87a32edf237c')
      expect(hasAccess).toBe(false)
    })
  })

  describe('Error Message Handling', () => {
    it('should extract user-friendly messages from subscription errors', () => {
      const { getSubscriptionErrorMessage } = require('../shared/subscription-errors')

      const error = new SubscriptionRequiredError('build-history')
      const message = getSubscriptionErrorMessage(error)

      expect(message).toBe(error.userMessage)
      expect(message).toContain('premium feature')
    })

    it('should handle regular errors', () => {
      const { getSubscriptionErrorMessage } = require('../shared/subscription-errors')

      const error = new Error('Regular error message')
      const message = getSubscriptionErrorMessage(error)

      expect(message).toBe('Regular error message')
    })

    it('should handle unknown error types', () => {
      const { getSubscriptionErrorMessage } = require('../shared/subscription-errors')

      const message = getSubscriptionErrorMessage(null)

      expect(message).toBe('An unknown error occurred')
    })
  })
})
