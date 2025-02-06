import { useLogger } from '@@/logger'
import { supabase } from '@@/supabase'
import { User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import posthog from 'posthog-js'

export const useAuth = defineStore('auth', () => {
  const { logger } = useLogger()
  const user = shallowRef<User>()

  const networkState = ref<'online' | 'offline'>('offline')

  supabase.auth.onAuthStateChange((event, session) => {
    console.log('event', event)
    if (event === 'SIGNED_IN') {
      user.value = session?.user
      posthog.identify(session?.user.id)
      console.log('posthog.get_distinct_id()', posthog.get_distinct_id())
    } else {
      user.value = undefined
    }
  })

  window.addEventListener('online', () => {
    logger().info('online')
    networkState.value = 'online'
    if (!user.value) {
      init()
    }
  })

  window.addEventListener('offline', () => {
    logger().info('offline')
    networkState.value = 'offline'
  })

  const init = async () => {
    // console.log('init auth')
    // try {
    //   const {
    //     data: { user: supaUser }
    //   } = await supabase.auth.getUser()
    //   user.value = supaUser
    // } catch (e) {
    //   logger().error(e)
    // }
  }

  const login = (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password })
  }

  const loginAnonymous = () => {
    if (user.value) {
      console.log('user already authenticated')
      return
    }
    return supabase.auth.signInAnonymously()
  }

  const register = (email: string, password: string) => {
    return supabase.auth.updateUser({ email, password })
    // const { data } = await supabase.auth.signUp({ email, password })
  }

  return {
    user,

    init,
    login,
    register,
    loginAnonymous
  }
})
