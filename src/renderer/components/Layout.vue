<template>
  <div class="layout">
    <div class="header">
      <div class="bold title">{{ headerSentence }}</div>
      <div class="button">
        <Button link class="list-item" @click="toggleAccountMenu">
          <i class="icon mdi mdi-account fs-24"></i>
        </Button>
        <Menu ref="$menu" :model="accountMenuItems" :popup="true" />
      </div>
    </div>
    <div class="content">
      <slot></slot>
    </div>
    <div class="footer">
      <div class="update-status">{{ updateStatusText }}</div>
      <div class="version-text">{{ appVersion }}</div>
    </div>

    <Dialog
      v-model:visible="isAuthModalVisible"
      modal
      :style="{ width: '30vw' }"
      :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">
            {{ authModalTitle ? authModalTitle : type === 'login' ? 'Login' : 'Register' }}
          </p>
          <p class="text-center">{{ authModalSubTitle }}</p>
        </div>
      </template>

      <div v-if="type === 'login'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="username-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Password
                    id="password1"
                    v-model="passwordModel"
                    v-bind="passwordProps"
                    placeholder="Password"
                    :toggle-mask="true"
                    :feedback="false"
                    :invalid="!!errors.password"
                    :class="{
                      'w-full': true
                    }"
                    input-class="w-full"
                  >
                  </Password>

                  <small v-if="errors.password" class="p-error">
                    {{ errors.password }}
                  </small>

                  <div class="mb-2"></div>

                  <div class="flex align-items-center justify-content-between mb-5">
                    <Button text> Forgot password? </Button>
                  </div>

                  <Button
                    type="submit"
                    label="Sign In"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    :loading="authState === 'LOADING'"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Don't have an account?"
                    class="w-full p-3 text-lg"
                    @click="type = 'register'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div v-if="type === 'register'" class="login">
        <div class="grid justify-content-center">
          <div class="col-12 xl:col-6 w-full">
            <div class="h-full w-full">
              <!-- @vue-expect-error -->
              <form @submit.prevent="handleSubmit">
                <div class="w-full md:w-10 mx-auto">
                  <InputText
                    id="mail"
                    v-model="emailModel"
                    v-bind="emailProps"
                    type="text"
                    :class="{
                      'w-full': true
                    }"
                    placeholder="Email"
                    :invalid="!!errors.email"
                  />
                  <small v-if="errors.email" id="username-help">
                    {{ errors.email }}
                  </small>

                  <div class="mb-2"></div>

                  <Password
                    id="password1"
                    v-model="passwordModel"
                    v-bind="passwordProps"
                    placeholder="Password"
                    :toggle-mask="true"
                    :invalid="!!errors.password"
                    :class="{
                      'w-full': true
                    }"
                    input-class="w-full"
                  >
                    <template #header>
                      <div class="text-lg font-bold mb-3">Pick a password</div>
                    </template>

                    <!-- @vue-expect-error -->
                    <template #footer="sp">
                      <!-- @vue-expect-error -->
                      {{ sp.level }}
                      <Divider />
                      <ul class="pl-2 ml-2 mt-0 line-height-3">
                        <li>At least one lowercase</li>
                        <li>At least one uppercase</li>
                        <li>At leaset one numeric</li>
                        <li>Minimum 10 characters</li>
                      </ul>
                    </template>
                  </Password>

                  <small v-if="errors.password" class="p-error">
                    {{ errors.password }}
                  </small>

                  <div class="mb-2"></div>

                  <div class="flex align-items-center justify-content-between mb-5">
                    <Button text> Forgot password? </Button>
                  </div>

                  <Button
                    type="submit"
                    label="Sign Up"
                    color="primary"
                    class="w-full p-3 text-lg mb-2"
                    :loading="authState === 'LOADING'"
                    @click="onSubmit"
                  />
                  <Button
                    text
                    label="Already have an account?"
                    class="w-full p-3 text-lg"
                    @click="type = 'login'"
                  />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="isSettingsModalVisible"
      modal
      :style="{ width: '75vw', height: '80%' }"
      :breakpoints="{ '575px': '90vw' }"
    >
      <template #header>
        <div class="flex flex-column w-full">
          <p class="text-xl text-center">Settings</p>
        </div>
      </template>

      <Settings></Settings>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '@renderer/store/auth'
import { MenuItem } from 'primevue/menuitem'
import { useLogger } from '@@/logger'
import Settings from '@renderer/components/Settings.vue'
import { useToast } from 'primevue/usetoast'
import Menu from 'primevue/menu'
import Button from 'primevue/button'
import { UpdateStatus } from '@main/api'
import { email, minLength, nonEmpty, object, pipe, regex, string } from 'valibot'
import { toTypedSchema } from '@vee-validate/valibot'
import posthog from 'posthog-js'
import { storeToRefs } from 'pinia'
import { handle } from '@renderer/composables/handlers'
import { useForm } from 'vee-validate'
import { useRoute } from 'vue-router'

const { logger } = useLogger()

const $menu = ref()

const route = useRoute()

const headerSentence = computed(() => {
  return route.meta?.title as string
})

const updateStatus = ref<UpdateStatus>('update-not-available')

