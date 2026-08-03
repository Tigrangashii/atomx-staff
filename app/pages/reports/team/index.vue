<script setup lang="ts">
type Role = "owner" | "manager" | "user";
type ProjectStatus = "completed" | "in_progress" | "waiting" | "blocked";
type Employee = { id: string; full_name: string; role: Role };
type Project = { id: string; name: string };
type DailyReport = {
  id: string;
  employee_id: string;
  report_date: string;
  project_name: string;
  content: string;
  completed_tasks: string;
  problems: string | null;
  hours_worked: number | null;
  project_status: ProjectStatus;
  tomorrow_plan: string;
  employee?: { full_name: string; email?: string } | null;
};

definePageMeta({ middleware: ["auth", "permissions"] });

const supabase = useSupabaseClient();
const today = new Date().toISOString().slice(0, 10);
const filters = reactive({
  startDate: today,
  endDate: today,
  employeeId: "all",
  project: "all",
  status: "all" as ProjectStatus | "all",
});
const reports = ref<DailyReport[]>([]);
const employees = ref<Employee[]>([]);
const projects = ref<Project[]>([]);
const loading = ref(true);
const filtering = ref(false);
const errorMessage = ref("");
const selectedReport = ref<DailyReport | null>(null);
const detailModalOpen = ref(false);
const summaryOpen = ref(true);
const statuses = [
  { label: "Completed", value: "completed" },
  { label: "In Progress", value: "in_progress" },
  { label: "Waiting", value: "waiting" },
  { label: "Blocked", value: "blocked" },
];

const employeeItems = computed(() => [
  { label: "Të gjithë përdoruesit", value: "all" },
  ...employees.value.map((employee) => ({
    label: employee.full_name,
    value: employee.id,
  })),
]);
const projectItems = computed(() => [
  { label: "Të gjitha projektet", value: "all" },
  ...projects.value.map((project) => ({
    label: project.name,
    value: project.name,
  })),
]);
const statusItems = computed(() => [
  { label: "Të gjitha statuset", value: "all" },
  ...statuses,
]);

function statusLabel(status: ProjectStatus) {
  return statuses.find((item) => item.value === status)?.label || status;
}

function statusColor(status: ProjectStatus) {
  if (status === "completed") return "success";
  if (status === "blocked") return "error";
  if (status === "waiting") return "warning";
  return "info";
}

async function loadEmployees() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name");
  if (error) throw error;
  employees.value = (data || []) as Employee[];
}

