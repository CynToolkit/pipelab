import { supabase } from "@@/supabase";
import { User } from "@supabase/supabase-js";
import { defineStore } from "pinia";
import { shallowRef } from "vue";

export const useAuth = defineStore('auth', () => {
  const user = shallowRef<User>()

  const init = async () => {
    const { data: { user: supaUser } } = await supabase.auth.getUser()

    console.log('supaUser', supaUser)
    user.value = supaUser
  }

  const login = async (email: string, password: string) => {
    const { data: user } = await supabase.auth.signInWithPassword({ email, password })

    console.log('user', user)
  }

  const register = async (email: string, password: string) => {
    const { data: user } = await supabase.auth.signUp({ email, password })

    console.log('user', user)
  }

  return {
    user,

    init,
    login,
    register,
  }
})
