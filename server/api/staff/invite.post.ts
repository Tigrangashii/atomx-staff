import { createClient } from '@supabase/supabase-js'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

type InviteStaffBody = {
  fullName?: string
  email?: string
  role?: 'owner' | 'manager' | 'user'
  position?: string
  phone?: string
  contractDate?: string
  annualLeaveDays?: number
}

export default defineEventHandler(async (event) => {
  const currentUser = await serverSupabaseUser(event)

  if (!currentUser) {
    throw createError({ statusCode: 401, statusMessage: 'Duhet të jesh i kyçur.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data: currentProfile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.sub)
    .single()

  if (profileError || !currentProfile || !['owner', 'manager'].includes(currentProfile.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Nuk ke të drejtë të shtosh staf.' })
  }

  const body = await readBody<InviteStaffBody>(event)
  const fullName = body.fullName?.trim()
  const email = body.email?.trim().toLowerCase()
  const requestedRole = body.role || 'user'

  if (requestedRole === 'owner' && currentProfile.role !== 'owner') {
    throw createError({ statusCode: 403, statusMessage: 'Vetëm pronari mund të krijojë pronar tjetër.' })
  }

  if (!fullName || !email) {
    throw createError({ statusCode: 400, statusMessage: 'Emri dhe email-i janë të detyrueshëm.' })
  }

  const config = useRuntimeConfig()
  if (!config.supabaseServiceRoleKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Mungon NUXT_SUPABASE_SERVICE_ROLE_KEY në .env.'
    })
  }

  const admin = createClient(config.public.supabase.url, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${getRequestURL(event).origin}/auth/confirm`
  })

  if (error || !data.user) {
    throw createError({ statusCode: 400, statusMessage: error?.message || 'Ftesa dështoi.' })
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({
      full_name: fullName,
      role: requestedRole,
      position: body.position?.trim() || null,
      phone: body.phone?.trim() || null,
      contract_date: body.contractDate || null,
      annual_leave_days: Number.isFinite(Number(body.annualLeaveDays)) ? Math.max(0, Math.min(365, Number(body.annualLeaveDays))) : 20,
      email
    })
    .eq('id', data.user.id)

  if (updateError) {
    throw createError({ statusCode: 500, statusMessage: updateError.message })
  }

  return { success: true, userId: data.user.id }
})
