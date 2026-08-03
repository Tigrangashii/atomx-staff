<script setup lang="ts">
type StaffMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: "owner" | "manager" | "user";
  position: string | null;
  phone: string | null;
  contract_date: string | null;
  annual_leave_days: number;
  is_active: boolean;
};

definePageMeta({ middleware: ["auth", "permissions"] });

const supabase = useSupabaseClient();
const user = useSupabaseUser();
const currentUserId = ref("");
const role = ref<"owner" | "manager" | "user">("user");
const staff = ref<StaffMember[]>([]);
const loading = ref(true);
const saving = ref(false);
const modalOpen = ref(false);
const editingId = ref<string | null>(null);
const deleteModalOpen = ref(false);
const memberToDelete = ref<StaffMember | null>(null);
const deleting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const searchTerm = ref("");

const form = reactive({
  fullName: "",
  email: "",
  role: "user" as StaffMember["role"],
  position: "",
  phone: "",
  contractDate: "",
  annualLeaveDays: 20,
});

const roles = [
  { label: "Përdorues", value: "user" },
  { label: "Menaxher", value: "manager" },
  { label: "Pronar", value: "owner" },
];

const filteredStaff = computed(() => {
  const search = searchTerm.value.trim().toLocaleLowerCase();
  if (!search) return staff.value;
  return staff.value.filter((member) =>
    member.full_name.toLocaleLowerCase().includes(search),
  );
});

async function loadStaff() {
  loading.value = true;
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id) {
    currentUserId.value = authData.user.id;
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    role.value = currentProfile?.role || "user";
  }
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, position, phone, contract_date, annual_leave_days, is_active",
    )
    .order("full_name");

  if (error) errorMessage.value = error.message;
  staff.value = (data || []) as StaffMember[];
  const currentMember = staff.value.find(
    (member) => member.id === currentUserId.value,
  );
  if (currentMember) role.value = currentMember.role;
  loading.value = false;
}

function openCreateModal() {
  editingId.value = null;
  Object.assign(form, {
    fullName: "",
    email: "",
    role: "user",
    position: "",
    phone: "",
    contractDate: "",
    annualLeaveDays: 20,
  });
  errorMessage.value = "";
  modalOpen.value = true;
}

function openEditModal(member: StaffMember) {
  editingId.value = member.id;
  Object.assign(form, {
    fullName: member.full_name,
    email: member.email || "",
    role: member.role,
    position: member.position || "",
    phone: member.phone || "",
    contractDate: member.contract_date || "",
    annualLeaveDays: member.annual_leave_days ?? 20,
  });
  errorMessage.value = "";
  modalOpen.value = true;
}

async function inviteStaff() {
  errorMessage.value = "";
  successMessage.value = "";

  if (!form.fullName.trim() || !form.email.trim()) {
    errorMessage.value = "Plotëso emrin dhe email-in.";
    return;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName.trim(),
          role: form.role,
          position: form.position.trim() || null,
          phone: form.phone.trim() || null,
          contract_date: form.contractDate || null,
          annual_leave_days: Math.max(
            0,
            Math.min(365, Number(form.annualLeaveDays) || 0),
          ),
        })
        .eq("id", editingId.value);
      if (error) throw error;
    } else {
      await $fetch("/api/staff/invite", { method: "POST", body: form });
    }
    modalOpen.value = false;
    successMessage.value = editingId.value
      ? "Të dhënat u përditësuan me sukses."
      : "Ftesa u dërgua me sukses.";
    await loadStaff();
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || "Ftesa dështoi.";
  } finally {
    saving.value = false;
  }
}

async function deleteStaff(member: StaffMember) {
  memberToDelete.value = member;
  deleteModalOpen.value = true;
}

function canDelete(member: StaffMember) {
  if (!currentUserId.value || member.id === currentUserId.value) return false;
  return (
    role.value === "owner" ||
    (role.value === "manager" && member.role === "user")
  );
}

async function confirmDeleteStaff() {
  if (!memberToDelete.value) return;
  errorMessage.value = "";
  deleting.value = true;
  try {
    await $fetch(`/api/staff/${memberToDelete.value.id}`, { method: "DELETE" });
    deleteModalOpen.value = false;
    successMessage.value = "Anëtari u fshi me sukses.";
    await loadStaff();
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || "Fshirja dështoi.";
  } finally {
    deleting.value = false;
  }
}

function roleLabel(role: StaffMember["role"]) {
  return { owner: "Pronar", manager: "Menaxher", user: "Përdorues" }[role];
}

onMounted(loadStaff);
</script>

