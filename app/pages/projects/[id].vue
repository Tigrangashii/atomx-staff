<script setup lang="ts">
type Project = {
  id: string;
  name: string;
  description: string | null;
  detailed_description: string | null;
};
type Folder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_by: string;
  created_at: string;
  creator?: { full_name: string | null; email: string | null } | null;
};
type AssignableUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "owner" | "manager" | "user";
};
type ProjectMember = AssignableUser & {
  membership: "owner" | "assigned";
};
type ProjectFile = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  folder_id: string | null;
  uploaded_by: string;
  created_at: string;
  uploader?: { full_name: string | null; email: string | null } | null;
};

definePageMeta({ middleware: ["auth", "permissions"] });
const route = useRoute();
const supabase = useSupabaseClient();
const projectId = String(route.params.id);
const project = ref<Project | null>(null);
const folders = ref<Folder[]>([]);
const files = ref<ProjectFile[]>([]);
const currentFolder = ref<Folder | null>(null);
const role = ref<"owner" | "manager" | "user">("user");
const currentUserId = ref<string | null>(null);
const isAssignedToProject = ref(false);
const loading = ref(true);
const uploading = ref(false);
const modalOpen = ref(false);
const folderName = ref("");
const folderDeleteModalOpen = ref(false);
const folderToDelete = ref<Folder | null>(null);
const deletingFolder = ref(false);
const fileDeleteModalOpen = ref(false);
const fileToDelete = ref<ProjectFile | null>(null);
const deletingFile = ref(false);
const filePreviewModalOpen = ref(false);
const filePreviewUrl = ref("");
const filePreviewItem = ref<ProjectFile | null>(null);
const loadingPreview = ref(false);
const editingDescription = ref(false);
const savingDescription = ref(false);
const detailedDescription = ref("");
const errorMessage = ref("");
const assignModalOpen = ref(false);
const assignableUsers = ref<AssignableUser[]>([]);
const projectMembers = ref<ProjectMember[]>([]);
const selectedAssigneeIds = ref<string[]>([]);
const savingAssignments = ref(false);

const isOwner = computed(() => role.value === "owner");
const canContributeMaterials = computed(
  () => isOwner.value || isAssignedToProject.value,
);
const visibleFolders = computed(() =>
  folders.value.filter(
    (folder) => folder.parent_folder_id === (currentFolder.value?.id || null),
  ),
);
const visibleFiles = computed(() =>
  files.value.filter(
    (file) => file.folder_id === (currentFolder.value?.id || null),
  ),
);
const parentFolder = computed(() =>
  currentFolder.value
    ? folders.value.find(
        (folder) => folder.id === currentFolder.value?.parent_folder_id,
      ) || null
    : null,
);
const uploadLabel = computed(() =>
  currentFolder.value
    ? `Ngarko në ${currentFolder.value.name}`
    : "Ngarko dokument",
);
const backTooltip = computed(() =>
  parentFolder.value
    ? `Back to ${parentFolder.value.name}`
    : "Back to project materials",
);
const assignedUsers = computed(() =>
  assignableUsers.value.filter((user) =>
    selectedAssigneeIds.value.includes(user.id),
  ),
);
const visibleProjectMembers = computed(() =>
  projectMembers.value.length
    ? projectMembers.value
    : assignedUsers.value.map((user) => ({
        ...user,
        membership: "assigned" as const,
      })),
);
function goBackFolder() {
  currentFolder.value = parentFolder.value;
}

function openFolder(folder: Folder) {
  currentFolder.value = folder;
}

function canDeleteFolder(folder: Folder) {
  return isOwner.value || folder.created_by === currentUserId.value;
}

function canDeleteFile(file: ProjectFile) {
  return isOwner.value || file.uploaded_by === currentUserId.value;
}

function isPreviewableFile(file: ProjectFile | null) {
  if (!file) return false;
  const mimeType = file.mime_type || "";
  return mimeType.startsWith("image/") || mimeType === "application/pdf";
}

