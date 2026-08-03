import { createClient } from "@supabase/supabase-js";
import { serverSupabaseUser } from "#supabase/server";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "owner" | "manager" | "user";
  is_active: boolean;
};

export default defineEventHandler(async (event) => {
  const currentUser = await serverSupabaseUser(event);
  if (!currentUser?.sub)
    throw createError({
      statusCode: 401,
      statusMessage: "Sesioni ka skaduar.",
    });

  const projectId = String(getRouterParam(event, "id") || "");
  if (!projectId)
    throw createError({
      statusCode: 400,
      statusMessage: "Projekti mungon.",
    });

  const config = useRuntimeConfig(event);
  const admin = createClient(
    String(config.public.supabase.url),
    String(config.supabaseServiceRoleKey),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const [{ data: actor }, { data: project }, { data: ownAssignment }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, role, is_active")
        .eq("id", currentUser.sub)
        .single(),
      admin
        .from("projects")
        .select("id, created_by, is_active")
        .eq("id", projectId)
        .single(),
      admin
        .from("project_assignments")
        .select("user_id")
        .eq("project_id", projectId)
        .eq("user_id", currentUser.sub)
        .maybeSingle(),
    ]);

  const canView =
    actor?.role === "owner" ||
    actor?.role === "manager" ||
    Boolean(ownAssignment);

  if (!project || !canView)
    throw createError({
      statusCode: 403,
      statusMessage: "Nuk ke qasje në këtë projekt.",
    });

  const { data: assignments, error: assignmentsError } = await admin
    .from("project_assignments")
    .select("user_id")
    .eq("project_id", projectId);

  if (assignmentsError)
    throw createError({
      statusCode: 500,
      statusMessage: assignmentsError.message,
    });

  const memberIds = new Set<string>();
  if (project.created_by) memberIds.add(project.created_by);
  for (const assignment of assignments || []) memberIds.add(assignment.user_id);

  if (!memberIds.size) return [];

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .in("id", [...memberIds])
    .eq("is_active", true)
    .order("full_name");

  if (profilesError)
    throw createError({
      statusCode: 500,
      statusMessage: profilesError.message,
    });

  const ownerId = project.created_by;
  return ((profiles || []) as ProfileRow[]).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role,
    membership: profile.id === ownerId ? "owner" : "assigned",
  }));
});
