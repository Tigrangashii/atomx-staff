<script setup lang="ts">
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { CalendarOptions, EventClickArg } from '@fullcalendar/core'

type Role = 'owner' | 'manager' | 'user'
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
type LeaveRequest = {
  id: string
  employee_id: string
  leave_type: 'annual' | 'sick' | 'unpaid' | 'other'
  start_date: string
  end_date: string
  reason: string | null
  rejection_reason: string | null
  status: LeaveStatus
  employee?: { full_name: string } | null
}
type Employee = { id: string; full_name: string }
type OfficialHoliday = { id: string; name: string; holiday_date: string }

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const requests = ref<LeaveRequest[]>([])
const employees = ref<Employee[]>([])
const holidays = ref<OfficialHoliday[]>([])
const role = ref<Role>('user')
const loading = ref(true)
const errorMessage = ref('')
const selectedRequest = ref<LeaveRequest | null>(null)
const detailsModalOpen = ref(false)
const holidayModalOpen = ref(false)
const holidayListModalOpen = ref(false)
const holidayDeleteModalOpen = ref(false)
const holidaySaving = ref(false)
const selectedHoliday = ref<OfficialHoliday | null>(null)
const editingHolidayId = ref<string | null>(null)
const holidayForm = reactive({ name: '', date: new Date().toISOString().slice(0, 10) })
const filters = reactive({ employeeId: 'all', status: 'all' as LeaveStatus | 'all' })

const statusItems = [
  { label: 'Të gjitha statuset', value: 'all' },
  { label: 'Në pritje', value: 'pending' },
  { label: 'Aprovuar', value: 'approved' },
  { label: 'Refuzuar', value: 'rejected' },
  { label: 'Anuluar', value: 'cancelled' }
]
const leaveTypeLabels = { annual: 'Pushim vjetor', sick: 'Pushim mjekësor', unpaid: 'Pa pagesë', other: 'Tjetër' }
const employeeItems = computed(() => [
  { label: 'Të gjithë punëtorët', value: 'all' },
  ...employees.value.map(employee => ({ label: employee.full_name, value: employee.id }))
])
const filteredRequests = computed(() => requests.value.filter((request) => {
  const employeeMatches = filters.employeeId === 'all' || request.employee_id === filters.employeeId
  const statusMatches = filters.status === 'all' || request.status === filters.status
  return employeeMatches && statusMatches
}))

function addDay(date: string) {
  const next = new Date(`${date}T00:00:00`)
  next.setDate(next.getDate() + 1)
  return next.toISOString().slice(0, 10)
}

function eventColor(status: LeaveStatus) {
  return { approved: '#16a34a', pending: '#f59e0b', rejected: '#dc2626', cancelled: '#64748b' }[status]
}

const events = computed(() => filteredRequests.value.map(request => ({
  id: request.id,
  title: `${request.employee?.full_name || 'Punëtori'} · ${leaveTypeLabels[request.leave_type]}`,
  start: request.start_date,
  end: addDay(request.end_date),
  allDay: true,
  backgroundColor: eventColor(request.status),
  borderColor: eventColor(request.status),
  extendedProps: { request }
})))

const holidayEvents = computed(() => holidays.value.map(holiday => ({
  id: `holiday-${holiday.id}`,
  title: `Festë zyrtare · ${holiday.name}`,
  start: holiday.holiday_date,
  allDay: true,
  backgroundColor: '#7c3aed',
  borderColor: '#7c3aed',
  extendedProps: { holiday }
})))

const calendarOptions = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, interactionPlugin],
  initialView: 'dayGridMonth',
  locale: 'sq',
  firstDay: 1,
  height: 'auto',
  dayMaxEvents: 3,
  eventDisplay: 'block',
  events: [...holidayEvents.value, ...events.value],
  eventClick: (info: EventClickArg) => {
    if (info.event.extendedProps.holiday) return
    selectedRequest.value = info.event.extendedProps.request as LeaveRequest
    detailsModalOpen.value = true
  },
  headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth' },
  buttonText: { today: 'Sot', month: 'Muaj' }
}))

