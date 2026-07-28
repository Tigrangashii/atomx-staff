<script setup lang="ts">
type LeaveRequest = {
  id: string
  employee_id: string
  email: string | null
  phone: string | null
  leave_type: 'annual' | 'sick' | 'unpaid' | 'other'
  start_date: string
  end_date: string
  reason: string | null
  rejection_reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  employee?: { full_name: string } | null
}
type LeaveProfile = { id: string; full_name: string; contract_date: string | null; annual_leave_days: number; role: 'owner' | 'manager' | 'user' }

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const requests = ref<LeaveRequest[]>([])
const loading = ref(true)
const saving = ref(false)
const modalOpen = ref(false)
const balancesModalOpen = ref(false)
const role = ref<'owner' | 'manager' | 'user'>('user')
const errorMessage = ref('')
const successMessage = ref('')
const leaveProfiles = ref<LeaveProfile[]>([])
const searchQuery = ref('')
const reviewSavingId = ref<string | null>(null)
const rejectionModalOpen = ref(false)
const selectedRequest = ref<LeaveRequest | null>(null)
const rejectionReason = ref('')

const form = reactive({
  leaveType: 'annual' as LeaveRequest['leave_type'],
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  email: '',
  phone: '',
  reason: ''
})

const leaveTypes = [
  { label: 'Pushim vjetor', value: 'annual' },
  { label: 'Pushim mjekësor', value: 'sick' },
  { label: 'Pa pagesë', value: 'unpaid' },
  { label: 'Tjetër', value: 'other' }
]

const canReview = computed(() => role.value === 'owner' || role.value === 'manager')
const filteredRequests = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('sq-AL')
  if (!query) return requests.value
  return requests.value.filter((request) => (request.employee?.full_name || '').toLocaleLowerCase('sq-AL').includes(query))
})

function leaveDays(request: LeaveRequest) {
  const start = new Date(`${request.start_date}T00:00:00`)
  const end = new Date(`${request.end_date}T00:00:00`)
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
}

const balances = computed(() => leaveProfiles.value.map((profile) => {
  const approved = requests.value.filter(request => request.employee_id === profile.id && request.status === 'approved')
  const annualUsed = approved.filter(request => request.leave_type === 'annual').reduce((sum, request) => sum + leaveDays(request), 0)
  const sickUsed = approved.filter(request => request.leave_type === 'sick').reduce((sum, request) => sum + leaveDays(request), 0)
  return {
    ...profile,
    annualUsed,
    annualRemaining: Math.max(0, profile.annual_leave_days - annualUsed),
    sickUsed,
    sickRemaining: Math.max(0, 20 - sickUsed)
  }
}))

async function load() {
  const { data: authData } = await supabase.auth.getUser()
  const currentUser = authData.user
  if (!currentUser?.id) return
  loading.value = true
  const { data: profile } = await supabase.from('profiles').select('role, email, phone, full_name, contract_date, annual_leave_days').eq('id', currentUser.id).single()
  role.value = profile?.role || 'user'
  form.email = profile?.email || currentUser.email || ''
  form.phone = profile?.phone || ''

  const { data, error } = await supabase
    .from('leave_requests')
    .select('id, employee_id, email, phone, leave_type, start_date, end_date, reason, rejection_reason, status, employee:profiles!leave_requests_employee_id_fkey(full_name)')
    .order('created_at', { ascending: false })

  if (error) errorMessage.value = error.message
  requests.value = (data || []) as LeaveRequest[]
  if (canReview.value) {
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name, contract_date, annual_leave_days, role').order('full_name')
    if (profilesError) errorMessage.value = profilesError.message
    leaveProfiles.value = (profiles || []) as LeaveProfile[]
  } else {
    leaveProfiles.value = profile ? [{ ...profile, id: currentUser.id } as LeaveProfile] : []
  }
  loading.value = false
}

function openModal() {
  errorMessage.value = ''
  successMessage.value = ''
  modalOpen.value = true
}

async function submitRequest() {
  errorMessage.value = ''
  if (form.endDate < form.startDate) {
    errorMessage.value = 'Data e përfundimit duhet të jetë pas datës së fillimit.'
    return
  }

  const { data: authData } = await supabase.auth.getUser()
  const currentUser = authData.user
  if (!currentUser?.id) {
    errorMessage.value = 'Sesioni ka skaduar. Kyçu përsëri në aplikacion.'
    return
  }

  const { data: approvedLeaves, error: approvedLeavesError } = await supabase
    .from('leave_requests')
    .select('start_date, end_date')
    .eq('employee_id', currentUser.id)
    .eq('status', 'approved')

  if (approvedLeavesError) {
    errorMessage.value = approvedLeavesError.message
    return
  }

  const overlapsApprovedLeave = (approvedLeaves || []).some((leave) => (
    form.startDate <= leave.end_date && form.endDate >= leave.start_date
  ))

  if (overlapsApprovedLeave) {
    errorMessage.value = 'Në këtë periudhë ke tashmë një pushim të aprovuar.'
    return
  }

  saving.value = true
  try {
    await $fetch('/api/leaves/request', {
      method: 'POST',
      body: { leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate, email: form.email, phone: form.phone, reason: form.reason }
    })
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.data?.message || error?.message || 'Kërkesa nuk u dërgua.'
    saving.value = false
    return
  }
  saving.value = false

  modalOpen.value = false
  successMessage.value = 'Kërkesa për pushim u dërgua.'
  await load()
}

