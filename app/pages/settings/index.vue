<script setup lang="ts">
type Role = 'owner' | 'manager' | 'user'
type Profile = { id: string; full_name: string; email: string | null; role: Role; position: string | null; phone: string | null }
type CompanyDocument = { id: string; title: string; description: string | null; file_name: string; storage_path: string; mime_type: string | null; file_size: number | null; created_at: string }
type CompanySettings = { id: number; company_name: string; work_start_time: string; work_end_time: string; break_minutes: number }

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const route = useRoute()
const profile = ref<Profile | null>(null)
const documents = ref<CompanyDocument[]>([])
const companySettings = ref<CompanySettings | null>(null)
const loading = ref(true)
const savingProfile = ref(false)
const uploading = ref(false)
const savingCompany = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const selectedFile = ref<File | null>(null)
const documentForm = reactive({ title: '', description: '' })
const profileForm = reactive({ fullName: '', position: '', phone: '' })
const companyForm = reactive({ companyName: 'AtomX Solutions', workStartTime: '08:00', workEndTime: '16:00', breakMinutes: 30 })

const canManageDocuments = computed(() => profile.value?.role === 'owner' || profile.value?.role === 'manager')
const activeTab = computed(() => route.query.tab === 'company' ? 'company' : 'profile')

function formatSize(size: number | null) {
  if (!size) return '—'
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function load() {
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user?.id) return
  loading.value = true
  errorMessage.value = ''
  const [{ data: profileData, error: profileError }, { data: documentData, error: documentError }, { data: companyData, error: companyError }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, position, phone').eq('id', authData.user.id).maybeSingle(),
    supabase.from('company_documents').select('id, title, description, file_name, storage_path, mime_type, file_size, created_at').order('created_at', { ascending: false }),
    supabase.from('company_settings').select('id, company_name, work_start_time, work_end_time, break_minutes').eq('id', 1).maybeSingle()
  ])
  if (profileError) errorMessage.value = profileError.message
  if (documentError) {
    errorMessage.value = documentError.message.includes('company_documents')
      ? 'Ekzekuto supabase/company_documents_migration.sql në Supabase SQL Editor.'
      : documentError.message
  }
  if (companyError) {
    errorMessage.value = companyError.message.includes('company_settings')
      ? 'Ekzekuto supabase/company_settings_migration.sql në Supabase SQL Editor.'
      : companyError.message
  }
  profile.value = profileData as Profile | null
  profileForm.fullName = profileData?.full_name || ''
  profileForm.position = profileData?.position || ''
  profileForm.phone = profileData?.phone || ''
  documents.value = (documentData || []) as CompanyDocument[]
  companySettings.value = companyData as CompanySettings | null
  companyForm.companyName = companyData?.company_name || 'AtomX Solutions'
  companyForm.workStartTime = companyData?.work_start_time?.slice(0, 5) || '08:00'
  companyForm.workEndTime = companyData?.work_end_time?.slice(0, 5) || '16:00'
  companyForm.breakMinutes = companyData?.break_minutes ?? 30
  loading.value = false
}

async function saveCompanySettings() {
  if (!canManageDocuments.value) return
  savingCompany.value = true
  errorMessage.value = ''
  successMessage.value = ''
  const { error } = await supabase.from('company_settings').upsert({
    id: 1,
    company_name: companyForm.companyName.trim() || 'AtomX Solutions',
    work_start_time: companyForm.workStartTime,
    work_end_time: companyForm.workEndTime,
    break_minutes: Number(companyForm.breakMinutes)
  })
  savingCompany.value = false
  if (error) errorMessage.value = error.message
  else { successMessage.value = 'Orari i kompanisë u ruajt me sukses.'; await load() }
}

