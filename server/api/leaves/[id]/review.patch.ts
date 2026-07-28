import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { escapeHtml, sendBrevoEmail } from '../../../utils/brevo'

const leaveLabels: Record<string, string> = { annual: 'Pushim vjetor', sick: 'Pushim mjekësor', unpaid: 'Pa pagesë', other: 'Tjetër' }

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) throw createError({ statusCode: 401, statusMessage: 'Sesioni ka skaduar.' })
  const body = await readBody<{ status: 'approved' | 'rejected'; rejectionReason?: string | null }>(event)
  if (!['approved', 'rejected'].includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Statusi nuk është valid.' })
  if (body.status === 'rejected' && !body.rejectionReason?.trim()) throw createError({ statusCode: 400, statusMessage: 'Arsyeja e refuzimit është e detyrueshme.' })

  const supabase = await serverSupabaseClient(event)
  const { data: reviewer } = await supabase.from('profiles').select('role').eq('id', authUser.sub).single()
  if (!reviewer || !['owner', 'manager'].includes(reviewer.role)) throw createError({ statusCode: 403, statusMessage: 'Nuk ke të drejtë ta shqyrtosh këtë kërkesë.' })

  const id = getRouterParam(event, 'id')
  const { data: request, error: requestError } = await supabase.from('leave_requests').select('id, employee_id, leave_type, start_date, end_date, rejection_reason, employee:profiles!leave_requests_employee_id_fkey(id, full_name, email)').eq('id', id).single()
  if (requestError || !request) throw createError({ statusCode: 404, statusMessage: 'Kërkesa nuk u gjet.' })

  const { error } = await supabase.from('leave_requests').update({ status: body.status, rejection_reason: body.status === 'rejected' ? body.rejectionReason?.trim() : null, approved_by: authUser.sub, approved_at: new Date().toISOString() }).eq('id', id)
  if (error) throw createError({ statusCode: 400, statusMessage: error.message })

  const employee = Array.isArray(request.employee) ? request.employee[0] : request.employee
  const email = employee?.email
  if (email) {
    const approved = body.status === 'approved'
    const subject = approved ? 'Kërkesa juaj për pushim është aprovuar' : 'Kërkesa juaj për pushim është refuzuar'
    const htmlContent = approved
      ? `<h2>Kërkesa juaj për pushim është aprovuar</h2><p>Periudha: <strong>${escapeHtml(request.start_date)} – ${escapeHtml(request.end_date)}</strong></p>`
      : `<h2>Kërkesa juaj për pushim është refuzuar</h2><p>Periudha: <strong>${escapeHtml(request.start_date)} – ${escapeHtml(request.end_date)}</strong></p><p><strong>Arsyeja:</strong> ${escapeHtml(body.rejectionReason)}</p>`
    const config = useRuntimeConfig(event)
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(String(config.public.supabase.url), String(config.supabaseServiceRoleKey), { auth: { autoRefreshToken: false, persistSession: false } })
    await admin.from('notifications').insert({ user_id: request.employee_id, title: subject, message: approved ? 'Kërkesa juaj për pushim u aprovua.' : `Kërkesa u refuzua: ${body.rejectionReason}` })
    await sendBrevoEmail(event, { emailType: approved ? 'leave_approved' : 'leave_rejected', recipient: email, leaveRequestId: request.id, subject, htmlContent })
  }

  return { success: true }
})