async function load() {
  const { data: authData } = await supabase.auth.getUser()
  const authUser = authData.user
  if (!authUser?.id) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role, full_name').eq('id', authUser.id).maybeSingle()
    if (profileError) throw profileError
    role.value = (profile?.role || 'user') as Role

    const { data, error } = await supabase
      .from('leave_requests')
      .select('id, employee_id, leave_type, start_date, end_date, reason, rejection_reason, status, employee:profiles!leave_requests_employee_id_fkey(full_name)')
      .order('start_date', { ascending: true })
    if (error) throw error
    requests.value = (data || []) as LeaveRequest[]

    if (role.value === 'owner' || role.value === 'manager') {
      const { data: employeeData, error: employeeError } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      if (employeeError) throw employeeError
      employees.value = (employeeData || []) as Employee[]
    } else {
      employees.value = profile ? [{ id: authUser.id, full_name: profile.full_name }] : []
    }

    const { data: holidayData, error: holidayError } = await supabase
      .from('official_holidays')
      .select('id, name, holiday_date')
      .order('holiday_date', { ascending: true })
    if (holidayError && holidayError.code !== '42P01') throw holidayError
    holidays.value = (holidayData || []) as OfficialHoliday[]
  } catch (error: any) {
    errorMessage.value = error?.message || 'Kalendari nuk u ngarkua.'
  } finally {
    loading.value = false
  }
}

function openHolidayModal() {
  errorMessage.value = ''
  holidayForm.name = ''
  holidayForm.date = new Date().toISOString().slice(0, 10)
  editingHolidayId.value = null
  holidayModalOpen.value = true
}

function openEditHoliday(holiday: OfficialHoliday) {
  selectedHoliday.value = holiday
  editingHolidayId.value = holiday.id
  holidayForm.name = holiday.name
  holidayForm.date = holiday.holiday_date
  holidayListModalOpen.value = false
  holidayModalOpen.value = true
}

function openDeleteHoliday(holiday: OfficialHoliday) {
  selectedHoliday.value = holiday
  holidayDeleteModalOpen.value = true
}

async function deleteHoliday() {
  if (!selectedHoliday.value) return
  holidaySaving.value = true
  const { error } = await supabase.from('official_holidays').delete().eq('id', selectedHoliday.value.id)
  holidaySaving.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }
  holidayDeleteModalOpen.value = false
  selectedHoliday.value = null
  await load()
}

async function addHoliday() {
  if (!holidayForm.name.trim() || !holidayForm.date) return
  holidaySaving.value = true
  errorMessage.value = ''
  const { data: authData } = await supabase.auth.getUser()
  const query = editingHolidayId.value
    ? supabase.from('official_holidays').update({ name: holidayForm.name.trim(), holiday_date: holidayForm.date }).eq('id', editingHolidayId.value)
    : supabase.from('official_holidays').insert({ name: holidayForm.name.trim(), holiday_date: holidayForm.date, created_by: authData.user?.id })
  const { error } = await query
  holidaySaving.value = false
  if (error) {
    errorMessage.value = error.code === '23505' ? 'Për këtë datë ekziston tashmë një festë zyrtare.' : error.message
    return
  }
  holidayModalOpen.value = false
  editingHolidayId.value = null
  await load()
}

function statusLabel(status: LeaveStatus) {
  return { pending: 'Në pritje', approved: 'Aprovuar', rejected: 'Refuzuar', cancelled: 'Anuluar' }[status]
}

onMounted(load)
</script>