function openRejectionModal(request: LeaveRequest) {
  errorMessage.value = ''
  selectedRequest.value = request
  rejectionReason.value = ''
  rejectionModalOpen.value = true
}

async function reviewRequest(request: LeaveRequest, status: 'approved' | 'rejected', rejectionReasonValue: string | null = null) {
  errorMessage.value = ''
  successMessage.value = ''
  reviewSavingId.value = request.id
  let error: any = null
  try {
    await $fetch(`/api/leaves/${request.id}/review`, { method: 'PATCH', body: { status, rejectionReason: rejectionReasonValue } })
  } catch (requestError: any) {
    error = requestError?.data || requestError
  }

  reviewSavingId.value = null
  if (error) {
    const message = error?.statusMessage || error?.message || 'Kërkesa nuk u shqyrtua.'
    errorMessage.value = message.includes('leave_requests_no_approved_overlap')
      ? 'Ky punëtor ka tashmë pushim të aprovuar në këtë periudhë.'
      : message
  } else {
    successMessage.value = status === 'approved' ? 'Kërkesa u aprovua dhe u ruajt.' : 'Kërkesa u refuzua dhe u ruajt.'
    await load()
  }
}

async function rejectRequest() {
  if (!selectedRequest.value || !rejectionReason.value.trim()) {
    errorMessage.value = 'Shkruaj arsyen e refuzimit.'
    return
  }
  rejectionModalOpen.value = false
  await reviewRequest(selectedRequest.value, 'rejected', rejectionReason.value.trim())
  selectedRequest.value = null
}

function leaveTypeLabel(type: LeaveRequest['leave_type']) {
  return leaveTypes.find((item) => item.value === type)?.label || type
}

function statusLabel(status: LeaveRequest['status']) {
  return { pending: 'Në pritje', approved: 'Aprovuar', rejected: 'Refuzuar', cancelled: 'Anuluar' }[status]
}

