import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml, renderAtomxEmail, sendBrevoEmail } from '../../utils/brevo'

const leaveLabels: Record<string, string> = { annual: 'Pushim vjetor', sick: 'Pushim mjekësor', unpaid: 'Pa pagesë', other: 'Tjetër' }

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) throw createError({ statusCode: 401, statusMessage: 'Sesioni ka skaduar.' })

  const parts = await readMultipartFormData(event)
  const fields = Object.fromEntries((parts || []).filter(part => !part.filename).map(part => [part.name, part.data?.toString() || ''])) as Record<string, string>
  const certificate = (parts || []).find(part => part.name === 'medicalCertificate' && part.filename)
  const body = fields as { leaveType: string; startDate: string; endDate: string; email?: string; phone?: string; reason?: string }
  if (!body.startDate || !body.endDate || body.endDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Periudha e pushimit nuk është valide.' })
  }
  if (body.leaveType === 'sick' && !certificate?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Vërtetimi mjekësor është i detyrueshëm.' })
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
  if (certificate?.data?.length) {
    const safeName = (certificate.filename || 'certificate').replace(/[^a-zA-Z0-9._-]/g, '-')
    const certificatePath = `${request.id}/${safeName}`
    const { error: uploadError } = await admin.storage.from('medical-certificates').upload(certificatePath, certificate.data, { contentType: certificate.type || 'application/octet-stream', upsert: false })
    if (uploadError) {
      await admin.from('leave_requests').delete().eq('id', request.id)
      throw createError({ statusCode: 400, statusMessage: uploadError.message })
    }
    const { error: pathError } = await admin.from('leave_requests').update({ medical_certificate_path: certificatePath }).eq('id', request.id)
    if (pathError) {
      await admin.storage.from('medical-certificates').remove([certificatePath])
      await admin.from('leave_requests').delete().eq('id', request.id)
      throw createError({ statusCode: 400, statusMessage: pathError.message })
    }
  }
  const { data: reviewers } = await admin.from('profiles').select('id, email').in('role', ['owner', 'manager']).eq('is_active', true).not('email', 'is', null)
  const name = profile.full_name || authUser.email || 'Punëtori'
  const subject = 'Kërkesë e re për pushim'
  const htmlContent = renderAtomxEmail({
    eyebrow: 'Kërkesë për shqyrtim',
    title: 'Kërkesë e re për pushim',
    intro: `${name} ka dërguar një kërkesë të re për pushim.`,
    content: `<div style="padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;font-size:15px;line-height:2;"><strong>Lloji:</strong> ${escapeHtml(leaveLabels[body.leaveType] || body.leaveType)}<br><strong>Periudha:</strong> ${escapeHtml(body.startDate)} – ${escapeHtml(body.endDate)}<br><strong>Arsyeja:</strong> ${escapeHtml(body.reason || 'Pa arsye')}</div><p style="margin:24px 0 0;color:#64748b;font-size:13px;">Hape AtomX Staff për ta shqyrtuar kërkesën.</p>`
  })

  for (const reviewer of reviewers || []) {
    await admin.from('notifications').insert({ user_id: reviewer.id, title: subject, message: `${name} ka kërkuar pushim nga ${body.startDate} deri më ${body.endDate}.` })
    if (reviewer.email) await sendBrevoEmail(event, { emailType: 'leave_request', recipient: reviewer.email, leaveRequestId: request.id, subject, htmlContent })
  }

  return { success: true, id: request.id }
})
