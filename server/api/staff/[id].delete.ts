import { createClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const currentUser = await serverSupabaseUser(event)
  const staffId = getRouterParam(event, 'id')
  if (!currentUser?.sub || !staffId) throw createError({ statusCode: 400, statusMessage: 'Anëtari nuk është valid.' })
  if (currentUser.sub === staffId) throw createError({ statusCode: 400, statusMessage: 'Nuk mund ta fshish llogarinë tënde.' })

  const client = await serverSupabaseClient(event)
  const { data: profile } = await client.from('profiles').select('role').eq('id', currentUser.sub).maybeSingle()
  if (!profile || !['owner', 'manager'].includes(profile.role)) throw createError({ statusCode: 403, statusMessage: 'Nuk ke të drejtë të fshish staf.' })

  const { data: target } = await client.from('profiles').select('role').eq('id', staffId).maybeSingle()
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Anëtari nuk u gjet.' })
  if (profile.role === 'manager' && target.role !== 'user') {
    throw createError({ statusCode: 403, statusMessage: 'Manageri mund të fshijë vetëm përdoruesit.' })
  }

  const config = useRuntimeConfig()
  if (!config.supabaseServiceRoleKey) throw createError({ statusCode: 500, statusMessage: 'Mungon service role key.' })
  const admin = createClient(config.public.supabase.url, config.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await admin.auth.admin.deleteUser(staffId)
  if (error) throw createError({ statusCode: 400, statusMessage: error.message })
  return { success: true }
})
