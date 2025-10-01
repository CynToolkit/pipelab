import { SubscriptionError } from './build-history'

export class SubscriptionRequiredError extends Error implements SubscriptionError {
  public readonly code = 'SUBSCRIPTION_REQUIRED' as const
  public benefit: string
  public userMessage: string

  constructor(benefit?: string) {
    super(`Subscription required${benefit ? ` for benefit: ${benefit}` : ''}`)
    this.name = 'SubscriptionRequiredError'
    this.benefit = benefit || 'build-history'
    this.userMessage = `Build history is a premium feature. Please upgrade your subscription to access this feature.`
  }
}

export class SubscriptionExpiredError extends Error implements SubscriptionError {
  public readonly code = 'SUBSCRIPTION_EXPIRED' as const
  public benefit: string
  public userMessage: string

  constructor(benefit?: string) {
    super(`Subscription expired${benefit ? ` for benefit: ${benefit}` : ''}`)
    this.name = 'SubscriptionExpiredError'
    this.benefit = benefit || 'build-history'
    this.userMessage = `Your subscription has expired. Please renew your subscription to continue using build history.`
  }
}

export class BenefitNotFoundError extends Error implements SubscriptionError {
  public readonly code = 'BENEFIT_NOT_FOUND' as const
  public benefit: string
  public userMessage: string

  constructor(benefit: string) {
    super(`Benefit not found: ${benefit}`)
    this.name = 'BenefitNotFoundError'
    this.benefit = benefit
    this.userMessage = `The requested feature (${benefit}) is not available in your current subscription.`
  }
}

export class UnauthorizedError extends Error implements SubscriptionError {
  public readonly code = 'UNAUTHORIZED' as const
  public benefit?: string
  public userMessage: string

  constructor(message?: string, benefit?: string) {
    super(message || 'Unauthorized access')
    this.name = 'UnauthorizedError'
    this.benefit = benefit
    this.userMessage = message || 'You do not have permission to access this feature.'
  }
}

export function createSubscriptionError(
  code: SubscriptionError['code'],
  benefit?: string,
  customMessage?: string
): SubscriptionError {
  switch (code) {
    case 'SUBSCRIPTION_REQUIRED':
      return new SubscriptionRequiredError(benefit)
    case 'SUBSCRIPTION_EXPIRED':
      return new SubscriptionExpiredError(benefit)
    case 'BENEFIT_NOT_FOUND':
      if (!benefit) throw new Error('Benefit is required for BENEFIT_NOT_FOUND error')
      return new BenefitNotFoundError(benefit)
    case 'UNAUTHORIZED':
      return new UnauthorizedError(customMessage, benefit)
    default:
      throw new Error(`Unknown subscription error code: ${code}`)
  }
}

export function isSubscriptionError(error: unknown): error is SubscriptionError {
  return error instanceof Error && 'code' in error && 'userMessage' in error
}

export function getSubscriptionErrorMessage(error: unknown): string {
  if (isSubscriptionError(error)) {
    return error.userMessage
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unknown error occurred'
}
