//https://nitro.unjs.io/config
export default defineNitroConfig({
  srcDir: 'server',
  compatibilityDate: '2025-04-03',
  runtimeConfig: {
    discordClientId: '',
    discordClientSecret: ''
  },
  storage: {
    cache: {
      driver: 'null'
    }
  }
})
