import { createClient } from "@supabase/supabase-js";
import { serverSupabaseUser } from "#supabase/server";

export default defineEventHandler(async (event) => {
  const currentUser = await serverSupabaseUser(event);
  if (!currentUser?.sub)
    throw createError({
      statusCode: 401,
      statusMessage: "Sesioni ka skaduar.",
    });

  const body = await readBody<{
    projectId?: string;
    name?: string;
    type?: "folder" | "document";
  }>(event);
  const projectId = body.projectId;
  const name = body.name?.trim();
  const type = body.type;

  if (!projectId || !name || !type)
    throw createError({
      statusCode: 400,
      statusMessage: "Të dhënat për njoftim mungojnë.",
    });

  const config = useRuntimeConfig(event);
  const admin = createClient(
    String(config.public.supabase.url),
    String(config.supabaseServiceRoleKey),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  const [
    { data: actor },
    { data: project },
    { data: assignments },
    { data: owners },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name")
      .eq("id", currentUser.sub)
      .single(),
    admin.from("projects").select("name").eq("id", projectId).single(),
    admin
      .from("project_assignments")
      .select("user_id")
      .eq("project_id", projectId),
    admin
      .from("profiles")
      .select("id")
      .eq("role", "owner")
      .eq("is_active", true),
  ]);

  const recipientIds = new Set<string>();
  for (const assignment of assignments || [])
    recipientIds.add(assignment.user_id);
  for (const owner of owners || []) recipientIds.add(owner.id);
  recipientIds.delete(currentUser.sub);

  const actorName = actor?.full_name?.trim() || "Një përdorues";
  const projectName = project?.name || "projekt";
  const materialLabel = type === "folder" ? "folderin" : "dokumentin";
  const rows = [...recipientIds].map((userId) => ({
    user_id: userId,
    title:
      type === "folder"
        ? "Folder u fshi nga projekti"
        : "Dokument u fshi nga projekti",
    message: `${actorName} ka fshirë ${materialLabel} "${name}" te projekti "${projectName}".`,
  }));

  if (rows.length) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { success: true, notified: rows.length };
});
