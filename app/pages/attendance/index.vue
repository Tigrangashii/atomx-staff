<script setup lang="ts">
type Role = 'owner' | 'manager' | 'user'
type Attendance = {
  id: string
  employee_id: string
  work_date: string
  check_in: string | null
  break_out: string | null
  break_in: string | null
  check_out: string | null
  notes: string | null
  employee?: { full_name: string; role?: Role } | null
}
type Employee = { id: string; full_name: string; role: Role }
type CompanySettings = { work_start_time: string; work_end_time: string; break_minutes: number }
type TimeField = 'break_out' | 'break_in' | 'check_out'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const today = new Date().toISOString().slice(0, 10)
const current = ref<Attendance | null>(null)
const records = ref<Attendance[]>([])
const employees = ref<Employee[]>([])
const companySettings = ref<CompanySettings>({ work_start_time: '08:00', work_end_time: '16:00', break_minutes: 30 })
const role = ref<Role>('user')
const loading = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const reviewModalOpen = ref(false)
const monthlyModalOpen = ref(false)
const monthlyRecords = ref<Attendance[]>([])
const filters = reactive({ workDate: today, employeeId: 'all' })
const monthlyFilters = reactive({ month: today.slice(0, 7), employeeId: 'all' })
const canReview = computed(() => role.value === 'owner' || role.value === 'manager')
const employeeItems = computed(() => [
  { label: 'Të gjithë punëtorët', value: 'all' },
  ...employees.value.map(employee => ({ label: employee.full_name, value: employee.id }))
])

function time(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'
}

function workMinutes(record: Attendance | null) {
  if (!record?.check_in || !record.check_out) return null
  let minutes = (Date.parse(record.check_out) - Date.parse(record.check_in)) / 60000
  if (record.break_out && record.break_in) minutes -= (Date.parse(record.break_in) - Date.parse(record.break_out)) / 60000
  return Math.max(0, Math.round(minutes))
}

function workHours(record: Attendance | null) {
  const minutes = workMinutes(record)
  if (minutes === null) return '—'
  return `${Math.floor(minutes / 60)} orë ${minutes % 60} min`
}

function overtimeMinutes(record: Attendance | null) {
  const minutes = workMinutes(record)
  if (minutes === null) return null
  return Math.max(0, minutes - 8 * 60)
}

function overtimeHours(record: Attendance | null) {
  const minutes = overtimeMinutes(record)
  if (minutes === null) return '—'
  return `${Math.floor(minutes / 60)} orë ${minutes % 60} min`
}

function lateMinutes(record: Attendance | null) {
  if (!record?.check_in) return null
  const actual = new Date(record.check_in)
  const [hours, minutes] = companySettings.value.work_start_time.slice(0, 5).split(':').map(Number)
  const planned = new Date(actual)
  planned.setHours(hours, minutes, 0, 0)
  // Count only complete minutes: 08:00:40 is still on time.
  return Math.max(0, Math.floor((actual.getTime() - planned.getTime()) / 60000))
}

function attendanceStatus(record: Attendance | null) {
  const late = lateMinutes(record)
  return late && late > 0 ? `Vonesë ${late} min` : 'Në kohë'
}

function formatTotalMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)} orë ${minutes % 60} min`
}

function lateLabel(record: Attendance | null) {
  const minutes = lateMinutes(record)
  return minutes && minutes > 0 ? `Vonesë ${formatTotalMinutes(minutes)}` : 'Në kohë'
}

const monthlySummary = computed(() => {
  const summary = new Map<string, { employeeId: string; name: string; days: number; workMinutes: number; overtimeMinutes: number }>()
  for (const record of monthlyRecords.value) {
    const item = summary.get(record.employee_id) || { employeeId: record.employee_id, name: record.employee?.full_name || '—', days: 0, workMinutes: 0, overtimeMinutes: 0 }
    const worked = workMinutes(record) || 0
    item.days += 1
    item.workMinutes += worked
    item.overtimeMinutes += Math.max(0, worked - 8 * 60)
    summary.set(record.employee_id, item)
  }
  return [...summary.values()].sort((a, b) => a.name.localeCompare(b.name))
})

async function loadEmployees() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name')
  if (error) throw error
  employees.value = (data || []) as Employee[]
}

async function loadTeamRecords() {
  let query = supabase
    .from('attendance')
    .select('id, employee_id, work_date, check_in, break_out, break_in, check_out, notes, employee:profiles!attendance_employee_id_fkey(full_name, role)')
    .eq('work_date', filters.workDate)
    .order('work_date', { ascending: false })
    .order('check_in', { ascending: true })

  if (filters.employeeId !== 'all') query = query.eq('employee_id', filters.employeeId)
  const { data, error } = await query
  if (error) throw error
  records.value = (data || []) as Attendance[]
}

async function loadMonthlyRecords() {
  const start = `${monthlyFilters.month}-01`
  const [year, month] = monthlyFilters.month.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${monthlyFilters.month}-${String(lastDay).padStart(2, '0')}`
  let query = supabase
    .from('attendance')
    .select('id, employee_id, work_date, check_in, break_out, break_in, check_out, notes, employee:profiles!attendance_employee_id_fkey(full_name, role)')
    .gte('work_date', start)
    .lte('work_date', end)
    .order('work_date', { ascending: true })
  if (monthlyFilters.employeeId !== 'all') query = query.eq('employee_id', monthlyFilters.employeeId)
  const { data, error } = await query
  if (error) throw error
  monthlyRecords.value = (data || []) as Attendance[]
}

