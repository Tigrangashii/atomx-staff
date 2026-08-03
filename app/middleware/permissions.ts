export default defineNuxtRouteMiddleware(async (to) => {
  const supabase = useSupabaseClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user?.id) return navigateTo("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  const role = profile?.role || "user";
  const managerOnlyRoutes = ["/staff", "/reports/team", "/leaves/calendar"];

  if (
    managerOnlyRoutes.some(
      (route) => to.path === route || to.path.startsWith(`${route}/`),
    ) &&
    !["owner", "manager"].includes(role)
  ) {
    return navigateTo("/");
  }

  if (to.path === "/projects" || to.path.startsWith("/projects/")) {
    if (role === "owner") return;

    let query = supabase
      .from("project_assignments")
      .select("project_id", { count: "exact", head: true })
      .eq("user_id", authData.user.id);

    if (to.path.startsWith("/projects/") && to.params.id) {
      query = query.eq("project_id", String(to.params.id));
    }

    const { count } = await query;

    if (!count) return navigateTo("/");
  }
});