async function saveProfile() {
  if (!profile.value) return
  savingProfile.value = true
  errorMessage.value = ''
  successMessage.value = ''
  const { error } = await supabase.from('profiles').update({ full_name: profileForm.fullName.trim(), position: profileForm.position.trim() || null, phone: profileForm.phone.trim() || null }).eq('id', profile.value.id)
  savingProfile.value = false
  if (error) errorMessage.value = error.message
  else {
    successMessage.value = 'Profili u ruajt me sukses.'
    await load()
  }
}

function onFileChange(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] || null
  if (selectedFile.value && !documentForm.title) documentForm.title = selectedFile.value.name.replace(/\.[^/.]+$/, '')
}

async function uploadDocument() {
  if (!selectedFile.value || !documentForm.title.trim()) {
    errorMessage.value = 'Zgjidh dokumentin dhe shkruaj titullin.'
    return
  }
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user?.id) return
  uploading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  const file = selectedFile.value
  const storagePath = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
  const { error: uploadError } = await supabase.storage.from('company-documents').upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (uploadError) {
    uploading.value = false
    errorMessage.value = uploadError.message
    return
  }
  const { error: documentError } = await supabase.from('company_documents').insert({ title: documentForm.title.trim(), description: documentForm.description.trim() || null, file_name: file.name, storage_path: storagePath, mime_type: file.type || null, file_size: file.size, uploaded_by: authData.user.id })
  if (documentError) {
    await supabase.storage.from('company-documents').remove([storagePath])
    errorMessage.value = documentError.message
  } else {
    successMessage.value = 'Dokumenti u ngarkua me sukses.'
    documentForm.title = ''
    documentForm.description = ''
    selectedFile.value = null
    const input = document.querySelector<HTMLInputElement>('#company-document-file')
    if (input) input.value = ''
    await load()
  }
  uploading.value = false
}

