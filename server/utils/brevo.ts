import { createClient } from '@supabase/supabase-js'

type EmailInput = {
  emailType: string
  recipient: string
  leaveRequestId?: string | null
  subject: string
  htmlContent: string
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export { escapeHtml }

export async function sendBrevoEmail(event: any, input: EmailInput) {
  const config = useRuntimeConfig(event)
  const recipient = input.recipient.trim().toLowerCase()
  const senderEmail = String(config.brevoSenderEmail || '').trim()
  const senderName = String(config.brevoSenderName || 'AtomX Staff')
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
    const admin = createClient(String(config.public.supabase.url), String(config.supabaseServiceRoleKey), {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    await admin.from('email_logs').insert({
      email_type: input.emailType,
      recipient,
      leave_request_id: input.leaveRequestId || null,
      status,
      error_message: errorMessage
    })
  } catch {
    // Email log failure must not hide the original email result.
  }

  return { status, errorMessage }
}
