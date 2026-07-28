// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/supabase', '@nuxt/ui'],
  supabase: {
    redirect: false,
    redirectOptions: {
      callback: '/auth/confirm'
    }
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabaseServiceRoleKey: '',
    brevoApiKey: process.env.BREVO_API_KEY || process.env.NUXT_BREVO_API_KEY || '',
    brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || process.env.NUXT_BREVO_SENDER_EMAIL || '',
    brevoSenderName: process.env.BREVO_SENDER_NAME || process.env.NUXT_BREVO_SENDER_NAME || 'AtomX Staff',
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
