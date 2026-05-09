import { Resend } from 'resend'
import type { Settings, PaystubWithYTD, W2, Reminder } from './types'
import { formatDate, formatDateRange } from './dates'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Persad Pay <noreply@payroll.persadpay.com>'

// Resend's SDK returns { data, error } and does NOT throw on API errors
// (unverified domain, invalid recipient, rate limits, etc.). If we don't
// inspect `error` we get false positives — the email looks like it sent
// when Resend actually rejected it.
async function sendOne(payload: Parameters<typeof resend.emails.send>[0]): Promise<{ error: string | null; messageId: string | null }> {
  try {
    const { data, error } = await resend.emails.send(payload)
    if (error) {
      console.error('[resend] send failed:', error)
      return { error: error.message ?? JSON.stringify(error), messageId: null }
    }
    return { error: null, messageId: data?.id ?? null }
  } catch (err) {
    console.error('[resend] threw:', err)
    return { error: err instanceof Error ? err.message : String(err), messageId: null }
  }
}

async function sendAll(payloads: Parameters<typeof resend.emails.send>[0][]): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error('[resend] RESEND_API_KEY is not set')
    return { success: false, error: 'RESEND_API_KEY is not configured' }
  }
  const results = await Promise.all(payloads.map(sendOne))
  const errors = results.filter(r => r.error !== null).map(r => r.error!)
  if (errors.length) {
    return { success: false, error: errors.join('; ') }
  }
  return { success: true, messageId: results[0]?.messageId ?? undefined }
}

export async function sendStubEmail(
  stub: PaystubWithYTD,
  settings: Settings,
  pdfBuffer: Buffer,
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const subject = `Your pay stub for ${formatDateRange(stub.pay_period_start, stub.pay_period_end)}`
  const body = `Hi ${settings.employee_name ?? 'there'},\n\nPlease find your pay stub attached for the pay period ${formatDateRange(stub.pay_period_start, stub.pay_period_end)}.\n\nNet Pay: $${Number(stub.net_pay).toFixed(2)}\n\nIf you have any questions, please reply to this email.\n\nPersad Pay`

  const recipients = [
    settings.employee_email,
    ...(settings.additional_emails ?? []),
  ].filter(Boolean) as string[]

  const replyTo = settings.reply_to_emails?.length ? settings.reply_to_emails : undefined

  return sendAll(recipients.map(to => ({
    from: FROM,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject,
    text: body,
    attachments: [
      {
        filename: `paystub-${stub.stub_number}.pdf`,
        content: pdfBuffer,
      },
    ],
  })))
}

export async function sendReminderEmail(
  settings: Settings,
  reminder: Reminder,
): Promise<{ success: boolean; error?: string }> {
  const recipients = (settings.reminder_emails ?? []).filter(Boolean)
  if (!recipients.length) return { success: true }

  const subject = `Reminder: ${reminder.title} due ${formatDate(reminder.due_date)}`
  const body = `This is a reminder that ${reminder.title} is due on ${formatDate(reminder.due_date)}.\n\n${reminder.description}\n\nPersad Pay`

  return sendAll(recipients.map(to => ({
    from: FROM,
    to,
    subject,
    text: body,
  })))
}

export async function sendW2Email(
  w2: W2,
  settings: Settings,
  pdfBuffer: Buffer,
): Promise<{ success: boolean; error?: string }> {
  const subject = `Your W-2 for tax year ${w2.tax_year}`
  const body = `Hi ${settings.employee_name ?? 'there'},\n\nPlease find your W-2 attached for tax year ${w2.tax_year}.\n\nIf you have any questions, please reply to this email.\n\nPersad Pay`

  const recipients = [
    settings.employee_email,
    ...(settings.additional_emails ?? []),
  ].filter(Boolean) as string[]

  const replyTo = settings.reply_to_emails?.length ? settings.reply_to_emails : undefined

  return sendAll(recipients.map(to => ({
    from: FROM,
    to,
    ...(replyTo ? { replyTo } : {}),
    subject,
    text: body,
    attachments: [
      {
        filename: `w2-${w2.tax_year}.pdf`,
        content: pdfBuffer,
      },
    ],
  })))
}