function isImageFile(file: ProjectFile | null) {
  return Boolean(file?.mime_type?.startsWith("image/"));
}

function isPdfFile(file: ProjectFile | null) {
  return file?.mime_type === "application/pdf";
}

function displayPerson(
  person?: { full_name: string | null; email: string | null } | null,
) {
  return person?.full_name?.trim() || person?.email || "User";
}

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "P.M" : "A.M";
  hours = hours % 12 || 12;
  return `${day}.${month}.${year}, ${String(hours).padStart(2, "0")}:${minutes} ${period}`;
}

function toggleAssignee(userId: string, checked: boolean) {
  selectedAssigneeIds.value = checked
    ? [...new Set([...selectedAssigneeIds.value, userId])]
    : selectedAssigneeIds.value.filter((id) => id !== userId);
}

function handleAssigneeChange(userId: string, event: Event) {
  toggleAssignee(userId, (event.target as HTMLInputElement).checked);
}

async function loadWorkspace() {
  loading.value = true;
  errorMessage.value = "";
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id) {
    currentUserId.value = authData.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    role.value = profile?.role || "user";

    if (role.value === "owner") {
      isAssignedToProject.value = false;
    } else {
      const { count } = await supabase
        .from("project_assignments")
        .select("project_id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("user_id", authData.user.id);
      isAssignedToProject.value = Boolean(count);
    }
  }

  const [projectResult, foldersResult, filesResult] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, detailed_description")
      .eq("id", projectId)
      .single(),
    supabase
      .from("project_folders")
      .select(
        "id, name, parent_folder_id, created_by, created_at, creator:profiles!project_folders_created_by_fkey(full_name, email)",
      )
      .eq("project_id", projectId)
      .order("name"),
    supabase
      .from("project_files")
      .select(
        "id, file_name, storage_path, mime_type, file_size, folder_id, uploaded_by, created_at, uploader:profiles!project_files_uploaded_by_fkey(full_name, email)",
      )
      .eq("project_id", projectId)
      .order("file_name"),
  ]);
  if (projectResult.error) errorMessage.value = projectResult.error.message;
  else {
    project.value = projectResult.data as Project;
    detailedDescription.value = project.value.detailed_description || "";
  }
  if (foldersResult.error) errorMessage.value = foldersResult.error.message;
  else folders.value = (foldersResult.data || []) as Folder[];
  if (filesResult.error) errorMessage.value = filesResult.error.message;
  else files.value = (filesResult.data || []) as ProjectFile[];
  await loadProjectMembers();
  if (role.value === "owner") await loadAssignmentData();
  loading.value = false;
}

async function loadProjectMembers() {
  try {
    projectMembers.value = await $fetch<ProjectMember[]>(
      `/api/projects/${projectId}/members`,
    );
  } catch {
    projectMembers.value = [];
  }
}

async function loadAssignmentData() {
  const [usersResult, assignmentsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("is_active", true)
      .neq("role", "owner")
      .order("full_name"),
    supabase
      .from("project_assignments")
      .select("user_id")
      .eq("project_id", projectId),
  ]);

  if (usersResult.error) errorMessage.value = usersResult.error.message;
  else assignableUsers.value = (usersResult.data || []) as AssignableUser[];

  if (assignmentsResult.error) {
    errorMessage.value = assignmentsResult.error.message;
  } else {
    selectedAssigneeIds.value = (assignmentsResult.data || []).map(
      (assignment) => assignment.user_id,
    );
  }
}