const appVersion = ref(window.version)
posthog.register({
  'app-version': appVersion.value
})

const updateStatusText = computed(() => {
  switch (updateStatus.value) {
    case 'update-not-available':
      return ''
    case 'update-available':
      return 'Update available, downloading...'
    case 'update-downloaded':
      return 'Update downloaded'
    case 'checking-for-update':
      return 'Checking for update...'
    case 'error':
      return 'Error'
    default:
      return ''
  }
})

const toggleAccountMenu = (event: MouseEvent) => {
  $menu.value.toggle(event)
}

const type = ref<'login' | 'register'>('login')

const logout = async () => {
  await auth.logout()
}

const auth = useAuth()
const { user, authState, isAuthModalVisible, authModalTitle, authModalSubTitle } = storeToRefs(auth)
const isSettingsModalVisible = ref(false)

const accountMenuItems = computed(() => {
  const items: MenuItem[] = []

  if (user.value) {
    items.push(
      {
        label: user.value.email,
        icon: 'mdi mdi-email',
        disabled: true
      },
      {
        label: 'Profile',
        icon: 'mdi mdi-account',
        disabled: true
      },
      {
        label: 'Team',
        icon: 'mdi mdi-account-multiple',
        disabled: true
      },
      {
        separator: true
      },
      {
        label: 'Logout',
        icon: 'mdi mdi-logout',
        disabled: false,
        command: async () => {
          await logout()
        }
      }
    )
  } else {
    items.push({
      label: 'Login / Register',
      icon: 'mdi mdi-account',
      command: () => {
        auth.displayAuthModal()
      }
    } satisfies MenuItem)
  }

  items.push(
    {
      separator: true
    },
    {
      label: appVersion,
      icon: 'mdi mdi-information'
    }
  )

  const result = [
    {
      label: 'Account',
      icon: 'mdi mdi-account',
      items
    },
    {
      separator: true
    },
    {
      label: 'Settings',
      icon: 'mdi mdi-cog',
      disabled: false,
      command: () => {
        console.log('Settings')
        isSettingsModalVisible.value = true
      }
    }
  ] satisfies MenuItem

  return result
})

handle('update:set-status', async (event, { value }) => {
  console.log('event', event)
  console.log('value', value)

  updateStatus.value = value.status
})

const schema = toTypedSchema(
  object({
    email: pipe(
      string('An email adress is required'),
      nonEmpty('Email is required'),
      email('Invalid email')
    ),
    password: pipe(
      string('A password is required'),
      nonEmpty('Password is required'),
      minLength(10, 'Password must be at least 10 characters long'),
      regex(/[a-z]/, 'Password must contain at least one lowercase letter'),
      regex(/[A-Z]/, 'Password must contain at least one uppercase letter'),
      regex(/[0-9]/, 'Password must contain at least one number'),
      regex(/[!@#$%^&*()_+-=[\]{};':"|<>?,./`~.]/, 'Password must contain at least one symbol')
    )
  })
)

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: schema
})

const [emailModel, emailProps] = defineField('email')
const [passwordModel, passwordProps] = defineField('password')

const onSuccess = async (values: any) => {
  try {
    if (type.value === 'register') {
      const { error } = await auth.register(values.email, values.password)
      if (error) {
        console.log('error', error)
        toast.add({
          severity: 'error',
          summary: 'Failed to register',
          detail: error.message,
          life: 3000
        })
      } else {
        isAuthModalVisible.value = false
        toast.add({
          severity: 'success',
          summary: 'Sucessfully registered',
          detail: 'A confirmation e-mail has been sent',
          life: 3000
        })
      }
    } else {
      const { error } = await auth.login(values.email, values.password)
      if (error) {
        console.log('error', error)
        toast.add({
          severity: 'error',
          summary: 'Failed to login',
          detail: error.message,
          life: 3000
        })
      } else {
        isAuthModalVisible.value = false
        toast.add({
          severity: 'success',
          summary: 'Sucessfully logged in',
          detail: 'Welcome back!',
          life: 3000
        })
      }
    }
  } catch (error) {
    console.log('error', error)
    toast.add({ severity: 'info', summary: 'Info', detail: error, life: 3000 })
  }
}

const toast = useToast()

function onInvalidSubmit({ values, errors, results }: any) {
  logger().info({ values }) // current form values
  logger().info({ errors }) // a map of field names and their first error message
  logger().info({ results }) // a detailed map of field names and their validation results
}

const onSubmit = handleSubmit(onSuccess, onInvalidSubmit)
</script>

<style lang="scss" scoped>
.layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  .header {
    padding: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--surface-card);
    border-bottom: 1px solid var(--surface-border);

    .title {
      font-size: 1.5rem;
      line-height: 2rem;
      margin-left: 12px;
    }

    .button {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  }

  .footer {
    height: 24px;
    background-color: #eee;
    border-top: 1px solid #ddd;
    display: flex;
    flex-direction: row;
    justify-content: end;
    align-items: center;
    font-size: 12px;
    padding: 0 8px;
  }

  .content {
    flex: 1;
    overflow: auto;
  }
}
</style>