<template>
  <section class="relative space-y-6">
    <div v-if="role !== 'user'" class="absolute right-0 top-12 z-10"><UButton label="Lista e festave zyrtare" icon="i-lucide-list" color="neutral" variant="soft" @click="holidayListModalOpen = true" /></div>
    <div v-if="role !== 'user'" class="absolute right-0 top-0 z-10"><UButton label="Shto festë zyrtare" icon="i-lucide-plus" @click="openHolidayModal" /></div>
    <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p class="eyebrow">Menaxhimi</p><h2 class="text-2xl font-semibold text-highlighted">Kalendari i pushimeve</h2><p class="muted">Shiko pushimet sipas datës, punëtorit dhe statusit.</p></div>
      <UButton to="/leaves" label="Lista e kërkesave" icon="i-lucide-list" color="neutral" variant="soft" />
    </div>
    <UAlert v-if="errorMessage" color="error" variant="subtle" title="Gabim" :description="errorMessage" />

    <UCard>
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Punëtori"><USelect v-model="filters.employeeId" :items="employeeItems" class="w-full" /></UFormField>
        <UFormField label="Statusi"><USelect v-model="filters.status" :items="statusItems" class="w-full" /></UFormField>
      </div>
    </UCard>

    <UCard>
      <div v-if="loading" class="space-y-3"><USkeleton class="h-10 w-full" /><USkeleton class="h-96 w-full" /></div>
      <div v-else class="overflow-x-auto"><FullCalendar :options="calendarOptions" /></div>
      <div class="mt-5 flex flex-wrap gap-4 border-t border-default pt-4 text-sm text-muted"><span><i class="mr-2 inline-block size-3 rounded-full bg-success" />Aprovuar</span><span><i class="mr-2 inline-block size-3 rounded-full bg-warning" />Në pritje</span><span><i class="mr-2 inline-block size-3 rounded-full bg-error" />Refuzuar</span></div>
    </UCard>

    <UModal v-model:open="detailsModalOpen" title="Detajet e pushimit">
      <template #body>
        <div v-if="selectedRequest" class="space-y-3 text-sm">
          <div class="flex justify-between gap-4"><span class="text-muted">Punëtori</span><strong class="text-highlighted">{{ selectedRequest.employee?.full_name || 'Punëtori' }}</strong></div>
          <div class="flex justify-between gap-4"><span class="text-muted">Lloji</span><strong class="text-highlighted">{{ leaveTypeLabels[selectedRequest.leave_type] }}</strong></div>
          <div class="flex justify-between gap-4"><span class="text-muted">Periudha</span><strong class="text-highlighted">{{ selectedRequest.start_date }} – {{ selectedRequest.end_date }}</strong></div>
          <div class="flex justify-between gap-4"><span class="text-muted">Statusi</span><UBadge :color="selectedRequest.status === 'approved' ? 'success' : selectedRequest.status === 'rejected' ? 'error' : 'warning'" variant="subtle">{{ statusLabel(selectedRequest.status) }}</UBadge></div>
          <div v-if="selectedRequest.reason" class="border-t border-default pt-3"><p class="text-muted">Arsyeja</p><p class="mt-1 text-highlighted">{{ selectedRequest.reason }}</p></div>
          <div v-if="selectedRequest.rejection_reason" class="border-t border-default pt-3"><p class="text-muted">Arsyeja e refuzimit</p><p class="mt-1 text-error">{{ selectedRequest.rejection_reason }}</p></div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="holidayModalOpen" title="Shto festë zyrtare" description="Zgjidh datën dhe shkruaj emrin e festës.">
      <template #body>
        <form class="space-y-4" @submit.prevent="addHoliday">
          <UFormField label="Data" required><UInput v-model="holidayForm.date" type="date" class="w-full" /></UFormField>
          <UFormField label="Emri i festës" required><UInput v-model="holidayForm.name" placeholder="p.sh. Dita e Pavarësisë" class="w-full" /></UFormField>
          <div class="flex justify-end gap-2"><UButton label="Anulo" color="neutral" variant="ghost" @click="holidayModalOpen = false" /><UButton type="submit" label="Ruaj festën" :loading="holidaySaving" :disabled="!holidayForm.name.trim() || !holidayForm.date" /></div>
        </form>
      </template>
    </UModal>
    <UModal v-model:open="holidayListModalOpen" title="Lista e festave zyrtare" :ui="{ content: 'max-w-3xl' }">
      <template #body>
        <div v-if="holidays.length" class="divide-y divide-default">
          <div v-for="holiday in holidays" :key="holiday.id" class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div><p class="font-medium text-highlighted">{{ holiday.name }}</p><p class="text-sm text-muted">{{ holiday.holiday_date }}</p></div>
            <div class="flex gap-2"><UButton size="sm" label="Edito" icon="i-lucide-pencil" color="neutral" variant="soft" @click="openEditHoliday(holiday)" /><UButton size="sm" label="Fshi" icon="i-lucide-trash-2" color="error" variant="soft" @click="openDeleteHoliday(holiday)" /></div>
          </div>
        </div>
        <UEmpty v-else icon="i-lucide-calendar-x" title="Nuk ka festa zyrtare" description="Shto festën e parë zyrtare nga butoni sipër." />
      </template>
    </UModal>

    <UModal v-model:open="holidayDeleteModalOpen" title="Fshi festën zyrtare" description="Ky veprim nuk mund të zhbëhet.">
      <template #body>
        <p class="text-sm text-muted">A dëshiron ta fshish festën <strong class="text-highlighted">{{ selectedHoliday?.name }}</strong>?</p>
        <div class="mt-5 flex justify-end gap-2"><UButton label="Anulo" color="neutral" variant="ghost" @click="holidayDeleteModalOpen = false" /><UButton label="Po, fshije" color="error" :loading="holidaySaving" @click="deleteHoliday" /></div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
:deep(a[href="/leaves"]) {
  display: none;
}
</style>
