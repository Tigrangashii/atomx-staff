<script setup lang="ts">
type Project = { id: string; name: string; description: string | null; is_active: boolean; created_at: string }

definePageMeta({ middleware: ['auth', 'permissions'] })

const supabase = useSupabaseClient()
const projects = ref<Project[]>([])
const loading = ref(true)
const saving = ref(false)
const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const errorMessage = ref('')
const successMessage = ref('')
const form = reactive({ name: '', description: '', isActive: true })

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', description: '', isActive: true })
  errorMessage.value = ''
  modalOpen.value = true
}

function openEdit(project: Project) {
  editingId.value = project.id
  Object.assign(form, { name: project.name, description: project.description || '', isActive: project.is_active })
  errorMessage.value = ''
  modalOpen.value = true
}

async function loadProjects() {
  loading.value = true
  const { data, error } = await supabase.from('projects').select('id, name, description, is_active, created_at').order('name')
  if (error) errorMessage.value = error.message
  projects.value = (data || []) as Project[]
  loading.value = false
}

async function saveProject() {
  errorMessage.value = ''
  successMessage.value = ''
  if (!form.name.trim()) { errorMessage.value = 'Shkruaj emrin e projektit.'; return }
  saving.value = true
  const payload = { name: form.name.trim(), description: form.description.trim() || null, is_active: form.isActive }
  const result = editingId.value
    ? await supabase.from('projects').update(payload).eq('id', editingId.value)
    : await supabase.from('projects').insert(payload)
  saving.value = false
  if (result.error) { errorMessage.value = result.error.message; return }
  modalOpen.value = false
  successMessage.value = editingId.value ? 'Projekti u përditësua.' : 'Projekti u shtua.'
  await loadProjects()
}

async function deleteProject(project: Project) {
  if (!confirm(`A dëshiron ta fshish projektin ${project.name}?`)) return
  const { error } = await supabase.from('projects').delete().eq('id', project.id)
  if (error) errorMessage.value = error.message
  else { successMessage.value = 'Projekti u fshi.'; await loadProjects() }
}

onMounted(loadProjects)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4"><div><p class="eyebrow">Menaxhimi</p><h2 class="text-2xl font-semibold text-highlighted">Projektet</h2><p class="muted">Menaxho projektet ku angazhohet stafi.</p></div><UButton label="Shto projekt" icon="i-lucide-plus" @click="openCreate" /></div>
    <UAlert v-if="successMessage" color="success" variant="subtle" :description="successMessage" /><UAlert v-if="errorMessage" color="error" variant="subtle" title="Gabim" :description="errorMessage" />
    <UCard><div v-if="loading" class="space-y-3"><USkeleton v-for="i in 3" :key="i" class="h-14 w-full" /></div><div v-else class="overflow-x-auto"><table class="w-full min-w-[700px] text-left text-sm"><thead class="border-b border-default text-xs uppercase text-muted"><tr><th class="px-4 py-3">Projekti</th><th class="px-4 py-3">Përshkrimi</th><th class="px-4 py-3">Statusi</th><th class="px-4 py-3">Veprime</th></tr></thead><tbody><tr v-for="project in projects" :key="project.id" class="border-b border-default last:border-0"><td class="px-4 py-4 font-medium text-highlighted">{{ project.name }}</td><td class="px-4 py-4 text-muted">{{ project.description || '—' }}</td><td class="px-4 py-4"><UBadge :color="project.is_active ? 'success' : 'neutral'" variant="subtle">{{ project.is_active ? 'Aktiv' : 'Joaktiv' }}</UBadge></td><td class="px-4 py-4"><div class="flex gap-2"><UButton size="xs" label="Edito" icon="i-lucide-pencil" color="neutral" variant="soft" @click="openEdit(project)" /><UButton size="xs" label="Fshi" icon="i-lucide-trash-2" color="error" variant="soft" @click="deleteProject(project)" /></div></td></tr><tr v-if="!projects.length"><td colspan="4" class="px-4 py-8 text-center text-muted">Nuk ka projekte.</td></tr></tbody></table></div></UCard>
    <UModal v-model:open="modalOpen" :title="editingId ? 'Edito projektin' : 'Shto projekt'"><template #body><form class="space-y-4" @submit.prevent="saveProject"><UFormField label="Emri i projektit" required><UInput v-model="form.name" class="w-full" placeholder="p.sh. AtomX HR Platform" /></UFormField><UFormField label="Përshkrimi"><UTextarea v-model="form.description" class="w-full" placeholder="Përshkrim i shkurtër" /></UFormField><UCheckbox v-model="form.isActive" label="Projekti është aktiv" /><div class="flex justify-end gap-3 pt-3"><UButton color="neutral" variant="ghost" label="Anulo" type="button" @click="modalOpen = false" /><UButton type="submit" :label="editingId ? 'Ruaj ndryshimet' : 'Shto projektin'" :loading="saving" /></div></form></template></UModal>
  </section>
</template>
