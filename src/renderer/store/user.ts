import { defineStore } from 'pinia'
import { ref } from 'vue'

export default defineStore('user', () => {
  const user = ref()
  const benefits = ref()

  return {
    user,
    benefits
  }
})