async function load() {
  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user
  if (!authUser?.id) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle()
    if (profileError) throw profileError
    role.value = (profile?.role || 'user') as Role
    const { data: settings, error: settingsError } = await supabase.from('company_settings').select('work_start_time, work_end_time, break_minutes').eq('id', 1).maybeSingle()
    if (settingsError && !settingsError.message.includes('company_settings')) throw settingsError
    if (settings) companySettings.value = settings as CompanySettings
    const { data: own, error: ownError } = await supabase
      .from('attendance')
      .select('id, employee_id, work_date, check_in, break_out, break_in, check_out, notes')
      .eq('employee_id', authUser.id)
      .eq('work_date', today)
      .maybeSingle()
    if (ownError) throw ownError
    current.value = own as Attendance | null
    if (canReview.value) {
      await loadEmployees()
      await loadTeamRecords()
    }
  } catch (error: any) {
    errorMessage.value = error?.message || 'Nuk u ngarkuan të dhënat.'
  } finally {
    loading.value = false
  }
}

async function checkIn() {
  errorMessage.value = ''
  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user
  if (!authUser?.id) { errorMessage.value = 'Sesioni ka skaduar. Kyçu përsëri në aplikacion.'; return }
  saving.value = true
  const { error } = await supabase.from('attendance').insert({ employee_id: authUser.id, work_date: today, check_in: new Date().toISOString() })
  saving.value = false
  if (error) errorMessage.value = error.message
  else await load()
}

async function setTime(field: TimeField) {
  if (!current.value) return
  saving.value = true
  errorMessage.value = ''
  const { error } = await supabase.from('attendance').update({ [field]: new Date().toISOString() }).eq('id', current.value.id)
  saving.value = false
  if (error) errorMessage.value = error.message
  else await load()
}

function status(record: Attendance | null) {
  if (!record) return 'Pa filluar'
  if (record.check_out) return 'Përfunduar'
  if (record.break_in) return 'Në punë'
  if (record.break_out) return 'Në pauzë'
  return 'Në punë'
}

onMounted(load)

watch(
  [() => filters.workDate, () => filters.employeeId],
  async () => {
    if (!canReview.value || !reviewModalOpen.value) return
    try {
      await loadTeamRecords()
    } catch (error: any) {
      errorMessage.value = error?.message || 'Nuk u ngarkuan regjistrimet.'
    }
  }
)

