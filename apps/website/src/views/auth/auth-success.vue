<template>
  <div class="page">
    <div class="confetti">
      <ConfettiExplosion
        :force="0.9"
        v-if="showConfetti"
      />
    </div>

    <div class="verification-container">
      <div class="logo">Pipelab</div>


      <LoadingState
        message="Loading"
        v-if="currentState === 'loading'"
      />

      <SuccessState
        v-else-if="currentState === 'success'"
        :message="successMessage"
        @close="closeWindow"
      />

      <ErrorState
        v-else
        :message="errorMessage"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { supabase } from '@/utils/supabase';
import { onMounted, ref, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import SuccessState from '@/components/auth/auth-sucess/SuccessState.vue';
import ErrorState from '@/components/auth/auth-sucess/ErrorState.vue';
import LoadingState from '@/components/auth/auth-sucess/LoadingState.vue';

import ConfettiExplosion from "vue-confetti-explosion";

const route = useRoute()
const router = useRouter()

const currentState = ref<'loading' | 'error' | 'success'>('loading');
const errorMessage = ref('')
const successMessage = 'Your email has been successfully verified. You can now close this window and continue using our services.'
const showConfetti = ref(false)

console.log('route', route)

watchEffect(() => {
  if (currentState.value === 'success') {
    showConfetti.value = true
  }
})

onMounted(async () => {
  const hashParams = window.location.hash.substring(1).split('&')
  const accessToken = hashParams
    .find(param => param.startsWith('access_token='))
    ?.split('=')[1]
  const refreshToken = hashParams
    .find(param => param.startsWith('refresh_token='))
    ?.split('=')[1]

  const error_ = hashParams
    .find(param => param.startsWith('error='))
    ?.split('=')[1]

  const error_code = hashParams
    .find(param => param.startsWith('error_code='))
    ?.split('=')[1]

  const error_description = hashParams
    .find(param => param.startsWith('error_description='))
    ?.split('=')[1]

  if (error_ || !accessToken ||!refreshToken) {
    if (error_description) {
      errorMessage.value = error_description
    } else if (!accessToken) {
      errorMessage.value = 'Missing access token'
    } else if (!refreshToken) {
      errorMessage.value = 'Missing refresh token'
    }
    currentState.value = 'error'
    return
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  router.replace({ hash: '' })

  console.log('data', data)

  if (!error && data.user) {
    try {
      await supabase.functions.invoke('webhook-post-account-creation', {
        body: {
          id: data.user.id
        }
      })

      currentState.value = 'success'
    } catch (e) {
      currentState.value = 'error'
      errorMessage.value = 'Error setting up account. Send us an email if you have any problems: contact@pipelab.app'
    }
  } else {
    currentState.value = 'error'
    errorMessage.value = 'Error creating session'
  }

  router.replace({ hash: '' })
})

const closeWindow = () => {
  window.open('pipelab://open')
}
</script>

<style lang="scss" scoped>
:root {
  --primary-color: #4f46e5;
  --success-color: #10b981;
  --error-color: #ef4444;
  --text-color: #1f2937;
  --bg-color: #f9fafb;
}

.page {
  background-color: var(--bg-color);
  color: var(--text-color);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: visible;
}

.confetti {
  position: absolute;
  transform: translate(-50%, 0);
}

.verification-container {
  max-width: 500px;
  width: 90%;
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  text-align: center;
  overflow: hidden;
}

.logo {
  margin-bottom: 1.5rem;
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--primary-color);
}
</style>