async function saveAssignments() {
  savingAssignments.value = true;
  errorMessage.value = "";
  const { data: authData } = await supabase.auth.getUser();

  const { data: existingAssignments, error: existingError } = await supabase
    .from("project_assignments")
    .select("user_id")
    .eq("project_id", projectId);

  if (existingError) {
    errorMessage.value = existingError.message;
    savingAssignments.value = false;
    return;
  }

  const existingIds = new Set(
    (existingAssignments || []).map((assignment) => assignment.user_id),
  );
  const selectedIds = new Set(selectedAssigneeIds.value);
  const idsToRemove = [...existingIds].filter((id) => !selectedIds.has(id));
  const idsToAdd = selectedAssigneeIds.value.filter(
    (id) => !existingIds.has(id),
  );

  if (idsToRemove.length) {
    const { error: deleteError } = await supabase
      .from("project_assignments")
      .delete()
      .eq("project_id", projectId)
      .in("user_id", idsToRemove);

    if (deleteError) {
      errorMessage.value = deleteError.message;
      savingAssignments.value = false;
      return;
    }
  }

  if (idsToAdd.length) {
    const rows = idsToAdd.map((userId) => ({
      project_id: projectId,
      user_id: userId,
      assigned_by: authData.user?.id || null,
    }));
    const { error } = await supabase.from("project_assignments").insert(rows);
    if (error) errorMessage.value = error.message;
    else {
      await $fetch("/api/notifications/project-assignment", {
        method: "POST",
        body: { projectId, userIds: idsToAdd },
      }).catch(() => null);
    }
  }

  savingAssignments.value = false;
  if (!errorMessage.value) assignModalOpen.value = false;
  await Promise.all([loadAssignmentData(), loadProjectMembers()]);
}

async function saveDescription() {
  if (!isOwner.value) return;
  savingDescription.value = true;
  const { error } = await supabase
    .from("projects")
    .update({ detailed_description: detailedDescription.value.trim() || null })
    .eq("id", projectId);
  savingDescription.value = false;
  if (error) errorMessage.value = error.message;
  else {
    if (project.value)
      project.value.detailed_description =
        detailedDescription.value.trim() || null;
    editingDescription.value = false;
  }
}

async function createFolder() {
  if (!canContributeMaterials.value) return;
  const name = folderName.value.trim();
  if (!name) return;
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("project_folders").insert({
    project_id: projectId,
    parent_folder_id: currentFolder.value?.id || null,
    name,
    created_by: auth.user?.id,
  });
  if (error) errorMessage.value = error.message;
  else {
    folderName.value = "";
    modalOpen.value = false;
    await loadWorkspace();
  }
}

function askRemoveFolder(folder: Folder) {
  folderToDelete.value = folder;
  folderDeleteModalOpen.value = true;
}

function cancelRemoveFolder() {
  if (deletingFolder.value) return;
  folderDeleteModalOpen.value = false;
  folderToDelete.value = null;
}

async function confirmRemoveFolder() {
  const folder = folderToDelete.value;
  if (!folder) return;

  deletingFolder.value = true;
  const { error } = await supabase
    .from("project_folders")
    .delete()
    .eq("id", folder.id);
  if (error) {
    errorMessage.value = error.message;
  } else {
    await $fetch("/api/notifications/project-material-delete", {
      method: "POST",
      body: { projectId, name: folder.name, type: "folder" },
    }).catch(() => null);
    folderDeleteModalOpen.value = false;
    folderToDelete.value = null;
    await loadWorkspace();
  }
  deletingFolder.value = false;
}

