<script setup lang="ts">
type NotificationItem = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const supabase = useSupabaseClient();
const profileName = ref("Përdorues");
const profileEmail = ref("");
const profileRole = ref("");
const notifications = ref<NotificationItem[]>([]);
const notificationsOpen = ref(false);
const loading = ref(false);
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const unreadCount = computed(
  () => notifications.value.filter((item) => !item.is_read).length,
);

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadHeaderData() {
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user?.id) return;

  const [{ data: profile }, { data: notificationData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id, title, message, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  profileName.value =
    profile?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Përdorues";
  profileEmail.value = profile?.email || user.email || "";
  profileRole.value =
    profile?.role === "owner"
      ? "Pronar"
      : profile?.role === "manager"
        ? "Menaxher"
        : "Përdorues";
  notifications.value = (notificationData || []) as NotificationItem[];
}

async function logout() {
  await supabase.auth.signOut();
  await navigateTo("/login");
}

async function markNotificationRead(item: NotificationItem) {
  if (item.is_read) return;
  item.is_read = true;
  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", item.id);
}

async function markAllRead() {
  const unread = notifications.value.filter((item) => !item.is_read);
  if (!unread.length) return;
  unread.forEach((item) => {
    item.is_read = true;
  });
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id)
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", authData.user.id);
}

onMounted(async () => {
  await loadHeaderData();
  refreshTimer = setInterval(loadHeaderData, 30000);
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <header
    class="relative z-40 flex min-h-16 items-center justify-between gap-2 border-b border-default bg-default/95 pl-16 pr-3 backdrop-blur sm:gap-3 sm:px-6"
  >
    <div class="min-w-0">
      <p class="truncate text-xs font-semibold text-highlighted sm:text-lg">
        Mirë se erdhe, {{ profileName }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-0.5 sm:gap-2">
      <UPopover
        v-model:open="notificationsOpen"
        :ui="{ content: 'w-[min(24rem,calc(100vw-2rem))] p-0' }"
      >
        <div class="relative inline-flex">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-bell"
            aria-label="Njoftimet"
            class="cursor-pointer"
          />
          <UBadge
            v-if="unreadCount"
            color="error"
            size="xs"
            class="pointer-events-none absolute -right-1 -top-1 z-10 flex min-w-5 justify-center rounded-full px-1.5 text-[10px] font-bold leading-4"
            >{{ unreadCount > 99 ? "99+" : unreadCount }}</UBadge
          >
        </div>

        <template #content>
          <div
            class="flex items-center justify-between border-b border-default px-4 py-3"
          >
            <div>
              <p class="font-semibold text-highlighted">Njoftimet</p>
              <p class="text-xs text-muted">
                Aktivitetet e fundit në AtomX Staff
              </p>
            </div>
            <UButton
              v-if="unreadCount"
              size="xs"
              color="primary"
              variant="link"
              label="Lexoji të gjitha"
              @click="markAllRead"
            />
          </div>
          <div v-if="loading" class="p-5 text-center text-sm text-muted">
            Duke u ngarkuar...
          </div>
          <div
            v-else-if="!notifications.length"
            class="p-6 text-center text-sm text-muted"
          >
            Nuk ka njoftime të reja.
          </div>
          <div v-else class="max-h-96 overflow-y-auto">
            <button
              v-for="item in notifications"
              :key="item.id"
              type="button"
              class="flex w-full gap-3 border-b border-default px-4 py-3 text-left transition-colors hover:bg-elevated"
              :class="{ 'bg-primary/5': !item.is_read }"
              @click="markNotificationRead(item)"
            >
              <span
                class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                ><UIcon name="i-lucide-bell-ring" class="size-4"
              /></span>
              <span class="min-w-0 flex-1">
                <span class="flex items-start justify-between gap-2"
                  ><strong class="text-sm text-highlighted">{{
                    item.title
                  }}</strong
                  ><span
                    v-if="!item.is_read"
                    class="mt-1 size-2 shrink-0 rounded-full bg-primary"
                /></span>
                <span class="mt-1 block text-xs leading-5 text-muted">{{
                  item.message
                }}</span>
                <span class="mt-1 block text-[11px] text-dimmed">{{
                  formatNotificationDate(item.created_at)
                }}</span>
              </span>
            </button>
          </div>
        </template>
      </UPopover>
      <UPopover :ui="{ content: 'w-64 p-0' }">
        <UButton
          color="neutral"
          variant="ghost"
          class="rounded-full p-0 cursor-pointer"
          aria-label="Profili"
        >
          <span
            class="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
            >{{ profileName.charAt(0).toUpperCase() }}</span
          >
        </UButton>
        <template #content>
          <div class="border-b border-default px-4 py-3">
            <p class="truncate font-semibold text-highlighted">
              {{ profileName }}
            </p>
            <p class="truncate text-xs text-muted">{{ profileEmail }}</p>
          </div>
          <div class="p-2">
            <UButton
              color="error"
              variant="solid"
              icon="i-lucide-log-out"
              label="Çkyçu"
              block
              class="justify-start cursor-pointer"
              @click="logout"
            />
          </div>
        </template>
      </UPopover>
    </div>
  </header>
</template>
