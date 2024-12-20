import { useLogger } from '@@/logger'
import { supabase } from '@@/supabase'
import { User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export const useAuth = defineStore('auth', () => {
  const { logger } = useLogger()
  const user = shallowRef<User>()

  const networkState = ref<'online' | 'offline'>('offline')

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
    console.log('init auth')
    try {
      const {
        data: { user: supaUser }
      } = await supabase.auth.getUser()

      user.value = supaUser
    } catch (e) {
      logger().error(e)
    }
  }

  const login = async (email: string, password: string) => {
    const { data } = await supabase.auth.signInWithPassword({ email, password })

    user.value = data.user
  }

  const register = async (email: string, password: string) => {
    const { data } = await supabase.auth.signUp({ email, password })
    user.value = data.user
  }

  return {
    user,

    init,
    login,
    register
  }
})
