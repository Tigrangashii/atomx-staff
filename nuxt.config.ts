// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@nuxtjs/supabase", "@nuxt/ui"],
  supabase: {
    redirect: false,
    redirectOptions: {
      callback: "/auth/confirm",
    },
  },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    supabaseServiceRoleKey: "",
    brevoApiKey:
      process.env.BREVO_API_KEY || process.env.NUXT_BREVO_API_KEY || "",
    brevoSenderEmail:
      process.env.BREVO_SENDER_EMAIL ||
      process.env.NUXT_BREVO_SENDER_EMAIL ||
      "",
    brevoSenderName:
      process.env.BREVO_SENDER_NAME ||
      process.env.NUXT_BREVO_SENDER_NAME ||
      "AtomX Staff",
  },
  app: {
    head: {
      title: "AtomX Staff",
      meta: [
        { charset: "utf-8" },
        {
          name: "description",
          content: "Staff management platform for AtomX Solutions",
        },
        { name: "theme-color", content: "#f4f7fb" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
        { name: "apple-mobile-web-app-title", content: "AtomX Staff" },
        { name: "application-name", content: "AtomX Staff" },
      ],
      link: [
        { rel: "manifest", href: "/manifest.webmanifest" },
        {
          rel: "icon",
          type: "image/png",
          sizes: "192x192",
          href: "/icons/icon-192.png",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "512x512",
          href: "/icons/icon-512.png",
        },
        {
          rel: "apple-touch-icon",
          type: "image/png",
          sizes: "180x180",
          href: "/icons/apple-touch-icon.png",
        },
      ],
    },
  },
});
