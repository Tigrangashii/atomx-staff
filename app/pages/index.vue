<script setup lang="ts">
type Role = "owner" | "manager" | "user";
type Entry = {
  id: string;
  check_in: string | null;
  employee?: { full_name: string } | null;
};
type PendingLeave = {
  id: string;
  start_date: string;
  end_date: string;
  employee?: { full_name: string } | null;
};

definePageMeta({ middleware: ["auth"] });

const supabase = useSupabaseClient();
const today = new Date().toISOString().slice(0, 10);
const loading = ref(true);
const errorMessage = ref("");
const fullName = ref("");
const role = ref<Role>("user");
const hasCheckedIn = ref(false);
const todayEntries = ref<Entry[]>([]);
const pendingLeaves = ref<PendingLeave[]>([]);
const activeStaffCount = ref(0);
const pendingLeaveCount = ref(0);
const todayAttendanceCount = ref(0);
const todayReportsCount = ref(0);
const myPendingLeaveCount = ref(0);
const userEntryTime = ref("—");
const currentDateTime = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | undefined;
const isReviewer = computed(
  () => role.value === "owner" || role.value === "manager",
);
const canSeeDashboard = computed(() => isReviewer.value || hasCheckedIn.value);
const currentDateLabel = computed(() =>
  currentDateTime.value.toLocaleDateString("sq-AL"),
);
const currentTimeLabel = computed(() =>
  currentDateTime.value.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }),
);
const stats = computed(() =>
  isReviewer.value
    ? [
        {
          label: "Punëtorë aktivë",
          amount: activeStaffCount.value,
          detail: "Në ekip",
        },
        {
          label: "Pushime në pritje",
          amount: pendingLeaveCount.value,
          detail: "Për shqyrtim",
        },
        {
          label: "Hyrje sot",
          amount: todayAttendanceCount.value,
          detail: "Regjistrime",
        },
        {
          label: "Raporte të reja",
          amount: todayReportsCount.value,
          detail: "Të dorëzuara sot",
        },
      ]
    : [
        {
          label: "Hyrja sot",
          amount: userEntryTime.value,
          detail: "Ora e regjistrimit",
        },
        {
          label: "Kërkesa për pushim",
          amount: myPendingLeaveCount.value,
          detail: "Në pritje",
        },
      ],
);

