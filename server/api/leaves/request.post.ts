import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml, sendBrevoEmail } from '../../utils/brevo'

const leaveLabels: Record<string, string> = { annual: 'Pushim vjetor', sick: 'Pushim mjekësor', unpaid: 'Pa pagesë', other: 'Tjetër' }

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) throw createError({ statusCode: 401, statusMessage: 'Sesioni ka skaduar.' })

  const body = await readBody<{ leaveType: string; startDate: string; endDate: string; email?: string; phone?: string; reason?: string }>(event)
  if (!body.startDate || !body.endDate || body.endDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Periudha e pushimit nuk është valide.' })
  }

  const supabase = await serverSupabaseClient(event)
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, email, phone').eq('id', authUser.sub).single()
  if (profileError || !profile) throw createError({ statusCode: 400, statusMessage: profileError?.message || 'Profili nuk u gjet.' })

  const { data: request, error } = await supabase.from('leave_requests').insert({
    employee_id: authUser.sub,
    email: body.email || profile.email || authUser.email,
    phone: body.phone || profile.phone || null,
    leave_type: body.leaveType,
    start_date: body.startDate,
    end_date: body.endDate,
    reason: body.reason || null
  }).select('id').single()
  if (error || !request) throw createError({ statusCode: 400, statusMessage: error?.message || 'Kërkesa nuk u ruajt.' })

  const config = useRuntimeConfig(event)
  const admin = createClient(String(config.public.supabase.url), String(config.supabaseServiceRoleKey), { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: reviewers } = await admin.from('profiles').select('id, email').in('role', ['owner', 'manager']).eq('is_active', true).not('email', 'is', null)
  const name = profile.full_name || authUser.email || 'Punëtori'
  const subject = 'Kërkesë e re për pushim'
  const htmlContent = `<h2>Kërkesë e re për pushim</h2><p><strong>${escapeHtml(name)}</strong> ka kërkuar pushim.</p><p><strong>Lloji:</strong> ${escapeHtml(leaveLabels[body.leaveType] || body.leaveType)}<br><strong>Periudha:</strong> ${escapeHtml(body.startDate)} – ${escapeHtml(body.endDate)}<br><strong>Arsyeja:</strong> ${escapeHtml(body.reason || 'Pa arsye')}</p>`

  for (const reviewer of reviewers || []) {
    await admin.from('notifications').insert({ user_id: reviewer.id, title: subject, message: `${name} ka kërkuar pushim nga ${body.startDate} deri më ${body.endDate}.` })
    if (reviewer.email) await sendBrevoEmail(event, { emailType: 'leave_request', recipient: reviewer.email, leaveRequestId: request.id, subject, htmlContent })
  }

  return { success: true, id: request.id }
})
