import { useLogger } from '@@/logger'
import { supabase } from '@@/supabase'
import { User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import posthog from 'posthog-js'

export const useAuth = defineStore('auth', () => {
  const user = shallowRef<User | null>(null)
  const authState = ref<'SIGNED_IN' | undefined>()
  const isSigningInAnonymously = ref(false) // Ajout d'un verrou pour éviter les appels en double

  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth Change] Event:', event)
    console.log('[Auth Change] User ID:', session?.user?.id)

    if (event === 'SIGNED_IN' && session?.user) {
      user.value = session.user
      posthog.identify(session.user.id)
      authState.value = 'SIGNED_IN'
    } else if (event === 'INITIAL_SESSION') {
      console.log('[Auth] Checking existing user...')

      if (session?.user) {
        console.log('[Auth] User already authenticated:', session.user.id)
        user.value = session.user
        authState.value = 'SIGNED_IN'
      } else {
        console.log('[Auth] No user found, signing in anonymously...')

        if (!isSigningInAnonymously.value) {
          isSigningInAnonymously.value = true
          try {
            const { data, error } = await supabase.auth.signInAnonymously()
            if (error) {
              console.error('[Auth] Anonymous sign-in error:', error)
            } else {
              console.log('[Auth] Signed in anonymously:', data?.user?.id)
              user.value = data?.user || null
              authState.value = 'SIGNED_IN'
            }
          } finally {
            isSigningInAnonymously.value = false
          }
        } else {
          console.log('[Auth] Anonymous sign-in already in progress.')
        }
      }
    } else {
      console.log('[Auth] Signed out.')
      user.value = null
      authState.value = undefined
    }
  })

  const init = async () => {
    console.log('[Auth] Initializing authentication...')
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error) {
        console.error('[Auth] Error fetching user:', error)
      } else if (data.user) {
        console.log('[Auth] Found existing user:', data.user.id)
        user.value = data.user
        authState.value = 'SIGNED_IN'
      }
    } catch (e) {
      console.error('[Auth] Unexpected error:', e)
    }
  }

  const login = (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
  }

  const register = (email: string, password: string) => {
    return supabase.auth.updateUser({ email, password })
  }

  return {
    user,
    authState,
    init,
    login,
    register,
  }
})