<template>
  <section class="space-y-6">
    <div
      class="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
    >
      <div>
        <h2 class="text-2xl font-semibold text-slate-900">Stafi</h2>
        <p class="muted">
          Shto dhe menaxho anëtarët e ekipit të AtomX Solutions.
        </p>
      </div>
      <UButton
        label="Shto staf"
        icon="i-lucide-plus"
        class="cursor-pointer"
        @click="openCreateModal"
      />
    </div>

    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :description="successMessage"
    />
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      title="Gabim"
      :description="errorMessage"
    />

    <UInput
      v-model="searchTerm"
      icon="i-lucide-search"
      placeholder="Kërko staf sipas emrit..."
      class="w-1/2"
    />

    <UCard>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="item in 5" :key="item" class="h-12 w-full" />
      </div>
      <div v-else-if="staff.length === 0" class="py-12 text-center">
        <p class="font-medium text-slate-900">Nuk ka staf të regjistruar</p>
        <p class="mt-1 text-sm text-slate-500">
          Shto anëtarin e parë të ekipit.
        </p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-170 text-left text-sm">
          <thead class="border-b border-default text-xs uppercase text-muted">
            <tr>
              <th class="px-4 py-3">Emri</th>
              <th class="px-4 py-3">Email</th>
              <th class="px-4 py-3">Pozita</th>
              <th class="px-4 py-3">Pushimi vjetor</th>
              <th class="px-4 py-3">Roli</th>
              <th class="px-4 py-3">Statusi</th>
              <th class="px-4 py-3">Veprime</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="member in filteredStaff"
              :key="member.id"
              class="border-b border-default last:border-0"
            >
              <td class="px-4 py-4 font-medium text-highlighted">
                {{ member.full_name || "Pa emër" }}
              </td>
              <td class="px-4 py-4 text-muted">{{ member.email || "—" }}</td>
              <td class="px-4 py-4 text-muted">{{ member.position || "—" }}</td>
              <td class="px-4 py-4 text-muted">
                {{ member.annual_leave_days }} ditë
              </td>
              <td class="px-4 py-4">
                <UBadge color="neutral" variant="subtle">{{
                  roleLabel(member.role)
                }}</UBadge>
              </td>
              <td class="px-4 py-4">
                <UBadge
                  :color="member.is_active ? 'success' : 'neutral'"
                  variant="subtle"
                  >{{ member.is_active ? "Aktiv" : "Joaktiv" }}</UBadge
                >
              </td>
              <td class="px-4 py-4">
                <div class="flex gap-2">
                  <UButton
                    size="xs"
                    icon="i-lucide-pencil"
                    label="Edito"
                    color="neutral"
                    variant="soft"
                    @click="openEditModal(member)"
                  /><UButton
                    v-if="canDelete(member)"
                    size="xs"
                    icon="i-lucide-trash-2"
                    label="Fshi"
                    color="error"
                    variant="soft"
                    @click="deleteStaff(member)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-if="!filteredStaff.length"
          class="py-8 text-center text-sm text-muted"
        >
          Nuk u gjet asnjë anëtar me këtë emër.
        </p>
      </div>
    </UCard>

    <UModal
      v-model:open="modalOpen"
      :title="editingId ? 'Edito anëtarin e stafit' : 'Shto anëtar të stafit'"
      :description="
        editingId
          ? 'Përditëso të dhënat e anëtarit.'
          : 'Do t\'i dërgohet një ftesë në email.'
      "
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="inviteStaff">
          <UFormField label="Emri i plotë" required
            ><UInput
              v-model="form.fullName"
              placeholder="p.sh. Arben Krasniqi"
              class="w-full"
          /></UFormField>
          <UFormField label="Email" required
            ><UInput
              v-model="form.email"
              type="email"
              placeholder="arben@example.com"
              class="w-full"
          /></UFormField>
          <UFormField label="Roli"
            ><USelect v-model="form.role" :items="roles" class="w-full"
          /></UFormField>
          <UFormField label="Pozita"
            ><UInput
              v-model="form.position"
              placeholder="p.sh. Inxhinier"
              class="w-full"
          /></UFormField>
          <UFormField label="Telefoni"
            ><UInput v-model="form.phone" placeholder="+383 ..." class="w-full"
          /></UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Data e nënshkrimit të kontratës"
              ><UInput
                v-model="form.contractDate"
                type="date"
                class="w-full" /></UFormField
            ><UFormField label="Ditët e pushimit vjetor"
              ><UInput
                v-model="form.annualLeaveDays"
                type="number"
                min="0"
                max="365"
                class="w-full"
            /></UFormField>
          </div>
          <div class="flex justify-end gap-3 pt-3">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              type="button"
              @click="modalOpen = false"
            /><UButton
              type="submit"
              :label="editingId ? 'Ruaj ndryshimet' : 'Dërgo ftesën'"
              :loading="saving"
            />
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteModalOpen"
      title="Konfirmo fshirjen"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-5">
          <p class="text-sm text-muted">
            A je i sigurt që dëshiron ta fshish
            <strong class="text-highlighted">{{
              memberToDelete?.full_name
            }}</strong
            >? Kjo llogari dhe të dhënat e lidhura me të do të fshihen
            përgjithmonë.
          </p>
          <div class="flex justify-end gap-3">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              @click="deleteModalOpen = false"
            /><UButton
              color="error"
              label="Po, fshije"
              icon="i-lucide-trash-2"
              :loading="deleting"
              @click="confirmDeleteStaff"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
