<script setup lang="ts">
type ProjectStatus = 'completed' | 'in_progress' | 'waiting' | 'blocked'
type Project = { id: string; name: string }
type DailyReport = { id: string; report_date: string; project_name: string; content: string; completed_tasks: string; problems: string | null; hours_worked: number | null; project_status: ProjectStatus; tomorrow_plan: string; employee?: { full_name: string } | null }

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const currentUserId = ref('')
const reports = ref<DailyReport[]>([])
const projects = ref<Project[]>([])
const role = ref<'owner' | 'manager' | 'user'>('user')
const profileName = ref('')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const form = reactive({ reportDate: new Date().toISOString().slice(0, 10), projectName: '', todayWork: '', completedTasks: '', problems: '', hoursWorked: '', projectStatus: 'in_progress' as ProjectStatus, tomorrowPlan: '' })
const statuses = [{ label: 'Completed', value: 'completed' }, { label: 'In Progress', value: 'in_progress' }, { label: 'Waiting', value: 'waiting' }, { label: 'Blocked', value: 'blocked' }]
const projectItems = computed(() => projects.value.map((project) => ({ label: project.name, value: project.name })))

async function load() {
  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user
  if (!authUser?.id) return
  currentUserId.value = authUser.id
  loading.value = true
  const { data: profileById, error: profileByIdError } = await supabase.from('profiles').select('id, role, full_name, email').eq('id', authUser.id).maybeSingle()
  const { data: profileByEmail } = !profileById && authUser.email
    ? await supabase.from('profiles').select('id, role, full_name, email').eq('email', authUser.email).maybeSingle()
    : { data: null }
  const profile = profileById || profileByEmail
  role.value = profile?.role || 'user'
  profileName.value = profile?.full_name?.trim() || authUser.user_metadata?.full_name?.trim() || authUser.email?.split('@')[0] || 'Përdorues'
  if (!profile && profileByIdError) errorMessage.value = `Profili nuk u gjet: ${profileByIdError.message}`
  const { data: projectData, error: projectError } = await supabase.from('projects').select('id, name').eq('is_active', true).order('name')
  if (projectError) {
    errorMessage.value = projectError.message.includes('relation "public.projects" does not exist')
      ? 'Tabela e projekteve nuk ekziston. Ekzekuto supabase/projects_migration.sql në Supabase SQL Editor.'
      : projectError.message
  }
  projects.value = (projectData || []) as Project[]
  const { data, error } = await supabase.from('daily_reports').select('id, report_date, project_name, content, completed_tasks, problems, hours_worked, project_status, tomorrow_plan, employee:profiles!daily_reports_employee_id_fkey(full_name)').order('report_date', { ascending: false })
  if (error) {
    errorMessage.value = error.message.includes('daily_reports.project_name')
      ? 'Databaza nuk është përditësuar për raportet ditore. Ekzekuto supabase/daily_reports_migration.sql në Supabase SQL Editor.'
      : error.message
  }
  reports.value = (data || []) as DailyReport[]
  loading.value = false
}

async function submitReport() {
  errorMessage.value = ''
  successMessage.value = ''
  if (!form.projectName || !form.todayWork || !form.completedTasks || !form.tomorrowPlan) { errorMessage.value = 'Plotëso fushat e detyrueshme.'; return }
  const { data: authData } = await supabase.auth.getUser()
  const currentUser = authData.user
  if (!currentUser?.id) {
    errorMessage.value = 'Sesioni ka skaduar. Kyçu përsëri në aplikacion.'
    return
  }
  currentUserId.value = currentUser.id
  saving.value = true
  const { error } = await supabase.from('daily_reports').upsert({ employee_id: currentUserId.value, report_date: form.reportDate, project_name: form.projectName, content: form.todayWork, completed_tasks: form.completedTasks, problems: form.problems || null, hours_worked: form.hoursWorked ? Number(form.hoursWorked) : null, project_status: form.projectStatus, tomorrow_plan: form.tomorrowPlan }, { onConflict: 'employee_id,report_date' })
  saving.value = false
  if (error) {
    errorMessage.value = error.message.includes('daily_reports.project_name')
      ? 'Databaza nuk është përditësuar për raportet ditore. Ekzekuto supabase/daily_reports_migration.sql në Supabase SQL Editor.'
      : error.message
    return
  }
  successMessage.value = 'Raporti u ruajt me sukses.'
  await load()
}

function statusLabel(status: ProjectStatus) { return statuses.find((item) => item.value === status)?.label || status }
onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div><h2 class="text-2xl font-semibold text-highlighted">Raportet ditore</h2><p class="muted">Ju lutem plotësoni raportin para përfundimit të orarit të punës.</p></div>
    <UAlert v-if="successMessage" color="success" variant="subtle" :description="successMessage" /><UAlert v-if="errorMessage" color="error" variant="subtle" title="Gabim" :description="errorMessage" />

    <UCard><template #header><h3 class="font-semibold text-highlighted">Raporti i ditës</h3><p class="mt-1 text-sm text-muted">Përshëndetje {{ profileName }}. Emri dhe email-i yt merren automatikisht kur e dorëzon këtë raport.</p></template>
      <form class="grid gap-5 md:grid-cols-2" @submit.prevent="submitReport">
        <UFormField label="1. Data" required><UInput v-model="form.reportDate" type="date" class="w-full" /></UFormField>
        <UFormField label="2. Projekti ku jeni i angazhuar aktualisht" required><USelect v-model="form.projectName" :items="projectItems" placeholder="Zgjedh projektin" class="w-full" /></UFormField>
        <UFormField class="md:col-span-2" label="3. Çka punove sot? (Përshkrimi i punës në pika të shkurtra)" required><UTextarea v-model="form.todayWork" placeholder="Enter your answer" :rows="4" class="w-full" /></UFormField>
        <UFormField class="md:col-span-2" label="4. Detyrat e përfunduara?" required><UTextarea v-model="form.completedTasks" placeholder="Enter your answer" :rows="3" class="w-full" /></UFormField>
        <UFormField class="md:col-span-2" label="5. A ke hasur në ndonjë problem?"><UTextarea v-model="form.problems" placeholder="Enter your answer" :rows="3" class="w-full" /></UFormField>
        <UFormField label="6. Sa orë ke punuar në këtë projekt?" required><UInput v-model="form.hoursWorked" type="number" min="0" max="24" step="0.5" placeholder="p.sh. 8" class="w-full" /></UFormField>
        <UFormField label="7. Statusi i projektit (aktual)" required><USelect v-model="form.projectStatus" :items="statuses" class="w-full" /></UFormField>
        <UFormField class="md:col-span-2" label="8. Çfarë planifikon të bësh nesër?" required><UTextarea v-model="form.tomorrowPlan" placeholder="Enter your answer" :rows="3" class="w-full" /></UFormField>
        <div class="md:col-span-2 flex justify-end"><UButton type="submit" label="Submit" :loading="saving" /></div>
      </form>
    </UCard>

  </section>
</template>
