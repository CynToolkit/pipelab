import { useLogger } from '@@/logger' // Assuming path is correct
import { supabase } from '@@/supabase' // Assuming path is correct
import { AuthChangeEvent, Session, User, UserResponse } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, readonly, Ref, ref, shallowRef } from 'vue'
import posthog from 'posthog-js'
import { email } from 'valibot'
import { Subscription } from '@polar-sh/sdk/dist/commonjs/models/components/subscription'
import { createEventHook } from '@vueuse/core'

// Define a more comprehensive AuthStateType
export type AuthStateType =
  | 'INITIALIZING' // App is checking for existing session
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'ERROR'
  | 'AWAITING_VALIDATION'
  | 'LOADING' // Authentication action in progress

export const useAuth = defineStore('auth', () => {
  const logger = useLogger()
  const user = shallowRef<User>()
  const authState = ref<AuthStateType>('INITIALIZING') as Ref<AuthStateType> // Start in INITIALIZING state
  const isAuthenticating = ref(false) // Track loading state for auth actions
  const errorMessage = ref<string>() // For storing error messages to display to the user
  const subscriptions = ref<Subscription[]>([]) // Store user subscriptions
  const subscriptionError = ref<string>() // Store subscription loading errors

  const isAuthModalVisible = ref(false)
  const authModalTitle = ref<string>()
  const authModalSubTitle = ref<string>()

  const onAuthChanged = createEventHook<{ event: AuthChangeEvent; session: Session }>()
  const onSubscriptionChanged = createEventHook<{ subscriptions: Subscription[] }>()

  const displayAuthModal = (title?: string, subtitle?: string) => {
    isAuthModalVisible.value = true
    authModalTitle.value = title
    authModalSubTitle.value = subtitle
  }

  const hideAuthModal = () => {
    isAuthModalVisible.value = false
    authModalTitle.value = undefined
    authModalSubTitle.value = undefined
  }

  const setAuthState = (state: AuthStateType) => {
    authState.value = state
    logger.logger().debug(`[Auth State] Changed to: ${state}`)
  }

  const clearError = () => {
    errorMessage.value = null
  }

  const fetchSubscription = async () => {
    console.log('[Auth] fetchSubscription: Starting, setting isLoadingSubscriptions to true')
    isLoadingSubscriptions.value = true
    subscriptionError.value = undefined
    if (user.value) {
      if (user.value.email) {
        try {
          const result = await supabase.functions.invoke('polar-user-plan')
          if (result.error) {
            throw new Error(result.error.message || 'Network error')
          }
          if (!result.data) {
            throw new Error('Invalid response: no data')
          }
          if (!Array.isArray(result.data.subscriptions)) {
            throw new Error('Invalid response: subscriptions is not an array')
          }
          console.log('Subscription result', result)
          subscriptions.value = result.data.subscriptions
        } catch (error) {
          console.error('Failed to fetch subscription:', error)
          subscriptionError.value = error instanceof Error ? error.message : 'Unknown error'
          subscriptions.value = []
        }
      } else {
        console.warn('User email is not available, skipping subscription fetch.')
        subscriptionError.value = 'User email not available'
        subscriptions.value = []
      }
    } else {
      console.warn('User is anonymous, skipping subscription fetch.')
      subscriptionError.value = 'User is anonymous'
      subscriptions.value = []
    }
    console.log('[Auth] fetchSubscription: Completed, setting isLoadingSubscriptions to false')
    isLoadingSubscriptions.value = false
    console.log('onSubscriptionChanged.trigger')
    onSubscriptionChanged.trigger({ subscriptions: subscriptions.value })
  }

  supabase.auth.onAuthStateChange((event, session) => {
    // Removed async to make it fully synchronous event handler as we are not initiating async actions inside
    logger.logger().debug('[Auth Change] Event:', event)
    logger
      .logger()
      .debug(
        '[Auth Change] User ID:',
        session?.user?.id,
        'is_anonymous:',
        session?.user?.is_anonymous,
        'email:',
        session?.user?.email
      )

    switch (event) {
      case 'SIGNED_IN':
        if (session?.user) {
          user.value = session.user
          console.log('Session', session)
          posthog.identify(session.user.id, {
            email: session.user.email,
            is_anonymous: session.user.is_anonymous || false
          })
          setAuthState('SIGNED_IN')
        }
        break
      case 'INITIAL_SESSION':
        logger
          .logger()
          .debug('[Auth] Initial Session event - Handling session check in init function.')
        // No action here. Initial session check and anonymous sign-in is handled in init() now.
        if (session?.user) {
          logger
            .logger()
            .debug(
              '[Auth Change] User ID:',
              session?.user?.id,
              'is_anonymous:',
              session?.user?.is_anonymous,
              'email:',
              session?.user?.email
            )
          console.log('Session', session)
          posthog.identify(session.user.id, {
            email: session.user.email,
            is_anonymous: session.user.is_anonymous || false
          })
          user.value = session.user
          setAuthState('SIGNED_IN')
        } else {
          logger
            .logger()
            .info(
              '[Auth] No user found on initial session, anonymous sign-in will be triggered in init().'
            )
          // Anonymous sign-in will be handled in the init() function if no user is found after initial check.
        }
        break
      case 'SIGNED_OUT':
        logger.logger().info('[Auth] Signed out event.')
        user.value = null
        posthog.reset()
        setAuthState('SIGNED_OUT')
        // No signInAnonymously() here. Let the app handle anonymous sign-in separately if needed after sign-out, or rely on initial sign-in on next load.
        break
      case 'USER_UPDATED': // Or other events you want to handle specifically
        if (session?.user) {
          user.value = session.user // Refresh user data on update
        }
        break
      case 'TOKEN_REFRESHED':
        break
      default:
        logger.logger().warn('[Auth] Unhandled auth event:', event)
        // setAuthState('SIGNED_OUT') // Fallback to signed out for unhandled events
        // user.value = null
        // No signInAnonymously() here. Similar to SIGNED_OUT, handle anonymous sign-in outside if needed.
        break
    }

    onAuthChanged.trigger({ event, session })
  })

  // Explicitly initialize the auth state when the store is created
  const init = async () => {
    if (authState.value !== 'INITIALIZING') {
      logger.logger().warn('[Auth] Init called when not in INITIALIZING state. Ignoring.')
      return // Prevent duplicate init calls
    }
    logger.logger().info('[Auth] Initializing authentication...')
    setAuthState('LOADING') // Set loading state during init
    try {
      const { data, error } = await supabase.auth.getUser() // Use getUser for initial check
      if (error) {
        logger.logger().error('[Auth] Error fetching user during init:', error)
        // Fallback to anonymous sign-in on init error, as initial user fetch failed.
        logger
          .logger()
          .info('[Auth] Falling back to anonymous sign-in due to initial user fetch error.')
      } else if (data.user) {
        logger
          .logger()
          .info(
            '[Auth] Found existing user during init:',
            data.user.id,
            'anonymous:',
            data.user.is_anonymous,
            'email:',
            data.user.email
          )
        console.log('Session', data)
        posthog.identify(data.user.id, {
          email: data.user.email,
          is_anonymous: data.user.is_anonymous || false
        })
        user.value = data.user
        setAuthState('SIGNED_IN')
        await fetchSubscription()
      } else {
        logger.logger().info('[Auth] No user found during init, signing in anonymously...')
        posthog.identify()
      }
    } catch (e) {
      logger.logger().error('[Auth] Unexpected error during init:', e)
      setAuthState('ERROR') // Set error state if init fails unexpectedly
      errorMessage.value = 'Failed to initialize authentication.'
    } finally {
      if (authState.value === 'LOADING') {
        // Ensure we transition from loading state even if errors occur during init
        if (
          authState.value !== 'SIGNED_IN' &&
          authState.value !== 'ANONYMOUS' &&
          authState.value !== 'ERROR'
        ) {
          // If after init, state is still loading and not signed in or anonymous, default to signed out (though should ideally be ANONYMOUS or ERROR after signInAnonymously in error cases).
          setAuthState('SIGNED_OUT') // As a last resort fallback, though ideally we should be in ANONYMOUS or ERROR state if initial auth fails and anonymous sign in is attempted in init.
        }
      }
    }
  }

  const login = async (email: string, password: string): Promise<UserResponse> => {
    isAuthenticating.value = true
    setAuthState('LOADING')
    clearError()
    try {
      const loginResponse = await supabase.auth.signInWithPassword({ email, password })
      const { data, error } = loginResponse
      if (error) {
        logger.logger().error('[Auth] Login error:', error)
        setAuthState('ERROR')
        errorMessage.value = 'Invalid login credentials.'
        return loginResponse
      } else {
        logger.logger().info('[Auth] Logged in user:', data.user.id)
        user.value = data.user
        setAuthState('SIGNED_IN')
        await fetchSubscription()
        return loginResponse
      }
    } finally {
      isAuthenticating.value = false
    }
  }

  const register = async (email: string, password: string): Promise<UserResponse> => {
    isAuthenticating.value = true
    setAuthState('LOADING')
    clearError()
    try {
      const registerResponse = await supabase.auth.signUp({ email, password }) // Use signUp for registration
      console.log('registerResponse', registerResponse)
      const { data, error } = registerResponse
      if (error) {
        logger.logger().error('[Auth] Registration error:', error)
        setAuthState('ERROR')
        errorMessage.value = 'Failed to register. Please try again.'
        return registerResponse
      } else {
        // an email is sent, you must validate it
        logger.logger().info('[Auth] Registered new user:', data.user.id)
        setAuthState('AWAITING_VALIDATION')
        return registerResponse
      }
    } finally {
      isAuthenticating.value = false
    }
  }

  const logout = async (): Promise<void> => {
    isAuthenticating.value = true // Indicate loading during logout if needed
    setAuthState('LOADING') // Optionally set authState to loading during logout
    clearError()
    try {
      await supabase.auth.signOut()
      logger.logger().info('[Auth] Signed out.')
      user.value = null // Already handled in onAuthStateChange('SIGNED_OUT') but good to keep for immediate null user.
      setAuthState('SIGNED_OUT') // Ensure state is set to signed out - also handled in onAuthStateChange, but good for clarity
      subscriptions.value = []
    } catch (error) {
      logger.logger().error('[Auth] Logout error:', error)
      setAuthState('ERROR')
      errorMessage.value = 'Failed to logout.'
    } finally {
      isAuthenticating.value = false
    }
  }

  // Call init immediately when the store is created to check initial auth state
  init()

  const isLoggedIn = computed(() => authState.value === 'SIGNED_IN')

  const benefits = {
    'cloud-save': '16955d3e-3e0f-4574-9093-87a32edf237c',
    'build-history': 'b77e9800-8302-4581-8df3-6f1b979acef5'
  }

  const devOverrides = ref<Record<string, string>>({})

  const loadDevOverrides = () => {
    if (process.env.NODE_ENV === 'development') {
      const stored = localStorage.getItem('dev-benefits-overrides')
      if (stored) {
        devOverrides.value = JSON.parse(stored)
      }
    }
  }

  const saveDevOverrides = () => {
    if (process.env.NODE_ENV === 'development') {
      localStorage.setItem('dev-benefits-overrides', JSON.stringify(devOverrides.value))
    }
  }

  const setDevOverride = (benefit: string, value: string) => {
    console.log(`[setDevOverride] Setting ${benefit} to ${value}`)
    devOverrides.value[benefit] = value
    saveDevOverrides()
    console.log(`[setDevOverride] devOverrides now:`, devOverrides.value)
  }

  const getActualBenefit = (benefit: keyof typeof benefits) => {
    // Check subscriptions for actual status
    return subscriptions.value.some((sub) =>
      sub.product.benefits.map((b) => b.id).includes(benefits[benefit])
    )
  }

  const hasBenefit = (benefit: keyof typeof benefits) => {
    // Check dev overrides in development mode
    if (process.env.NODE_ENV === 'development') {
      const override = devOverrides.value[benefit]
      console.log(`[hasBenefit] ${benefit}: override=${override}`)
      if (override !== undefined) {
        switch (override) {
          case 'force-on':
            console.log(`[hasBenefit] ${benefit}: forcing ON`)
            return true
          case 'force-off':
            console.log(`[hasBenefit] ${benefit}: forcing OFF`)
            return false
          case 'actual':
          default:
            console.log(`[hasBenefit] ${benefit}: using actual`)
            // Fall through to actual check
            break
        }
      }
    }

    // Default behavior: check subscriptions
    const actual = getActualBenefit(benefit)
    console.log(`[hasBenefit] ${benefit}: actual=${actual}`)
    return actual
  }

  // Load overrides on store creation
  loadDevOverrides()

  const hasBuildHistoryBenefit = computed(() => hasBenefit('build-history'))
  const hasCloudSaveBenefit = computed(() => hasBenefit('cloud-save'))

  const isLoadingSubscriptions = ref(false)

  return {
    user,
    authState,
    isLoggedIn,
    isAuthenticating,
    errorMessage,
    subscriptions: readonly(subscriptions),
    subscriptionError: readonly(subscriptionError),
    isLoadingSubscriptions,
    hasBenefit,
    getActualBenefit,
    devOverrides: readonly(devOverrides),
    setDevOverride,

    clearError,
    init, // Keep init for explicit re-initialization if needed, though generally called once on app start.
    login,
    register,
    logout,
    fetchSubscription,

    displayAuthModal,
    hideAuthModal,
    isAuthModalVisible,
    authModalTitle,
    authModalSubTitle,

    hasBuildHistoryBenefit,
    hasCloudSaveBenefit,

    onAuthChanged: onAuthChanged.on,
    onSubscriptionChanged: onSubscriptionChanged.on
  }
})
