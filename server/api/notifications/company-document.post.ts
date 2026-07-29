import { createClient } from '@supabase/supabase-js'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const currentUser = await serverSupabaseUser(event)
  if (!currentUser?.sub) throw createError({ statusCode: 401, statusMessage: 'Sesioni ka skaduar.' })

  const body = await readBody<{ title?: string }>(event)
  const title = body.title?.trim()
  if (!title) throw createError({ statusCode: 400, statusMessage: 'Titulli i dokumentit mungon.' })

  const config = useRuntimeConfig(event)
  const admin = createClient(String(config.public.supabase.url), String(config.supabaseServiceRoleKey), {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const [{ data: uploader }, { data: recipients, error: recipientsError }] = await Promise.all([
    admin.from('profiles').select('full_name, role').eq('id', currentUser.sub).single(),
    admin.from('profiles').select('id').eq('is_active', true).neq('id', currentUser.sub)
  ])

  if (recipientsError) throw createError({ statusCode: 500, statusMessage: recipientsError.message })
  if (!['owner', 'manager'].includes(uploader?.role || '')) {
    throw createError({ statusCode: 403, statusMessage: 'Nuk ke të drejtë të dërgosh këtë njoftim.' })
  }

  const name = uploader?.full_name?.trim() || 'Një menaxher'
  const message = `${name} ka ngarkuar dokumentin “${title}” te dokumentet e kompanisë.`
  const rows = (recipients || []).map(recipient => ({ user_id: recipient.id, title: 'Dokument i ri i kompanisë', message }))
  if (rows.length) {
    const { error } = await admin.from('notifications').insert(rows)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true, notified: rows.length }
})