async function downloadDocument(documentItem: CompanyDocument) {
  const { data, error } = await supabase.storage.from('company-documents').createSignedUrl(documentItem.storage_path, 60 * 5, { download: documentItem.file_name })
  if (error) errorMessage.value = error.message
  else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

async function viewDocument(documentItem: CompanyDocument) {
  const { data, error } = await supabase.storage.from('company-documents').createSignedUrl(documentItem.storage_path, 60 * 5)
  if (error) errorMessage.value = error.message
  else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

async function deleteDocument(documentItem: CompanyDocument) {
  if (!window.confirm(`A dëshiron ta fshish dokumentin "${documentItem.title}"?`)) return
  errorMessage.value = ''
  const { error: storageError } = await supabase.storage.from('company-documents').remove([documentItem.storage_path])
  if (storageError) { errorMessage.value = storageError.message; return }
  const { error } = await supabase.from('company_documents').delete().eq('id', documentItem.id)
  if (error) errorMessage.value = error.message
  else { successMessage.value = 'Dokumenti u fshi.'; await load() }
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div><h2 class="text-2xl font-semibold text-highlighted">Settings</h2><p class="muted">Menaxho detajet e profilit dhe dokumentet e kompanisë.</p></div>
    <UAlert v-if="successMessage" color="success" variant="subtle" :description="successMessage" />
    <UAlert v-if="errorMessage" color="error" variant="subtle" title="Gabim" :description="errorMessage" />

    <div v-if="activeTab === 'profile'">
      <UCard>
        <template #header><h3 class="font-semibold text-highlighted">Detajet e profilit</h3><p class="mt-1 text-sm text-muted">Këto të dhëna përdoren në aplikacion.</p></template>
        <form class="space-y-4" @submit.prevent="saveProfile">
          <UFormField label="Emri i plotë" required><UInput v-model="profileForm.fullName" class="w-full" /></UFormField>
          <UFormField label="Email"><UInput :model-value="profile?.email || ''" disabled class="w-full" /></UFormField>
          <UFormField label="Roli"><UInput :model-value="profile?.role || ''" disabled class="w-full" /></UFormField>
          <UFormField label="Pozita"><UInput v-model="profileForm.position" placeholder="p.sh. Software Engineer" class="w-full" /></UFormField>
          <UFormField label="Telefoni"><UInput v-model="profileForm.phone" placeholder="+383..." class="w-full" /></UFormField>
          <div class="flex justify-end"><UButton type="submit" label="Ruaj profilin" :loading="savingProfile" /></div>
        </form>
      </UCard>
    </div>

    <div v-else class="space-y-6">
      <UCard>
        <template #header><h3 class="font-semibold text-highlighted">Orari i kompanisë</h3></template>
        <form class="grid gap-4 md:grid-cols-2" @submit.prevent="saveCompanySettings">
          <UFormField label="Emri i kompanisë"><UInput v-model="companyForm.companyName" :disabled="!canManageDocuments" class="w-full" /></UFormField>
          <div />
          <UFormField label="Fillimi i orarit"><UInput v-model="companyForm.workStartTime" type="time" :disabled="!canManageDocuments" class="w-full" /></UFormField>
          <UFormField label="Përfundimi i orarit"><UInput v-model="companyForm.workEndTime" type="time" :disabled="!canManageDocuments" class="w-full" /></UFormField>
          <UFormField label="Pauza e planifikuar (minuta)"><UInput v-model.number="companyForm.breakMinutes" type="number" min="0" max="480" :disabled="!canManageDocuments" class="w-full" /></UFormField>
          <div v-if="canManageDocuments" class="flex justify-end md:col-span-2"><UButton type="submit" label="Ruaj orarin" :loading="savingCompany" /></div>
        </form>
      </UCard>

      <UCard v-if="canManageDocuments">
        <template #header><h3 class="font-semibold text-highlighted">Dokumentet e kompanisë</h3><p class="mt-1 text-sm text-muted">Politika, kontrata dhe dokumente të rëndësishme.</p></template>
        <form class="space-y-4" @submit.prevent="uploadDocument">
          <UFormField label="Titulli i dokumentit" required><UInput v-model="documentForm.title" placeholder="p.sh. Politikat e Brendshme të Kompanisë" class="w-full" /></UFormField>
          <UFormField label="Përshkrimi"><UTextarea v-model="documentForm.description" placeholder="Përshkrim i shkurtër..." :rows="2" class="w-full" /></UFormField>
          <UFormField label="Dokumenti" required><input id="company-document-file" type="file" class="block w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-highlighted file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-white" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" @change="onFileChange" /></UFormField>
          <div class="flex justify-end"><UButton type="submit" label="Ngarko dokumentin" icon="i-lucide-upload" :loading="uploading" /></div>
        </form>
      </UCard>

      <UCard>
      <template #header><h3 class="font-semibold text-highlighted">Dokumentet e disponueshme</h3></template>
      <div v-if="loading" class="space-y-3"><USkeleton v-for="i in 3" :key="i" class="h-14 w-full" /></div>
      <div v-else-if="!documents.length" class="py-10 text-center text-muted">Ende nuk ka dokumente të ngarkuara.</div>
      <div v-else class="divide-y divide-default">
        <div v-for="documentItem in documents" :key="documentItem.id" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-center gap-3"><UIcon name="i-lucide-file-text" class="size-6 shrink-0 text-primary" /><div class="min-w-0"><p class="font-medium text-highlighted">{{ documentItem.title }}</p><p class="truncate text-sm text-muted">{{ documentItem.description || documentItem.file_name }} · {{ formatSize(documentItem.file_size) }}</p></div></div>
          <div class="flex shrink-0 gap-2"><UButton size="sm" variant="soft" icon="i-lucide-eye" label="Shiko" @click="viewDocument(documentItem)" /><UButton size="sm" variant="soft" icon="i-lucide-download" label="Shkarko" @click="downloadDocument(documentItem)" /><UButton v-if="canManageDocuments" size="sm" color="error" variant="soft" icon="i-lucide-trash-2" aria-label="Fshi dokumentin" @click="deleteDocument(documentItem)" /></div>
        </div>
      </div>
      </UCard>
    </div>
  </section>
</template>
