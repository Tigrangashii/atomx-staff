<script setup lang="ts">
type Project = {
  id: string;
  name: string;
  description: string | null;
  detailed_description: string | null;
  is_active: boolean;
  created_at: string;
};
definePageMeta({ middleware: ["auth", "permissions"] });
const supabase = useSupabaseClient();
const projects = ref<Project[]>([]);
const role = ref<"owner" | "manager" | "user">("user");
const loading = ref(true);
const saving = ref(false);
const modalOpen = ref(false);
const deleteModalOpen = ref(false);
const projectToDelete = ref<Project | null>(null);
const deletingProject = ref(false);
const editingId = ref<string | null>(null);
const errorMessage = ref("");
const successMessage = ref("");
const form = reactive({
  name: "",
  description: "",
  detailedDescription: "",
  isActive: true,
});

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    name: "",
    description: "",
    detailedDescription: "",
    isActive: true,
  });
  errorMessage.value = "";
  modalOpen.value = true;
}
function openEdit(project: Project) {
  editingId.value = project.id;
  Object.assign(form, {
    name: project.name,
    description: project.description || "",
    detailedDescription: project.detailed_description || "",
    isActive: project.is_active,
  });
  errorMessage.value = "";
  modalOpen.value = true;
}
async function loadProjects() {
  loading.value = true;
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    role.value = profile?.role || "user";
  }

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, description, detailed_description, is_active, created_at",
    )
    .order("name");
  if (error) errorMessage.value = error.message;
  projects.value = (data || []) as Project[];
  loading.value = false;
}
async function saveProject() {
  errorMessage.value = "";
  successMessage.value = "";
  if (!form.name.trim()) {
    errorMessage.value = "Shkruaj emrin e projektit.";
    return;
  }
  saving.value = true;
  const payload = {
    name: form.name.trim(),
    description: form.description.trim() || null,
    detailed_description: form.detailedDescription.trim() || null,
    is_active: form.isActive,
  };
  const result = editingId.value
    ? await supabase.from("projects").update(payload).eq("id", editingId.value)
    : await supabase.from("projects").insert(payload);
  saving.value = false;
  if (result.error) {
    errorMessage.value = result.error.message;
    return;
  }
  modalOpen.value = false;
  successMessage.value = editingId.value
    ? "Projekti u përditësua."
    : "Projekti u shtua.";
  await loadProjects();
}
function askDeleteProject(project: Project) {
  projectToDelete.value = project;
  deleteModalOpen.value = true;
}

function cancelDeleteProject() {
  if (deletingProject.value) return;
  deleteModalOpen.value = false;
  projectToDelete.value = null;
}

async function confirmDeleteProject() {
  const project = projectToDelete.value;
  if (!project) return;

  deletingProject.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", project.id);
  if (error) errorMessage.value = error.message;
  else {
    successMessage.value = "Projekti u fshi.";
    deleteModalOpen.value = false;
    projectToDelete.value = null;
    await loadProjects();
  }
  deletingProject.value = false;
}
function projectActions(project: Project) {
  return [
    {
      label: "Edito projektin",
      icon: "i-lucide-pencil",
      onSelect: () => openEdit(project),
    },
    {
      label: "Fshi projektin",
      icon: "i-lucide-trash-2",
      color: "error" as const,
      onSelect: () => askDeleteProject(project),
    },
  ];
}
onMounted(loadProjects);
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">Projektet</h2>
        <p class="muted">Menaxho projektet ku angazhohet stafi.</p>
      </div>
      <UButton
        v-if="role === 'owner'"
        label="Shto projekt"
        icon="i-lucide-plus"
        @click="openCreate"
      />
    </div>
    <UAlert
      v-if="successMessage"
      color="success"
      variant="subtle"
      :description="successMessage"
    /><UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      title="Gabim"
      :description="errorMessage"
    />
    <UCard
      ><div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-14 w-full" />
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[950px] text-left text-sm">
          <thead class="border-b border-default text-xs uppercase text-muted">
            <tr>
              <th class="px-4 py-3">Projekti</th>
              <th class="px-4 py-3">Përshkrimi</th>
              <th class="px-4 py-3">Statusi</th>
              <th class="px-4 py-3">Workspace</th>
              <th v-if="role === 'owner'" class="px-4 py-3">Veprime</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="project in projects"
              :key="project.id"
              class="border-b border-default last:border-0"
            >
              <td class="px-4 py-4 font-medium text-highlighted">
                <NuxtLink
                  class="hover:text-primary"
                  :to="`/projects/${project.id}`"
                  >{{ project.name }}</NuxtLink
                >
              </td>
              <td
                class="px-4 py-4 max-w-xl whitespace-pre-line leading-6 text-muted"
              >
                {{ project.description || "—" }}
              </td>
              <td class="px-4 py-4">
                <UBadge
                  :color="project.is_active ? 'success' : 'neutral'"
                  variant="subtle"
                  >{{ project.is_active ? "Aktiv" : "Joaktiv" }}</UBadge
                >
              </td>
              <td class="px-4 py-4">
                <UButton
                  size="xs"
                  color="primary"
                  variant="outline"
                  label="Workspace"
                  icon="i-lucide-folder-open"
                  :to="`/projects/${project.id}`"
                />
              </td>
              <td v-if="role === 'owner'" class="px-4 py-4">
                <UDropdownMenu :items="projectActions(project)"
                  ><UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-heroicons-ellipsis-horizontal"
                    class="cursor-pointer"
                    aria-label="Veprime"
                /></UDropdownMenu>
              </td>
            </tr>
            <tr v-if="!projects.length">
              <td
                :colspan="role === 'owner' ? 5 : 4"
                class="px-4 py-8 text-center text-muted"
              >
                Nuk ka projekte.
              </td>
            </tr>
          </tbody>
        </table>
      </div></UCard
    >
    <UModal
      v-model:open="modalOpen"
      :title="editingId ? 'Edito projektin' : 'Shto projekt'"
      ><template #body
        ><form class="space-y-4" @submit.prevent="saveProject">
          <UFormField label="Emri i projektit" required
            ><UInput
              v-model="form.name"
              class="w-full"
              placeholder="p.sh. AtomX HR Platform" /></UFormField
          ><UFormField label="Përshkrimi i shkurtër"
            ><UTextarea
              v-model="form.description"
              class="w-full"
              placeholder="Përshkrim i shkurtër" /></UFormField
          ><UCheckbox v-model="form.isActive" label="Projekti është aktiv" />
          <div class="flex justify-end gap-3 pt-3">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              type="button"
              @click="modalOpen = false"
            /><UButton
              type="submit"
              :label="editingId ? 'Ruaj ndryshimet' : 'Shto projektin'"
              :loading="saving"
            />
          </div></form></template
    ></UModal>

    <UModal v-model:open="deleteModalOpen" title="Fshi projektin">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            A deshiron ta fshish projektin
            <span class="font-semibold text-highlighted">
              {{ projectToDelete?.name }}
            </span>
            ? Ky veprim nuk mund te kthehet mbrapa.
          </p>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              :disabled="deletingProject"
              @click="cancelDeleteProject"
            />
            <UButton
              color="error"
              label="Fshi projektin"
              :loading="deletingProject"
              @click="confirmDeleteProject"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