async function handleFileChange(event: Event) {
  if (!canContributeMaterials.value) return;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  errorMessage.value = "";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${projectId}/${currentFolder.value?.id || "root"}/${crypto.randomUUID()}-${safeName}`;
  const upload = await supabase.storage
    .from("project-files")
    .upload(path, file, { upsert: false });
  if (upload.error) errorMessage.value = upload.error.message;
  else {
    const { data: auth } = await supabase.auth.getUser();
    const result = await supabase.from("project_files").insert({
      project_id: projectId,
      folder_id: currentFolder.value?.id || null,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: auth.user?.id,
    });
    if (result.error) {
      errorMessage.value = result.error.message;
      await supabase.storage.from("project-files").remove([path]);
    } else {
      await $fetch("/api/notifications/project-document", {
        method: "POST",
        body: {
          projectId,
          fileName: file.name,
          folderName: currentFolder.value?.name || null,
        },
      }).catch(() => null);
      await loadWorkspace();
    }
  }
  input.value = "";
  uploading.value = false;
}

async function openFile(file: ProjectFile, download = false) {
  const result = download
    ? await supabase.storage
        .from("project-files")
        .createSignedUrl(file.storage_path, 600, { download: file.file_name })
    : await supabase.storage
        .from("project-files")
        .createSignedUrl(file.storage_path, 600);
  if (result.error) errorMessage.value = result.error.message;
  else window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
}

async function previewFile(file: ProjectFile) {
  if (!isPreviewableFile(file)) {
    await openFile(file, true);
    return;
  }

  loadingPreview.value = true;
  errorMessage.value = "";
  filePreviewItem.value = file;
  filePreviewModalOpen.value = true;
  const result = await supabase.storage
    .from("project-files")
    .createSignedUrl(file.storage_path, 600);
  loadingPreview.value = false;
  if (result.error) {
    errorMessage.value = result.error.message;
    filePreviewModalOpen.value = false;
    filePreviewItem.value = null;
  } else {
    filePreviewUrl.value = result.data.signedUrl;
  }
}

function closePreview() {
  filePreviewModalOpen.value = false;
  filePreviewUrl.value = "";
  filePreviewItem.value = null;
}

function askRemoveFile(file: ProjectFile) {
  fileToDelete.value = file;
  fileDeleteModalOpen.value = true;
}

function cancelRemoveFile() {
  if (deletingFile.value) return;
  fileDeleteModalOpen.value = false;
  fileToDelete.value = null;
}

async function confirmRemoveFile() {
  const file = fileToDelete.value;
  if (!file) return;

  deletingFile.value = true;
  const storage = await supabase.storage
    .from("project-files")
    .remove([file.storage_path]);
  if (storage.error) {
    errorMessage.value = storage.error.message;
    deletingFile.value = false;
    return;
  }

  const { error } = await supabase
    .from("project_files")
    .delete()
    .eq("id", file.id);
  if (error) {
    errorMessage.value = error.message;
  } else {
    await $fetch("/api/notifications/project-material-delete", {
      method: "POST",
      body: { projectId, name: file.file_name, type: "document" },
    }).catch(() => null);
    fileDeleteModalOpen.value = false;
    fileToDelete.value = null;
    await loadWorkspace();
  }
  deletingFile.value = false;
}

function formatSize(size: number | null) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
onMounted(loadWorkspace);
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-4">
      <UButton
        to="/projects"
        color="neutral"
        variant="outline"
        icon="i-lucide-arrow-left"
        label="Kthehu te Projektet"
        class="-ml-3"
      />

      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h2 class="text-2xl font-semibold text-highlighted">
            {{ project?.name || "Workspace" }}
          </h2>

          <p class="muted mt-3">
            {{
              project?.description ||
              "Menaxho përshkrimin, folderat dhe materialet e projektit."
            }}
          </p>
        </div>

        <div class="flex max-w-md flex-col items-end gap-3">
          <UButton
            v-if="isOwner"
            color="neutral"
            variant="outline"
            icon="i-lucide-user-plus"
            label="Assign users"
            @click="assignModalOpen = true"
          />

          <p class="text-sm font-medium text-highlighted">
            Anëtarët e projektit
          </p>

          <div
            v-if="visibleProjectMembers.length"
            class="flex flex-wrap justify-end gap-2"
          >
            <UBadge
              v-for="user in visibleProjectMembers"
              :key="user.id"
              color="primary"
              variant="subtle"
            >
              {{ user.full_name || user.email || "User" }}
              <span v-if="user.membership === 'owner'"> · Owner</span>
            </UBadge>
          </div>

          <p v-else class="text-right text-sm text-muted">
            Nuk ka anëtarë të assignuar.
          </p>
        </div>
      </div>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      title="Gabim"
      :description="errorMessage"
    />

    <UCard v-if="project">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-semibold">Përshkrimi i detajuar i projektit</h3>

          <div v-if="isOwner" class="flex gap-2">
            <UButton
              v-if="!editingDescription && isOwner"
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-pencil"
              label="Edito"
              @click="editingDescription = true"
            />

            <template v-else>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                label="Anulo"
                @click="
                  detailedDescription = project?.detailed_description || '';
                  editingDescription = false;
                "
              />
              <UButton
                size="sm"
                label="Ruaj"
                :loading="savingDescription"
                @click="saveDescription"
              />
            </template>
          </div>
        </div>
      </template>

      <div v-if="editingDescription && isOwner">
        <UTextarea
          v-model="detailedDescription"
          class="w-full"
          :rows="8"
          autofocus
          placeholder="Shkruaj përshkrimin e detajuar të projektit..."
        />
        <p class="mt-2 text-xs text-muted">
          Mund ta ndryshosh dhe ta ruash këtë përshkrim sa herë të dëshirosh.
        </p>
      </div>

      <p v-else class="whitespace-pre-wrap text-sm leading-6 text-muted">
        {{ project.detailed_description || "Nuk ka përshkrim të detajuar." }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-start gap-3">
            <UButton
              v-if="currentFolder"
              color="neutral"
              variant="outline"
              icon="i-lucide-arrow-left"
              aria-label="Kthehu"
              :title="backTooltip"
              @click="goBackFolder"
            />

            <div>
              <h3 class="font-semibold">
                {{ currentFolder?.name || "Materialet e projektit" }}
              </h3>
              <p class="text-sm text-muted">
                Folderat dhe dokumentet e ruajtura në këtë projekt.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="canContributeMaterials"
              color="neutral"
              variant="outline"
              icon="i-lucide-folder-plus"
              label="Shto folder"
              class="cursor-pointer"
              @click="modalOpen = true"
            />

            <label
              v-if="canContributeMaterials"
              class="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white"
            >
              <UIcon name="i-lucide-upload" />
              {{ uploading ? "Duke u ngarkuar..." : uploadLabel }}
              <input
                class="hidden"
                type="file"
                :disabled="uploading"
                @change="handleFileChange"
              />
            </label>
          </div>
        </div>
      </template>

      <div v-if="loading" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <USkeleton v-for="i in 3" :key="i" class="h-28" />
      </div>

      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="folder in visibleFolders"
          :key="folder.id"
          class="group cursor-pointer rounded-lg border border-default p-4 transition hover:border-primary"
          role="button"
          tabindex="0"
          @click="openFolder(folder)"
          @keydown.enter.prevent="openFolder(folder)"
          @keydown.space.prevent="openFolder(folder)"
        >
          <div class="flex w-full items-center gap-3 text-left">
            <UIcon name="i-lucide-folder" class="size-8 text-primary" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ folder.name }}
              </p>
              <p
                class="mt-2 inline-flex max-w-full rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-muted"
              >
                <span class="truncate">
                  Created by {{ displayPerson(folder.creator) }} |
                  {{ formatDate(folder.created_at) }}
                </span>
              </p>
            </div>
          </div>

          <UButton
            v-if="canDeleteFolder(folder)"
            class="mt-3"
            size="xs"
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            label="Delete folder"
            @click.stop="askRemoveFolder(folder)"
          />
        </div>

        <div
          v-for="file in visibleFiles"
          :key="file.id"
          class="rounded-lg border border-default p-4"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-lucide-file-text"
              class="size-8 shrink-0 text-primary"
            />

            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ file.file_name }}
              </p>
              <p class="text-xs text-muted">
                {{ file.mime_type || "Dokument" }} ·
                {{ formatSize(file.file_size) }}
              </p>
              <p
                class="mt-2 inline-flex max-w-full rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-muted"
              >
                <span class="truncate">
                  Upload by {{ displayPerson(file.uploader) }} |
                  {{ formatDate(file.created_at) }}
                </span>
              </p>
            </div>
          </div>

          <div class="mt-3 flex gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              label="Shiko"
              icon="i-lucide-eye"
              @click="previewFile(file)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-download"
              aria-label="Shkarko"
              @click="openFile(file, true)"
            />
            <UButton
              v-if="canDeleteFile(file)"
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              aria-label="Fshi"
              @click="askRemoveFile(file)"
            />
          </div>
        </div>

        <div
          v-if="!visibleFolders.length && !visibleFiles.length"
          class="col-span-full rounded-lg border border-dashed border-default p-10 text-center text-muted"
        >
          Ky folder është bosh. Shto një folder ose ngarko dokument.
        </div>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" title="Shto folder">
      <template #body>
        <form class="space-y-4" @submit.prevent="createFolder">
          <UFormField label="Emri i folderit" required>
            <UInput
              v-model="folderName"
              class="w-full"
              placeholder="p.sh. Dokumentet e klientit"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              type="button"
              @click="modalOpen = false"
            />
            <UButton type="submit" label="Shto folderin" />
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="assignModalOpen" title="Assign users">
      <template #body>
        <div class="space-y-4">
          <div v-if="assignableUsers.length" class="grid gap-2">
            <label
              v-for="user in assignableUsers"
              :key="user.id"
              class="flex cursor-pointer items-center gap-3 rounded-md border border-default p-3"
            >
              <input
                type="checkbox"
                class="size-4"
                :checked="selectedAssigneeIds.includes(user.id)"
                @change="handleAssigneeChange(user.id, $event)"
              />
              <span class="min-w-0">
                <span
                  class="block truncate text-sm font-medium text-highlighted"
                >
                  {{ user.full_name || user.email || "User" }}
                </span>
                <span class="block truncate text-xs text-muted">
                  {{ user.email || user.role }}
                </span>
              </span>
            </label>
          </div>

          <p v-else class="text-sm text-muted">Nuk ka user aktiv për assign.</p>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              :disabled="savingAssignments"
              @click="assignModalOpen = false"
            />
            <UButton
              icon="i-lucide-save"
              label="Ruaj assignments"
              :loading="savingAssignments"
              @click="saveAssignments"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="folderDeleteModalOpen" title="Fshi folderin">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            A je i sigurt qe deshiron ta fshish folderin
            <span class="font-medium text-highlighted">
              {{ folderToDelete?.name }}
            </span>
            dhe materialet e tij?
          </p>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              :disabled="deletingFolder"
              @click="cancelRemoveFolder"
            />
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              label="Fshi folderin"
              :loading="deletingFolder"
              @click="confirmRemoveFolder"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="fileDeleteModalOpen" title="Fshije">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            A je i sigurt qe deshiron ta fshin
            <span class="font-medium text-highlighted">
              {{ fileToDelete?.file_name }}
            </span>
            ?
          </p>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Anulo"
              :disabled="deletingFile"
              @click="cancelRemoveFile"
            />
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              label="Fshije"
              :loading="deletingFile"
              @click="confirmRemoveFile"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="filePreviewModalOpen"
      :title="filePreviewItem?.file_name || 'Preview'"
      :ui="{ content: 'max-w-5xl' }"
      @update:open="
        (open) => {
          if (!open) closePreview();
        }
      "
    >
      <template #body>
        <div class="space-y-4">
          <div
            v-if="loadingPreview"
            class="flex min-h-[24rem] items-center justify-center"
          >
            <USkeleton class="h-96 w-full" />
          </div>

          <img
            v-else-if="isImageFile(filePreviewItem)"
            :src="filePreviewUrl"
            :alt="filePreviewItem?.file_name || 'Preview'"
            class="max-h-[75vh] w-full rounded-md object-contain"
          />

          <iframe
            v-else-if="isPdfFile(filePreviewItem)"
            :src="filePreviewUrl"
            class="h-[75vh] w-full rounded-md border border-default"
            title="Document preview"
          />

          <div v-else class="text-sm text-muted">
            Ky dokument nuk mund të shfaqet si preview.
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Mbyll"
              @click="closePreview"
            />
            <UButton
              color="primary"
              variant="outline"
              icon="i-lucide-download"
              label="Shkarko"
              :disabled="!filePreviewItem"
              @click="filePreviewItem && openFile(filePreviewItem, true)"
            />
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
