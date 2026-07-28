// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase', '@nuxt/ui'],
  supabase: {
    redirectOptions: {
      callback: '/auth/confirm'
    }
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabaseServiceRoleKey: '',
  },
  app: {
    head: {
      title: 'AtomX Staff',
      meta: [
        {
          name: 'description',
          content: 'Staff management platform for AtomX Solutions'
        }
      ]
    }
  }
})