async function loadReports() {
  filtering.value = true;
  errorMessage.value = "";
  try {
    let query = supabase
      .from("daily_reports")
      .select(
        "id, employee_id, report_date, project_name, content, completed_tasks, problems, hours_worked, project_status, tomorrow_plan, employee:profiles!daily_reports_employee_id_fkey(full_name, email)",
      )
      .gte("report_date", filters.startDate)
      .lte("report_date", filters.endDate)
      .order("report_date", { ascending: false });

    if (filters.employeeId !== "all")
      query = query.eq("employee_id", filters.employeeId);
    if (filters.project !== "all")
      query = query.eq("project_name", filters.project);
    if (filters.status !== "all")
      query = query.eq("project_status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    reports.value = (data || []) as DailyReport[];
  } catch (error: any) {
    errorMessage.value = error?.message || "Raportet nuk u ngarkuan.";
  } finally {
    filtering.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    await loadEmployees();
    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    if (projectError && projectError.code !== "42P01") throw projectError;
    projects.value = (projectData || []) as Project[];
    await loadReports();
  } catch (error: any) {
    errorMessage.value = error?.message || "Të dhënat nuk u ngarkuan.";
  } finally {
    loading.value = false;
  }
}

const totalHours = computed(() =>
  reports.value.reduce(
    (sum, report) => sum + Number(report.hours_worked || 0),
    0,
  ),
);
const problemCount = computed(
  () => reports.value.filter((report) => report.problems?.trim()).length,
);
const activeEmployeeCount = computed(
  () => new Set(reports.value.map((report) => report.employee_id)).size,
);
const summaryByEmployee = computed(() => {
  const grouped = new Map<
    string,
    { name: string; reports: number; hours: number; problems: number }
  >();
  for (const report of reports.value) {
    const key = report.employee_id;
    const existing = grouped.get(key) || {
      name: report.employee?.full_name || "—",
      reports: 0,
      hours: 0,
      problems: 0,
    };
    existing.reports++;
    existing.hours += Number(report.hours_worked || 0);
    if (report.problems?.trim()) existing.problems++;
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((a, b) => b.hours - a.hours);
});

function clearFilters() {
  filters.startDate = today;
  filters.endDate = today;
  filters.employeeId = "all";
  filters.project = "all";
  filters.status = "all";
  loadReports();
}

async function exportExcel() {
  const XLSX = await import("xlsx");
  const rows = reports.value.map((report) => ({
    Punëtori: report.employee?.full_name || "—",
    Data: report.report_date,
    Email: report.employee?.email || "—",
    Projekti: report.project_name,
    "Çka punoi sot": report.content || "—",
    "Orë pune": report.hours_worked ?? 0,
    Statusi: statusLabel(report.project_status),
    "Detyrat e përfunduara": report.completed_tasks,
    Problemet: report.problems || "—",
    "Plani për nesër": report.tomorrow_plan,
  }));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Raportet");
  XLSX.writeFile(
    workbook,
    `raportet-${filters.startDate}-${filters.endDate}.xlsx`,
  );
}

async function exportPdfSummary() {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text("Raportet e stafit", 14, 15);
  doc.setFontSize(9);
  doc.text(`${filters.startDate} — ${filters.endDate}`, 14, 22);
  autoTable(doc, {
    startY: 28,
    head: [["Punëtori", "Data", "Projekti", "Orë", "Statusi", "Probleme"]],
    body: reports.value.map((report) => [
      report.employee?.full_name || "—",
      report.report_date,
      report.project_name,
      String(report.hours_worked ?? 0),
      statusLabel(report.project_status),
      report.problems || "—",
    ]),
  });
  doc.save(`raportet-${filters.startDate}-${filters.endDate}.pdf`);
}

async function exportPdf() {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "portrait" });

  reports.value.forEach((report, index) => {
    if (index > 0) doc.addPage();
    doc.setFontSize(16);
    doc.text("Raporti ditor", 14, 16);
    doc.setFontSize(9);
    doc.text(
      `Periudha e filtruar: ${filters.startDate} — ${filters.endDate}`,
      14,
      23,
    );
    autoTable(doc, {
      startY: 30,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 132 } },
      head: [["Fusha", "Përgjigjja"]],
      body: [
        ["Emri i punëtorit", report.employee?.full_name || "—"],
        ["Email", report.employee?.email || "—"],
        ["Data", report.report_date],
        ["Projekti", report.project_name],
        ["Çka punoi sot?", report.content || "—"],
        ["Detyrat e përfunduara", report.completed_tasks || "—"],
        ["Problemet", report.problems || "Nuk ka shënuar problem."],
        ["Orë pune", String(report.hours_worked ?? 0)],
        ["Statusi i projektit", statusLabel(report.project_status)],
        ["Plani për nesër", report.tomorrow_plan || "—"],
      ],
    });
  });

  doc.save(`raportet-${filters.startDate}-${filters.endDate}.pdf`);
}

watch(
  () => [
    filters.startDate,
    filters.endDate,
    filters.employeeId,
    filters.project,
    filters.status,
  ],
  () => loadReports(),
);

function openReport(report: DailyReport) {
  selectedReport.value = report;
  detailModalOpen.value = true;
}

