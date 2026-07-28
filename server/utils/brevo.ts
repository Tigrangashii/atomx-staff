import { createClient } from '@supabase/supabase-js'

type EmailInput = {
  emailType: string
  recipient: string
  leaveRequestId?: string | null
  subject: string
  htmlContent: string
}

type EmailLogStatus = 'pending' | 'sent' | 'failed'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export { escapeHtml }

export function renderAtomxEmail(options: { eyebrow: string; title: string; intro: string; content: string; accent?: string }) {
  const accent = options.accent || '#287cf5'
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#10213f;"><div style="padding:42px 18px;background:linear-gradient(135deg,#eef5ff 0%,#f8fafc 55%,#e7f7ff 100%);"><div style="max-width:620px;margin:0 auto;"><div style="padding:0 10px 18px;text-align:left;"><span style="font-size:14px;font-weight:700;letter-spacing:1.4px;color:${accent};">ATOMX SOLUTIONS</span><span style="float:right;color:#64748b;font-size:13px;">AtomX Staff</span></div><div style="background:#fff;border:1px solid #dbe5f0;border-radius:20px;box-shadow:0 14px 40px rgba(30,64,115,.12);overflow:hidden;"><div style="height:6px;background:${accent};"></div><div style="padding:38px 42px 42px;"><div style="display:inline-block;padding:7px 12px;border-radius:999px;background:${accent}16;color:${accent};font-size:12px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;">${escapeHtml(options.eyebrow)}</div><h1 style="margin:18px 0 12px;font-size:28px;line-height:1.2;color:#10213f;">${escapeHtml(options.title)}</h1><p style="margin:0 0 28px;color:#64748b;font-size:16px;line-height:1.65;">${escapeHtml(options.intro)}</p>${options.content}</div></div><p style="margin:22px 0 0;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">Ky është email automatik nga AtomX Staff.<br>Ju lutem mos iu përgjigjni këtij email-i.</p></div></div></body></html>`
}

export async function sendBrevoEmail(event: any, input: EmailInput) {
  const config = useRuntimeConfig(event)
  const recipient = input.recipient.trim().toLowerCase()
  const senderEmail = String(config.brevoSenderEmail || '').trim()
  const senderName = String(config.brevoSenderName || 'AtomX Staff')
  const admin = createClient(String(config.public.supabase.url), String(config.supabaseServiceRoleKey), {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const dedupeKey = input.leaveRequestId ? `${input.emailType}:${input.leaveRequestId}:${recipient}` : null
  let logId: string | null = null

  if (dedupeKey) {
    const { data: existing } = await admin.from('email_logs').select('id, status').eq('dedupe_key', dedupeKey).maybeSingle()
    if (existing?.status === 'sent' || existing?.status === 'pending') {
      return { status: existing.status as EmailLogStatus, errorMessage: null, skipped: true }
    }

    if (existing?.status === 'failed') {
      const { data: retried, error: retryError } = await admin
        .from('email_logs')
        .update({ status: 'pending', error_message: null })
        .eq('id', existing.id)
        .eq('status', 'failed')
        .select('id')
        .maybeSingle()
      if (retryError || !retried) return { status: 'failed', errorMessage: retryError?.message || 'Email-i i njejte po procesohet.', skipped: true }
      logId = retried.id
    }

    if (!logId) {
      const { data: claimed, error: claimError } = await admin.from('email_logs').insert({
        email_type: input.emailType,
        recipient,
        leave_request_id: input.leaveRequestId,
        status: 'pending',
        dedupe_key: dedupeKey
      }).select('id').maybeSingle()

      if (claimError?.code === '23505') {
        const { data: duplicate } = await admin.from('email_logs').select('id, status').eq('dedupe_key', dedupeKey).maybeSingle()
        return { status: (duplicate?.status || 'pending') as EmailLogStatus, errorMessage: null, skipped: true }
      }
      if (claimError || !claimed) throw createError({ statusCode: 500, statusMessage: claimError?.message || 'Email-i nuk mund te planifikohej.' })
      logId = claimed.id
    }
  }

  let status: 'sent' | 'failed' = 'failed'
  let errorMessage: string | null = null

  if (!config.brevoApiKey || !senderEmail) {
    errorMessage = 'Mungojnë BREVO_API_KEY ose BREVO_SENDER_EMAIL në server.'
  } else {
    try {
      const response = await $fetch<{ messageId?: string }>('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': String(config.brevoApiKey), 'content-type': 'application/json' },
        body: {
          sender: { name: senderName, email: senderEmail },
          to: [{ email: recipient }],
          subject: input.subject,
          htmlContent: input.htmlContent
        }
      })
      status = response?.messageId ? 'sent' : 'failed'
      if (status === 'failed') errorMessage = 'Brevo nuk ktheu messageId.'
    } catch (error: any) {
      errorMessage = error?.data?.message || error?.message || 'Dërgimi i email-it dështoi.'
    }
  }

  try {
    if (logId) {
      await admin.from('email_logs').update({ status, error_message: errorMessage }).eq('id', logId)
    } else {
      await admin.from('email_logs').insert({
        email_type: input.emailType,
        recipient,
        leave_request_id: input.leaveRequestId || null,
        status,
        error_message: errorMessage
      })
    }
  } catch {
    // Email log failure must not hide the original email result.
  }

  return { status, errorMessage }
}
