<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const route = useRoute()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')

async function login() {
  errorMessage.value = ''
  loading.value = true

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  })

  loading.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }

  await navigateTo('/')
}

onMounted(() => {
  const confirmationUrl = route.query.confirmation_url
  if (typeof confirmationUrl === 'string' && confirmationUrl) {
    window.location.replace(`/auth/confirm?confirmation_url=${encodeURIComponent(confirmationUrl)}`)
    return
  }

  const hash = window.location.hash

  // Supabase invite links may return to the configured Site URL with
  // the session in the URL hash. Forward those sessions to password setup.
  if (hash.includes('access_token=') || hash.includes('type=invite')) {
    window.location.replace(`/auth/confirm${hash}`)
    return
  }

  if (hash.includes('error_code=otp_expired')) {
    errorMessage.value = 'Ftesa ka skaduar. Kërko dërgimin e një ftese të re.'
    window.history.replaceState({}, '', window.location.pathname)
  }
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
    <UCard class="w-full max-w-md shadow-sm" :ui="{ body: 'p-8 sm:p-10' }">
      <div class="mb-8 text-center">
        <img class="mx-auto mb-4 h-24 w-48 object-contain" src="/images/atomx-logo.png" alt="AtomX Solutions" />
        <h1 class="text-2xl font-semibold text-slate-900">AtomX Staff</h1>
        <p class="mt-2 text-sm text-slate-500">Kyçu në panelin e menaxhimit të stafit</p>
      </div>

      <UAlert v-if="errorMessage" color="error" variant="subtle" title="Kyçja dështoi" :description="errorMessage" class="mb-5" />

      <form class="space-y-5" @submit.prevent="login">
        <UFormField label="Email" name="email">
          <UInput v-model="email" type="email" placeholder="emri@atomxsolutions.com" class="w-full" required />
        </UFormField>

        <UFormField label="Fjalëkalimi" name="password">
          <UInput v-model="password" type="password" placeholder="••••••••" class="w-full" required />
        </UFormField>

        <UButton type="submit" label="Kyçu" block size="lg" :loading="loading" />
      </form>

      <p class="mt-8 text-center text-xs text-slate-400">AtomX Solutions · Staff Management</p>
    </UCard>
  </main>
</template>
