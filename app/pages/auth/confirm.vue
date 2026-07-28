<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const route = useRoute()
const password = ref('')
const passwordConfirmation = ref('')
const loading = ref(true)
const saving = ref(false)
const ready = ref(false)
const errorMessage = ref('')
const pendingConfirmationUrl = ref('')

async function checkInviteSession() {
  const confirmationUrl = route.query.confirmation_url
  if (typeof confirmationUrl === 'string' && confirmationUrl) {
    pendingConfirmationUrl.value = confirmationUrl
    loading.value = false
    return
  }

  const { data } = await supabase.auth.getSession()

  if (data.session) {
    ready.value = true
  } else {
    errorMessage.value = 'Ftesa është e pavlefshme ose ka skaduar. Kërko një ftesë të re.'
  }

  loading.value = false
}

function continueInvitation() {
  if (pendingConfirmationUrl.value) {
    window.location.assign(pendingConfirmationUrl.value)
  }
}

async function setPassword() {
  errorMessage.value = ''

  if (password.value.length < 8) {
    errorMessage.value = 'Fjalëkalimi duhet të ketë së paku 8 karaktere.'
    return
  }

  if (password.value !== passwordConfirmation.value) {
    errorMessage.value = 'Fjalëkalimet nuk përputhen.'
    return
  }

  saving.value = true
  const { error } = await supabase.auth.updateUser({ password: password.value })
  saving.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }

  await navigateTo('/')
}

onMounted(async () => {
  const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      ready.value = true
      loading.value = false
    }
  })

  await checkInviteSession()
  subscription.subscription.unsubscribe()
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
    <UCard class="w-full max-w-md shadow-sm" :ui="{ body: 'p-8 sm:p-10' }">
      <div class="mb-8 text-center">
        <img class="mx-auto mb-4 h-24 w-48 object-contain" src="/images/atomx-logo.png" alt="AtomX Solutions" />
        <h1 class="text-2xl font-semibold text-slate-900">Aktivizo llogarinë</h1>
        <p class="mt-2 text-sm text-slate-500">Vendose fjalëkalimin për AtomX Staff</p>
      </div>

      <div v-if="loading" class="py-6 text-center text-sm text-slate-500">Duke verifikuar ftesën...</div>
      <div v-else-if="pendingConfirmationUrl" class="space-y-5 text-center">
        <p class="text-sm leading-6 text-slate-600">Kliko butonin për ta aktivizuar ftesën dhe për të vendosur fjalëkalimin.</p>
        <UButton label="Vazhdo me ftesën" block size="lg" @click="continueInvitation" />
      </div>
      <UAlert v-else-if="errorMessage" color="error" variant="subtle" title="Ftesa nuk mund të përdoret" :description="errorMessage" />

      <form v-else-if="ready" class="space-y-5" @submit.prevent="setPassword">
        <UFormField label="Fjalëkalimi i ri" required>
          <UInput v-model="password" type="password" placeholder="Minimum 8 karaktere" class="w-full" required />
        </UFormField>
        <UFormField label="Përsërite fjalëkalimin" required>
          <UInput v-model="passwordConfirmation" type="password" placeholder="Përsërite fjalëkalimin" class="w-full" required />
        </UFormField>
        <UButton type="submit" label="Aktivizo llogarinë" block size="lg" :loading="saving" />
      </form>
    </UCard>
  </main>
</template>
