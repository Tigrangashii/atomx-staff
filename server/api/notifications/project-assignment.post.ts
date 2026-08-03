import { createClient } from "@supabase/supabase-js";
import { serverSupabaseUser } from "#supabase/server";

export default defineEventHandler(async (event) => {
  const currentUser = await serverSupabaseUser(event);
  if (!currentUser?.sub)
    throw createError({
      statusCode: 401,
      statusMessage: "Sesioni ka skaduar.",
    });

  const body = await readBody<{ projectId?: string; userIds?: string[] }>(
    event,
  );
  const projectId = body.projectId;
  const userIds = [...new Set(body.userIds || [])].filter(Boolean);

  if (!projectId || !userIds.length)
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

  const [{ data: actor }, { data: project }, { data: recipients }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("full_name, role")
        .eq("id", currentUser.sub)
        .single(),
      admin.from("projects").select("name").eq("id", projectId).single(),
      admin
        .from("profiles")
        .select("id")
        .in("id", userIds)
        .eq("is_active", true),
    ]);

  if (actor?.role !== "owner")
    throw createError({
      statusCode: 403,
      statusMessage: "Vetëm owner mund të dërgojë këtë njoftim.",
    });

  const actorName = actor.full_name?.trim() || "Owner";
  const projectName = project?.name || "projekt";
  const rows = (recipients || []).map((recipient) => ({
    user_id: recipient.id,
    title: "Je assignuar në projekt",
    message: `${actorName} të ka assignuar në projektin "${projectName}".`,
  }));

  if (rows.length) {
    const { error } = await admin.from("notifications").insert(rows);
    if (error)
      throw createError({ statusCode: 500, statusMessage: error.message });
  }

  return { success: true, notified: rows.length };
});