watch(
  [() => monthlyFilters.month, () => monthlyFilters.employeeId],
  async () => {
    if (!canReview.value || !monthlyModalOpen.value) return
    try {
      await loadMonthlyRecords()
    } catch (error: any) {
      errorMessage.value = error?.message || 'Nuk u ngarkua raporti mujor.'
    }
  }
)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">Hyrje / Dalje</h2>
        <p class="muted">Regjistro orarin e punës për sot.</p>
      </div>
      <div v-if="canReview" class="flex flex-wrap gap-2">
        <UButton label="Raportet Ditore" icon="i-lucide-eye" @click="reviewModalOpen = true" class="cursor-pointer" />
        <UButton label="Raporti mujor" icon="i-lucide-chart-column" color="primary" variant="subtle"
         @click="monthlyModalOpen = true" class="cursor-pointer" />
      </div>
    </div>

    <UAlert v-if="errorMessage" color="error" variant="subtle" title="Gabim" :description="errorMessage" />

    <UCard>
      <template #header>
        <h3 class="font-semibold text-highlighted">Regjistrimi i sotëm</h3>
        <p class="mt-1 text-sm text-muted">{{ today }}</p>
      </template>
      <USkeleton v-if="loading" class="h-28 w-full" />
      <div v-else class="space-y-6">
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div><p class="text-xs uppercase text-muted">Hyrja në punë</p><p class="mt-1 text-xl font-semibold text-highlighted">{{ time(current?.check_in || null) }}</p></div>
          <div><p class="text-xs uppercase text-muted">Dalja në pauzë</p><p class="mt-1 text-xl font-semibold text-highlighted">{{ time(current?.break_out || null) }}</p></div>
          <div><p class="text-xs uppercase text-muted">Kthimi nga pauza</p><p class="mt-1 text-xl font-semibold text-highlighted">{{ time(current?.break_in || null) }}</p></div>
          <div><p class="text-xs uppercase text-muted">Dalja nga puna</p><p class="mt-1 text-xl font-semibold text-highlighted">{{ time(current?.check_out || null) }}</p></div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-5">
          <div v-if="lateMinutes(current) && lateMinutes(current)! > 0" class="flex items-center gap-1 text-sm font-medium text-warning"><UIcon name="i-lucide-triangle-alert" class="size-4" />{{ lateLabel(current) }}</div>
          <div class="flex flex-wrap gap-3">
            <UButton v-if="!current" label="Hyrja në punë" icon="i-lucide-log-in" :loading="saving" @click="checkIn" />
            <UButton v-else-if="!current.break_out" label="Dalja në pauzë" icon="i-lucide-coffee" color="neutral" :loading="saving" @click="setTime('break_out')" />
            <UButton v-else-if="!current.break_in" label="Kthimi nga pauza" icon="i-lucide-play" :loading="saving" @click="setTime('break_in')" />
            <UButton v-else-if="!current.check_out" label="Dalja nga puna" icon="i-lucide-log-out" color="neutral" :loading="saving" @click="setTime('check_out')" />
            <UBadge v-else color="success" variant="subtle" class="px-4 py-2">Dita u kompletua</UBadge>
          </div>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="reviewModalOpen" title="Hyrjet dhe daljet e punëtorëve" :ui="{ content: 'max-w-7xl' }">
      <template #body>
        <div class="space-y-5">
          <div class="flex flex-wrap items-start gap-4">
            <UFormField label="Data"><UInput v-model="filters.workDate" type="date" /></UFormField>
            <UFormField label="Punëtori"><USelect v-model="filters.employeeId" :items="employeeItems" /></UFormField>
          </div>
          <div class="max-h-[55vh] overflow-auto rounded-lg border border-default">
            <table class="w-full min-w-[1050px] text-left text-sm"><thead class="sticky top-0 border-b border-default bg-elevated text-xs uppercase text-muted"><tr><th class="px-4 py-3">Punëtori</th><th class="px-4 py-3">Data</th><th class="px-4 py-3">Hyrja</th><th class="px-4 py-3">Dalja në pauzë</th><th class="px-4 py-3">Kthimi</th><th class="px-4 py-3">Dalja nga puna</th><th class="px-4 py-3">Orari i punës</th><th class="px-4 py-3">Orë shtesë</th></tr></thead><tbody><tr v-for="record in records" :key="record.id" class="border-b border-default last:border-0"><td class="px-4 py-4 text-highlighted">{{ record.employee?.full_name || '—' }}</td><td class="px-4 py-4 text-muted">{{ record.work_date }}</td><td class="px-4 py-4 text-muted">{{ time(record.check_in) }}</td><td class="px-4 py-4 text-muted">{{ time(record.break_out) }}</td><td class="px-4 py-4 text-muted">{{ time(record.break_in) }}</td><td class="px-4 py-4 text-muted">{{ time(record.check_out) }}</td><td class="px-4 py-4 font-medium text-highlighted">{{ workHours(record) }}</td><td class="px-4 py-4 font-medium text-primary">{{ overtimeHours(record) }}</td></tr><tr v-if="!records.length"><td colspan="8" class="px-4 py-8 text-center text-muted">Nuk ka regjistrime.</td></tr></tbody></table>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="monthlyModalOpen" title="Raporti mujor i orëve" :ui="{ content: 'max-w-5xl' }" @update:open="(open) => { if (open) loadMonthlyRecords() }">
      <template #body>
        <div class="space-y-5">
          <div class="flex flex-wrap items-end gap-4">
            <UFormField label="Muaji"><UInput v-model="monthlyFilters.month" type="month" /></UFormField>
            <UFormField label="Punëtori"><USelect v-model="monthlyFilters.employeeId" :items="employeeItems" /></UFormField>
          </div>
          <UAlert v-if="!monthlyRecords.length" color="neutral" variant="subtle" title="Nuk ka regjistrime për këtë periudhë." />
          <div v-else class="overflow-auto rounded-lg border border-default">
            <table class="w-full min-w-[720px] text-left text-sm">
              <thead class="border-b border-default bg-elevated text-xs uppercase text-muted"><tr><th class="px-4 py-3">Punëtori</th><th class="px-4 py-3">Ditë pune</th><th class="px-4 py-3">Orë pune</th><th class="px-4 py-3">Orë shtesë</th></tr></thead>
              <tbody><tr v-for="item in monthlySummary" :key="item.employeeId" class="border-b border-default last:border-0"><td class="px-4 py-4 font-medium text-highlighted">{{ item.name }}</td><td class="px-4 py-4 text-muted">{{ item.days }}</td><td class="px-4 py-4 text-highlighted">{{ formatTotalMinutes(item.workMinutes) }}</td><td class="px-4 py-4 font-semibold text-primary">{{ formatTotalMinutes(item.overtimeMinutes) }}</td></tr></tbody>
            </table>
          </div>
          <p class="text-xs text-muted">Orët shtesë llogariten vetëm për kohën reale të punës mbi 8 orë në ditë, pas zbritjes së pauzës.</p>
        </div>
      </template>
    </UModal>
  </section>
</template>