async function countRows(
  table: "profiles" | "leave_requests" | "attendance" | "daily_reports",
  filters: Array<[string, string, string]> = [],
) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  for (const [column, operator, value] of filters) {
    if (operator === "eq") query = query.eq(column, value);
    if (operator === "gte") query = query.gte(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function loadDashboard() {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser?.id) return;

  loading.value = true;
  errorMessage.value = "";
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError) throw profileError;
    fullName.value =
      profile?.full_name?.trim() ||
      authUser.user_metadata?.full_name ||
      authUser.email?.split("@")[0] ||
      "përdorues";
    role.value = (profile?.role || "user") as Role;

    const { data: ownAttendance, error: attendanceError } = await supabase
      .from("attendance")
      .select("check_in")
      .eq("employee_id", authUser.id)
      .eq("work_date", today)
      .maybeSingle();
    if (attendanceError) throw attendanceError;
    hasCheckedIn.value = Boolean(ownAttendance?.check_in);

    if (isReviewer.value) {
      const [
        activeStaff,
        pendingLeaveTotal,
        todayAttendance,
        submittedReports,
      ] = await Promise.all([
        countRows("profiles", [["is_active", "eq", "true"]]),
        countRows("leave_requests", [["status", "eq", "pending"]]),
        countRows("attendance", [
          ["work_date", "eq", today],
          ["check_in", "gte", "1900-01-01"],
        ]),
        countRows("daily_reports", [["report_date", "eq", today]]),
      ]);
      activeStaffCount.value = activeStaff;
      pendingLeaveCount.value = pendingLeaveTotal;
      todayAttendanceCount.value = todayAttendance;
      todayReportsCount.value = submittedReports;
      const [{ data: entries }, { data: leaves }] = await Promise.all([
        supabase
          .from("attendance")
          .select(
            "id, check_in, employee:profiles!attendance_employee_id_fkey(full_name)",
          )
          .eq("work_date", today)
          .not("check_in", "is", null)
          .order("check_in", { ascending: false })
          .limit(8),
        supabase
          .from("leave_requests")
          .select(
            "id, start_date, end_date, employee:profiles!leave_requests_employee_id_fkey(full_name)",
          )
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      todayEntries.value = (entries || []) as Entry[];
      pendingLeaves.value = (leaves || []) as PendingLeave[];
    } else if (hasCheckedIn.value) {
      const [myPendingLeaves, todayReports] = await Promise.all([
        countRows("leave_requests", [
          ["employee_id", "eq", authUser.id],
          ["status", "eq", "pending"],
        ]),
        countRows("daily_reports", [
          ["employee_id", "eq", authUser.id],
          ["report_date", "eq", today],
        ]),
      ]);
      userEntryTime.value = ownAttendance?.check_in
        ? new Date(ownAttendance.check_in).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "—";
      myPendingLeaveCount.value = myPendingLeaves;
    }
  } catch (error: any) {
    console.error("[Dashboard]", error);
    errorMessage.value = error?.message || "Dashboard-i nuk u ngarkua.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  clockTimer = setInterval(() => {
    currentDateTime.value = new Date();
  }, 1000);
  loadDashboard();
});
onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <section class="dashboard-page">
    <div v-if="errorMessage" class="mb-5">
      <UAlert
        color="error"
        variant="subtle"
        title="Gabim"
        :description="errorMessage"
      />
    </div>

    <div class="page-intro">
      <div class="w-full text-center sm:w-auto sm:text-left">
        <h2 class="text-2xl font-semibold text-highlighted">Dashboard</h2>
        <p class="muted">
          {{
            canSeeDashboard
              ? "Menaxho ekipin, pushimet dhe aktivitetin e përditshëm."
              : "Regjistro hyrjen në punë për të parë panelin tënd."
          }}
        </p>
      </div>
      <span
        class="date-pill flex flex-col items-center gap-0.5 self-center text-center sm:self-auto sm:items-end sm:text-right"
        ><span>{{ currentDateLabel }}</span
        ><span class="text-sm font-medium text-muted">{{
          currentTimeLabel
        }}</span></span
      >
    </div>

    <div v-if="loading" class="stats-grid">
      <article v-for="i in 4" :key="i" class="stat-card">
        <USkeleton class="h-24 w-full" />
      </article>
    </div>
    <template v-else-if="canSeeDashboard">
      <div class="stats-grid">
        <article
          v-for="(stat, index) in stats"
          :key="stat.label"
          class="stat-card group"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <span class="stat-label">{{ stat.label }}</span
            ><span class="stat-icon"
              ><UIcon
                :name="
                  [
                    'i-lucide-users-round',
                    'i-lucide-calendar-clock',
                    'i-lucide-clock-3',
                    'i-lucide-file-check-2',
                  ][index]
                "
                class="size-5"
            /></span>
          </div>
          <strong class="stat-value">{{ stat.amount }}</strong
          ><span class="stat-detail">{{ stat.detail }}</span>
        </article>
      </div>
      <UCard v-if="isReviewer" class="mt-6"
        ><template #header
          ><div>
            <h3 class="font-semibold text-highlighted">Aktiviteti i ekipit</h3>
            <p class="mt-1 text-sm text-muted">
              Hyrjet e sotme dhe kërkesat për pushim në pritje.
            </p>
          </div></template
        >
        <div class="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 class="mb-3 text-sm font-semibold text-highlighted">
              Hyrjet sot
            </h4>
            <div
              class="divide-y divide-default rounded-lg border border-default"
            >
              <div
                v-for="entry in todayEntries"
                :key="entry.id"
                class="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span class="font-medium text-highlighted">{{
                  entry.employee?.full_name || "Pa emër"
                }}</span
                ><span class="text-muted">{{
                  entry.check_in
                    ? new Date(entry.check_in).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : "—"
                }}</span>
              </div>
              <p
                v-if="!todayEntries.length"
                class="px-4 py-6 text-center text-sm text-muted"
              >
                Nuk ka hyrje të regjistruara sot.
              </p>
            </div>
          </div>
          <div>
            <h4 class="mb-3 text-sm font-semibold text-highlighted">
              Pushime në pritje
            </h4>
            <div
              class="divide-y divide-default rounded-lg border border-default"
            >
              <div
                v-for="leave in pendingLeaves"
                :key="leave.id"
                class="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span class="font-medium text-highlighted">{{
                  leave.employee?.full_name || "Pa emër"
                }}</span
                ><span class="text-right text-muted"
                  >{{ leave.start_date }} – {{ leave.end_date }}</span
                >
              </div>
              <p
                v-if="!pendingLeaves.length"
                class="px-4 py-6 text-center text-sm text-muted"
              >
                Nuk ka kërkesa në pritje.
              </p>
            </div>
          </div>
        </div></UCard
      >
      <UCard v-else
        ><div class="flex flex-col items-center gap-3 py-8 text-center">
          <UIcon name="i-lucide-check-circle-2" class="size-9 text-success" />
          <h3 class="text-lg font-semibold text-highlighted">
            Hyrja u regjistrua
          </h3>
          <p class="text-sm text-muted">
            Ora e hyrjes dhe kërkesat për pushim paraqiten në kartelat më lart.
          </p>
        </div></UCard
      >
    </template>
    <UCard v-else class="mt-6"
      ><div class="flex flex-col items-center gap-4 py-10 text-center">
        <UIcon name="i-lucide-clock-3" class="size-10 text-primary" />
        <h3 class="text-lg font-semibold text-highlighted">
          Regjistro hyrjen në punë
        </h3>
        <p class="max-w-md text-sm text-muted">
          Dashboard-i dhe të dhënat personale do të shfaqen pasi të regjistrosh
          hyrjen e sotme.
        </p>
        <UButton
          to="/attendance"
          label="Shko te Hyrje / Dalje"
          icon="i-lucide-arrow-right"
        /></div
    ></UCard>
  </section>
</template>