onMounted(load)
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div><p class="eyebrow">Menaxhimi</p><h2 class="text-2xl font-semibold text-highlighted">Pushimet</h2><p class="muted">Apliko për pushim dhe shqyrto kërkesat e ekipit.</p></div>
      <div class="flex flex-wrap gap-3"><UButton v-if="canReview" to="/leaves/calendar" label="Kalendari i pushimeve" icon="i-lucide-calendar-range" color="neutral" variant="soft" /><UButton v-if="canReview" label="Ditët e pushimit" icon="i-lucide-table" color="neutral" variant="soft" @click="balancesModalOpen = true" /><UButton label="Apliko për pushim" icon="i-lucide-plus" @click="openModal" class="cursor-pointer" /></div>
    </div>
    <UAlert v-if="successMessage" color="success" variant="subtle" :description="successMessage" />
    <UAlert v-if="errorMessage" color="error" variant="subtle" title="Gabim" :description="errorMessage" />

    <UInput v-if="canReview" v-model="searchQuery" icon="i-lucide-search" placeholder="Kërko punëtorin sipas emrit..." class="w-1/2" />

    <UCard>
      <div v-if="loading" class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-12 w-full" /></div>
      <div v-else-if="filteredRequests.length === 0" class="py-12 text-center text-muted">Nuk ka kërkesa për pushim.</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-left text-sm">
          <thead class="border-b border-default text-xs uppercase text-muted"><tr><th class="px-4 py-3">Punëtori</th><th class="px-4 py-3">Lloji</th><th class="px-4 py-3">Periudha</th><th class="px-4 py-3">Arsyeja</th><th class="px-4 py-3">Statusi</th><th v-if="canReview" class="px-4 py-3">Veprime</th></tr></thead>
          <tbody><tr v-for="request in filteredRequests" :key="request.id" class="border-b border-default last:border-0">
            <td class="px-4 py-4 font-medium text-highlighted">{{ request.employee?.full_name || 'Punëtori' }}</td>
            <td class="px-4 py-4 text-muted">{{ leaveTypeLabel(request.leave_type) }}</td>
            <td class="px-4 py-4 text-muted">{{ request.start_date }} – {{ request.end_date }}</td>
            <td class="max-w-xs px-4 py-4 text-muted"><span>{{ request.reason || '—' }}</span><span v-if="request.status === 'rejected' && request.rejection_reason" class="mt-1 block text-xs text-error">Refuzim: {{ request.rejection_reason }}</span></td>
            <td class="px-4 py-4"><UBadge :color="request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'error' : 'warning'" variant="subtle">{{ statusLabel(request.status) }}</UBadge></td>
            <td v-if="canReview" class="px-4 py-4"><div v-if="request.status === 'pending'" class="flex gap-2"><UButton size="xs" color="success" label="Aprovo" :loading="reviewSavingId === request.id" :disabled="reviewSavingId !== null" @click="reviewRequest(request, 'approved')" /><UButton size="xs" color="error" variant="soft" label="Refuzo" :disabled="reviewSavingId !== null" @click="openRejectionModal(request)" /></div><span v-else class="text-muted">—</span></td>
          </tr></tbody>
        </table>
      </div>
    </UCard>

    <UModal v-if="canReview" v-model:open="balancesModalOpen" title="Ditët e mbetura të pushimit" :ui="{ content: 'max-w-6xl' }">
      <template #body>
        <div class="overflow-x-auto rounded-lg border border-default">
          <table class="w-full min-w-[850px] text-left text-sm">
            <thead class="border-b border-default bg-elevated text-xs uppercase text-muted"><tr><th class="px-4 py-3">Punëtori</th><th class="px-4 py-3">Roli</th><th class="px-4 py-3">Data e kontratës</th><th class="px-4 py-3">Vjetor total</th><th class="px-4 py-3">Vjetor i përdorur</th><th class="px-4 py-3">Vjetor i mbetur</th><th class="px-4 py-3">Mjekësor i përdorur</th><th class="px-4 py-3">Mjekësor i mbetur</th></tr></thead>
            <tbody>
              <tr v-for="balance in balances" :key="balance.id" class="border-b border-default last:border-0"><td class="px-4 py-4 font-medium text-highlighted">{{ balance.full_name || 'Pa emër' }}</td><td class="px-4 py-4"><UBadge color="neutral" variant="subtle">{{ balance.role === 'user' ? 'Përdorues' : balance.role === 'manager' ? 'Menaxher' : 'Owner' }}</UBadge></td><td class="px-4 py-4 text-muted">{{ balance.contract_date || '—' }}</td><td class="px-4 py-4 text-muted">{{ balance.annual_leave_days }} ditë</td><td class="px-4 py-4 text-muted">{{ balance.annualUsed }} ditë</td><td class="px-4 py-4 font-semibold text-primary">{{ balance.annualRemaining }} ditë</td><td class="px-4 py-4 text-muted">{{ balance.sickUsed }} ditë</td><td class="px-4 py-4 font-semibold text-success">{{ balance.sickRemaining }} ditë</td></tr>
              <tr v-if="!balances.length"><td colspan="8" class="px-4 py-8 text-center text-muted">Nuk ka punëtorë.</td></tr>
            </tbody>
          </table>
        </div>
        <p class="mt-4 text-sm text-muted">Pushimi mjekësor është i caktuar në mënyrë statike në 20 ditë për çdo përdorues.</p>
      </template>
    </UModal>

    <UModal v-model:open="modalOpen" title="Apliko për pushim" description="Kërkesa do t'i dërgohet menaxherit për shqyrtim.">
      <template #body><form class="space-y-4" @submit.prevent="submitRequest">
        <UFormField label="Lloji i pushimit"><USelect v-model="form.leaveType" :items="leaveTypes" class="w-full" /></UFormField>
        <div class="grid gap-4 sm:grid-cols-2"><UFormField label="Nga" required><UInput v-model="form.startDate" type="date" class="w-full" /></UFormField><UFormField label="Deri" required><UInput v-model="form.endDate" type="date" class="w-full" /></UFormField></div>
        <div class="grid gap-4 sm:grid-cols-2"><UFormField label="Email" required><UInput v-model="form.email" type="email" placeholder="email@atomx-solutions.com" class="w-full" /></UFormField><UFormField label="Nr. i telefonit"><UInput v-model="form.phone" type="tel" placeholder="+383..." class="w-full" /></UFormField></div>
        <UFormField label="Arsyeja"><UTextarea v-model="form.reason" placeholder="Shkruaj arsyen e pushimit..." class="w-full" /></UFormField>
        <div class="flex justify-end gap-3 pt-3"><UButton color="neutral" variant="ghost" label="Anulo" type="button" @click="modalOpen = false" /><UButton type="submit" label="Dërgo kërkesën" :loading="saving" /></div>
      </form></template>
    </UModal>

    <UModal v-model:open="rejectionModalOpen" title="Refuzo kërkesën" description="Shkruaj arsyen pse kjo kërkesë po refuzohet.">
      <template #body>
        <form class="space-y-4" @submit.prevent="rejectRequest">
          <UFormField label="Arsyeja e refuzimit" required>
            <UTextarea v-model="rejectionReason" placeholder="Shkruaj arsyen e refuzimit..." :rows="4" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-3">
            <UButton type="button" color="neutral" variant="ghost" label="Anulo" @click="rejectionModalOpen = false" />
            <UButton type="submit" color="error" label="Ruaj refuzimin" :loading="reviewSavingId !== null" />
          </div>
        </form>
      </template>
    </UModal>
  </section>
</template>
