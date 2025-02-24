import { useLogger } from '@@/logger' // Assuming path is correct
import { supabase } from '@@/supabase' // Assuming path is correct
import { User, UserResponse } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { readonly, Ref, ref, shallowRef } from 'vue'
import posthog from 'posthog-js'

// Define a more comprehensive AuthStateType
export type AuthStateType =
  | 'INITIALIZING' // App is checking for existing session
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'ERROR'
  | 'ANONYMOUS' // Anonymously signed in
  | 'LOADING' // Authentication action in progress

export const useAuth = defineStore('auth', () => {
  const logger = useLogger()
  const user = shallowRef<User | null>(null)
  const authState = ref<AuthStateType>('INITIALIZING') as Ref<AuthStateType> // Start in INITIALIZING state
  const isSigningInAnonymously = ref(false)
  const isAuthenticating = ref(false) // Track loading state for auth actions
  const errorMessage = ref<string | null>(null) // For storing error messages to display to the user
  const subscriptions = ref<any[]>([]) // Store user subscriptions

  const setAuthState = (state: AuthStateType) => {
    authState.value = state
    logger.logger().debug(`[Auth State] Changed to: ${state}`)
  }

  const clearError = () => {
    errorMessage.value = null
  }

  const signInAnonymously = async (): Promise<User | null> => {
    if (isSigningInAnonymously.value || isAuthenticating.value) {
      logger.logger().debug('[Auth] Anonymous sign-in already in progress or authenticating.')
      return user.value // Return current user to avoid breaking promise flow
    }

    isSigningInAnonymously.value = true
    isAuthenticating.value = true
    setAuthState('LOADING')
    clearError()

    try {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) {
        logger.logger().error('[Auth] Anonymous sign-in error:', error)
        setAuthState('ERROR')
        errorMessage.value = 'Failed to sign in anonymously.'
        return null
      } else {
        logger.logger().info('[Auth] Signed in anonymously:', data?.user?.id)
        user.value = data?.user || null
        setAuthState('ANONYMOUS') // Use ANONYMOUS state
        return data.user
      }
    } finally {
      isSigningInAnonymously.value = false
      isAuthenticating.value = false
    }
  }

  const fetchSubscription = async () => {
    if (!user.value?.is_anonymous) {
      if (user.value.email) {
        const result = await supabase.functions.invoke('polar-user-plan')
        if (result.data) {
          console.log('result', result)
          subscriptions.value = result.data.subscriptions
        }
      } else {
        console.warn('User email is not available, skipping subscription fetch.')
      }
    } else {
      console.warn('User is anonymous, skipping subscription fetch.')
    }
  }

  supabase.auth.onAuthStateChange((event, session) => {
    // Removed async to make it fully synchronous event handler as we are not initiating async actions inside
    logger.logger().debug('[Auth Change] Event:', event)
    logger.logger().debug('[Auth Change] User ID:', session?.user?.id)

    switch (event) {
      case 'SIGNED_IN':
        if (session?.user) {
          user.value = session.user
          posthog.identify(session.user.id)
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
            .info(
              '[Auth] User already authenticated on initial session:',
              session.user.id,
              'anonymous:',
              session.user.is_anonymous
            )
          posthog.identify(session.user.id, { is_anonymous: session.user.is_anonymous || false })
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
        setAuthState('SIGNED_OUT')
        // No signInAnonymously() here. Let the app handle anonymous sign-in separately if needed after sign-out, or rely on initial sign-in on next load.
        break
      case 'USER_UPDATED': // Or other events you want to handle specifically
        if (session?.user) {
          user.value = session.user // Refresh user data on update
        }
        break
      default:
        logger.logger().warn('[Auth] Unhandled auth event:', event)
        setAuthState('SIGNED_OUT') // Fallback to signed out for unhandled events
        user.value = null
        // No signInAnonymously() here. Similar to SIGNED_OUT, handle anonymous sign-in outside if needed.
        break
    }
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
        await signInAnonymously() // Directly call anonymous sign-in in init if getUser fails.
      } else if (data.user) {
        logger.logger().info('[Auth] Found existing user during init:', data.user.id)
        user.value = data.user
        setAuthState('SIGNED_IN')
        fetchSubscription()
      } else {
        logger.logger().info('[Auth] No user found during init, signing in anonymously...')
        await signInAnonymously() // Directly call anonymous sign-in in init if no user session exists.
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
        fetchSubscription()
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
      const registerResponse = await supabase.auth.updateUser({ email, password }) // Use signUp for registration
      console.log('registerResponse', registerResponse)
      const { data, error } = registerResponse
      if (error) {
        logger.logger().error('[Auth] Registration error:', error)
        setAuthState('ERROR')
        errorMessage.value = 'Failed to register. Please try again.'
        return registerResponse
      } else {
        logger.logger().info('[Auth] Registered new user:', data.user.id)

        // Example webhook call - adjust payload as needed for signUp response
        await supabase.functions.invoke('webhook-post-account-creation', {
          body: {
            id: data.user.id // Use data.user.id from signUp response
          }
        })
        user.value = data.user
        setAuthState('SIGNED_IN')
        fetchSubscription()
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

  return {
    user,
    authState,
    isAuthenticating,
    errorMessage,
    subscriptions: readonly(subscriptions),

    clearError,
    init, // Keep init for explicit re-initialization if needed, though generally called once on app start.
    signInAnonymously,
    login,
    register,
    logout
  }
})