onMounted(load);
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          Raportet e stafit
        </h2>
        <p class="muted">
          Shiko raportet e dorëzuara nga përdoruesit sipas datës dhe personit.
        </p>
      </div>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="subtle"
      title="Gabim"
      :description="errorMessage"
    />

    <UCard>
      <template #header
        ><h3 class="font-semibold text-highlighted">
          Filtro raportet
        </h3></template
      >
      <div class="grid gap-4 md:grid-cols-5 md:items-end">
        <UFormField label="Nga data"
          ><UInput v-model="filters.startDate" type="date" class="w-full"
        /></UFormField>
        <UFormField label="Deri më datë"
          ><UInput v-model="filters.endDate" type="date" class="w-full"
        /></UFormField>
        <UFormField label="Përdoruesi"
          ><USelect
            v-model="filters.employeeId"
            :items="employeeItems"
            class="w-full"
        /></UFormField>
        <UFormField label="Projekti"
          ><USelect
            v-model="filters.project"
            :items="projectItems"
            class="w-full"
        /></UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton
            size="md"
            label="Pastro"
            color="neutral"
            variant="soft"
            @click="clearFilters"
          /><UButton
            size="md"
            label="Filtro"
            icon="i-lucide-filter"
            :loading="filtering"
            @click="loadReports"
          />
        </div>
      </div>
    </UCard>

    <div class="flex flex-wrap justify-end gap-2">
      <UButton
        size="md"
        label="Eksporto Excel"
        icon="i-lucide-file-spreadsheet"
        color="success"
        variant="soft"
        :disabled="!reports.length"
        @click="exportExcel"
      /><UButton
        size="md"
        label="Eksporto PDF"
        icon="i-lucide-file-down"
        color="error"
        variant="soft"
        :disabled="!reports.length"
        @click="exportPdf"
      />
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold text-highlighted">Raportet e dorëzuara</h3>
            <p class="mt-1 text-sm text-muted">
              {{ reports.length }} raport(e) u gjetën.
            </p>
          </div>
          <UIcon name="i-lucide-clipboard-check" class="size-5 text-primary" />
        </div>
      </template>
      <USkeleton v-if="loading" class="h-40 w-full" />
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[850px] text-left text-sm">
          <thead class="border-b border-default text-xs uppercase text-muted">
            <tr>
              <th class="px-4 py-3">Përdoruesi</th>
              <th class="px-4 py-3">Data</th>
              <th class="px-4 py-3">Projekti</th>
              <th class="px-4 py-3">Orët</th>
              <th class="px-4 py-3">Statusi</th>
              <th class="px-4 py-3">Veprimi</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="report in reports"
              :key="report.id"
              class="border-b border-default last:border-0"
            >
              <td class="px-4 py-4 font-medium text-highlighted">
                {{ report.employee?.full_name || "—" }}
              </td>
              <td class="px-4 py-4 text-muted">{{ report.report_date }}</td>
              <td class="px-4 py-4 text-muted">{{ report.project_name }}</td>
              <td class="px-4 py-4 text-muted">
                {{ report.hours_worked ?? "—" }}
              </td>
              <td class="px-4 py-4">
                <UBadge
                  :color="statusColor(report.project_status)"
                  variant="subtle"
                  >{{ statusLabel(report.project_status) }}</UBadge
                >
              </td>
              <td class="px-4 py-4">
                <UButton
                  label="Shiko"
                  icon="i-lucide-eye"
                  size="sm"
                  variant="soft"
                  @click="openReport(report)"
                />
              </td>
            </tr>
            <tr v-if="!reports.length">
              <td colspan="6" class="px-4 py-10 text-center text-muted">
                Nuk ka raporte për filtrat e zgjedhur.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header
        ><button
          class="flex w-full items-center justify-between text-left"
          @click="summaryOpen = !summaryOpen"
        >
          <span
            ><span class="block font-semibold text-highlighted"
              >Përmbledhje sipas punëtorit</span
            ><span class="mt-1 block text-sm text-muted"
              >Orët, raportet dhe problemet në periudhën e zgjedhur.</span
            ></span
          ><UIcon
            :name="
              summaryOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'
            "
            class="size-5 text-muted"
          /></button
      ></template>
      <div v-if="summaryOpen" class="overflow-x-auto">
        <table class="w-full min-w-[560px] text-left text-sm">
          <thead class="border-b border-default text-xs uppercase text-muted">
            <tr>
              <th class="px-4 py-3">Punëtori</th>
              <th class="px-4 py-3">Raporte</th>
              <th class="px-4 py-3">Orë totale</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in summaryByEmployee"
              :key="item.name"
              class="border-b border-default last:border-0"
            >
              <td class="px-4 py-3 font-medium text-highlighted">
                {{ item.name }}
              </td>
              <td class="px-4 py-3 text-muted">{{ item.reports }}</td>
              <td class="px-4 py-3 text-muted">{{ item.hours.toFixed(2) }}</td>
            </tr>
            <tr v-if="!summaryByEmployee.length">
              <td colspan="3" class="px-4 py-8 text-center text-muted">
                Nuk ka të dhëna për përmbledhje.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal
      v-model:open="detailModalOpen"
      title="Detajet e raportit"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div v-if="selectedReport" class="space-y-5">
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <p class="text-xs uppercase text-muted">Përdoruesi</p>
              <p class="font-medium text-highlighted">
                {{ selectedReport.employee?.full_name || "—" }}
              </p>
            </div>
            <div>
              <p class="text-xs uppercase text-muted">Data</p>
              <p class="font-medium text-highlighted">
                {{ selectedReport.report_date }}
              </p>
            </div>
            <div>
              <p class="text-xs uppercase text-muted">Projekti</p>
              <p class="font-medium text-highlighted">
                {{ selectedReport.project_name }}
              </p>
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <p class="text-sm font-medium text-highlighted">Çka punoi sot?</p>
              <p class="mt-1 whitespace-pre-wrap text-sm text-muted">
                {{ selectedReport.content || "—" }}
              </p>
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">
                Detyrat e përfunduara
              </p>
              <p class="mt-1 whitespace-pre-wrap text-sm text-muted">
                {{ selectedReport.completed_tasks || "—" }}
              </p>
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">Problemet</p>
              <p class="mt-1 whitespace-pre-wrap text-sm text-muted">
                {{ selectedReport.problems || "Nuk ka shënuar problem." }}
              </p>
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">
                Plani për nesër
              </p>
              <p class="mt-1 whitespace-pre-wrap text-sm text-muted">
                {{ selectedReport.tomorrow_plan || "—" }}
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-3 border-t border-default pt-4">
            <UBadge color="neutral" variant="subtle"
              >Orë: {{ selectedReport.hours_worked ?? "—" }}</UBadge
            ><UBadge
              :color="statusColor(selectedReport.project_status)"
              variant="subtle"
              >{{ statusLabel(selectedReport.project_status) }}</UBadge
            >
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
