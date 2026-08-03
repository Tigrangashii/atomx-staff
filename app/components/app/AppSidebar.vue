<script setup lang="ts">
const supabase = useSupabaseClient();
const role = ref<"owner" | "manager" | "user">("user");
const hasAssignedProjects = ref(false);
const settingsOpen = ref(false);

const navigation = computed(() => [
  { label: "Dashboard", icon: "i-lucide-layout-dashboard", to: "/" },
  ...(role.value === "owner" || role.value === "manager"
    ? [{ label: "Stafi", icon: "i-lucide-users", to: "/staff" }]
    : []),
  { label: "Pushimet", icon: "i-lucide-calendar-days", to: "/leaves" },
  { label: "Raport ditor", icon: "i-lucide-clipboard-list", to: "/reports" },
  ...(role.value === "owner" || role.value === "manager"
    ? [
        {
          label: "Raportet e stafit",
          icon: "i-lucide-clipboard-check",
          to: "/reports/team",
        },
      ]
    : []),
  ...(role.value === "owner" || hasAssignedProjects.value
    ? [{ label: "Projektet", icon: "i-lucide-folder-kanban", to: "/projects" }]
    : []),
  { label: "Hyrje / Dalje", icon: "i-lucide-clock-3", to: "/attendance" },
]);

async function loadRole() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user?.id) return;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  role.value = data?.role || "user";

  if (role.value !== "owner") {
    const { count } = await supabase
      .from("project_assignments")
      .select("project_id", { count: "exact", head: true })
      .eq("user_id", authData.user.id);
    hasAssignedProjects.value = Boolean(count);
  }
}

async function logout() {
  await supabase.auth.signOut();
  await navigateTo("/login");
}

onMounted(loadRole);
</script>

<template>
  <UDashboardSidebar
    collapsible
    :ui="{
      root: 'bg-default border-r border-default',
      header: 'p-4',
      body: 'p-3',
      footer: 'p-3 border-t border-default',
    }"
  >
    <template #header="{ collapsed }">
      <div class="flex items-center gap-3 overflow-hidden">
        <img
          class="size-10 shrink-0 object-contain"
          src="/images/atomx-logo.png"
          alt="AtomX Solutions"
        />
        <div v-if="!collapsed" class="min-w-0">
          <strong class="block truncate text-sm text-highlighted"
            >AtomX Staff</strong
          >
          <span class="block truncate text-xs text-muted"
            >AtomX Solutions SH.P.K</span
          >
        </div>
      </div>
    </template>

    <template #default="{ collapsed }">
      <nav class="grid gap-1" aria-label="Navigimi kryesor">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
          active-class="bg-primary/10 font-semibold text-primary"
          :data-active="$route.path === item.to"
        >
          <UIcon :name="item.icon" class="size-5 shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </NuxtLink>

        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted"
          @click="settingsOpen = !settingsOpen"
        >
          <UIcon name="i-lucide-settings" class="size-5 shrink-0" />
          <span v-if="!collapsed" class="flex-1 text-left">Settings</span>
          <UIcon
            v-if="!collapsed"
            :name="
              settingsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
            "
            class="size-4"
          />
        </button>

        <div
          v-if="settingsOpen && !collapsed"
          class="ml-4 grid gap-1 border-l border-default pl-3"
        >
          <NuxtLink
            to="/settings?tab=profile"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted"
            :class="{
              'bg-primary/10 font-semibold text-primary':
                $route.query.tab !== 'company',
            }"
          >
            <UIcon name="i-lucide-user-round" class="size-5 shrink-0" />
            <span>Profile</span>
          </NuxtLink>
          <NuxtLink
            to="/settings?tab=company"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-highlighted"
            :class="{
              'bg-primary/10 font-semibold text-primary':
                $route.query.tab === 'company',
            }"
          >
            <UIcon name="i-lucide-building-2" class="size-5 shrink-0" />
            <span>Company</span>
          </NuxtLink>
        </div>
      </nav>
    </template>

    <template #footer="{ collapsed }">
      <UButton
        color="error"
        variant="solid"
        :icon="collapsed ? 'i-lucide-log-out' : undefined"
        :block="!collapsed"
        :square="collapsed"
        class="justify-start"
        @click="logout"
      >
        <template v-if="!collapsed">Çkyçu</template>
      </UButton>
    </template>
  </UDashboardSidebar>
</template>
