<template>
  <div class="app">
    <suspense timeout="0">
      <template #default>
        <div class="layout">
          <div class="container">
            <!-- <Menubar :model="items">
              <template #start>
                <Skeleton width="10rem" height="4rem"></Skeleton>
              </template>
              <template #end>
                <Avatar label="" size="large" shape="circle" />
              </template>
            </Menubar> -->
            <div class="content">
              <div class="sidebar">
                <div class="sidebar-title">Cyn</div>

                <div class="list">
                  <router-link class="list-item" :to="{ name: 'Dashboard' }">
                    <i class="icon pi pi-objects-column"></i>
                    Dashboard
                  </router-link>
                  <router-link class="list-item" :to="{ name: 'Scenarios' }">
                    <i class="icon pi pi-list"></i>
                    Scenarios
                  </router-link>
                  <router-link class="list-item" :to="{ name: 'Team' }">
                    <i class="icon pi pi-list"></i>
                    Team
                  </router-link>
                  <router-link class="list-item" :to="{ name: 'Settings' }">
                    <i class="icon pi pi-list"></i>
                    Settings
                  </router-link>
                </div>

                <div class="account">
                  <Button v-if="user" class="list-item" fluid>
                    <i class="icon mdi mdi-account"></i>
                    {{ user.email }}
                  </Button>
                  <Button v-else class="list-item" fluid @click="isAuthModalVisible = true">
                    <i class="icon mdi mdi-account"></i>
                    Login
                  </Button>
                </div>

                <div class="version">
                  <span>v{{ appVersion }}</span>
                </div>
              </div>
              <div class="main">
                <router-view></router-view>
              </div>
            </div>
          </div>

          <Dialog
            v-model:visible="isAuthModalVisible"
            modal
            :style="{ width: '30vw' }" :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
          >
            <template #header>
              <div class="flex flex-column w-full">
                <p class="text-xl text-center">{{ type === 'login' ? 'Login' : 'Register' }}</p>
              </div>
            </template>

            <div class="login" v-if="type === 'login'">
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
                          :toggleMask="true"
                          :feedback="false"
                          :invalid="!!errors.password"
                          :class="{
                            'w-full': true
                          }"
                          inputClass="w-full"
                        >
                        </Password>

                        <small class="p-error" v-if="errors.password">
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
                          @click="onSubmit"
                        />
                        <Button @click="type = 'register'" text label="Don't have an account?" class="w-full p-3 text-lg" />
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
            <div class="login" v-if="type === 'register'">
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
                          :toggleMask="true"
                          :invalid="!!errors.password"
                          :class="{
                            'w-full': true
                          }"
                          inputClass="w-full"
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
                              <li>Minimum 8 characters</li>
                            </ul>
                          </template>
                        </Password>

                        <small class="p-error" v-if="errors.password">
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
                          @click="onSubmit"
                        />
                        <Button text @click="type = 'login'" label="Already have an account?" class="w-full p-3 text-lg" />
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </Dialog>
        </div>
      </template>
      <template #fallback>
        <div>Loading...</div>
      </template>
    </suspense>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from './store/app'
import { onMounted, reactive, ref } from 'vue'
import { primary, primaryDarken1, primaryDarken2 } from './style/main'
import { useFiles } from './store/files'
import { useAPI } from './composables/api'
import Button from 'primevue/button'
import { useAuth } from './store/auth'
import { storeToRefs } from 'pinia'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/valibot'
import { object, pipe, string, email, nonEmpty, minLength, regex } from 'valibot'

const appStore = useAppStore()
const filesStore = useFiles()
const api = useAPI()

const { init } = appStore

console.log('window', window)

const appVersion = ref(window.version)
const isAuthModalVisible = ref(false)
const auth = useAuth()

const { user } = storeToRefs(auth)

const schema = toTypedSchema(
  object({
    email: pipe(string('An email adress is required'), nonEmpty('Email is required'), email('Invalid email')),
    password: pipe(
      string('A password is required'),
      nonEmpty('Password is required'),
      minLength(10, 'Password must be at least 10 characters long'),
      regex(/[a-z]/, 'Password must contain at least one lowercase letter'),
      regex(/[A-Z]/, 'Password must contain at least one uppercase letter'),
      regex(/[0-9]/, 'Password must contain at least one number'),
      regex(/[!@#$%^&*()_+-=[\]{};':"|<>?,.\/`~.]/, 'Password must contain at least one symbol')
    )
  })
)

const { defineField, handleSubmit, errors } = useForm({
  validationSchema: schema
})

const [emailModel, emailProps] = defineField('email')
const [passwordModel, passwordProps] = defineField('password')

const onSuccess = async (values: any) => {
  if (type.value === 'register') {
    await auth.register(values.email, values.password)
  } else {
    await auth.login(values.email, values.password)
  }
};

function onInvalidSubmit({ values, errors, results }: any) {
  console.log({ values }) // current form values
  console.log({ errors }) // a map of field names and their first error message
  console.log({ results }) // a detailed map of field names and their validation results
}

const onSubmit = handleSubmit(onSuccess, onInvalidSubmit)

const type = ref<'login' | 'register'>('login')

onMounted(async () => {
  await auth.init()

  await filesStore.load()
  console.log('files loaded', filesStore)
  await init()
  console.log('init done')
  // const result = await api.execute('')
})
</script>

<style lang="scss">
.app,
.layout,
.content {
  height: 100%;
  overflow: hidden;
}

.content {
  display: flex;

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 300px;
    background-color: v-bind(primary);
    color: white;

    .sidebar-title {
      font-size: 2rem;
      text-align: center;
      margin: 16px 12px;
      margin-bottom: 64px;
      margin-top: 32px;
    }

    .list {
      margin: 8px;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .list-item {
        cursor: pointer;
        padding: 8px 16px;
        font-size: 1.5rem;
        transition: background-color 0.25s;
        border-radius: 4px;
        color: white;
        text-decoration: none;

        .icon {
          margin-right: 8px;
        }

        &:hover {
          background-color: v-bind(primaryDarken1);
        }
      }
    }
  }

  .main {
    flex: 1;
  }
}

.container {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.router-link-active {
  background-color: v-bind(primaryDarken2);
}

.version {
  font-size: 1.2rem;
  margin: 16px;
  text-align: center;
}
</style>
