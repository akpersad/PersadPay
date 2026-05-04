import { Resend } from 'resend'
import type { Settings, PaystubWithYTD, W2, Reminder } from './types'
import { formatDate, formatDateRange } from './dates'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'Persad Pay <payroll@persadpay.com>'

export async function sendStubEmail(
  stub: PaystubWithYTD,
  settings: Settings,
  pdfBuffer: Buffer,
): Promise<{ success: boolean; error?: string }> {
  const subject = `Your pay stub for ${formatDateRange(stub.pay_period_start, stub.pay_period_end)}`
  const body = `Hi ${settings.employee_name ?? 'there'},\n\nPlease find your pay stub attached for the pay period ${formatDateRange(stub.pay_period_start, stub.pay_period_end)}.\n\nNet Pay: $${Number(stub.net_pay).toFixed(2)}\n\nIf you have any questions, please reply to this email.\n\nPersad Pay`

  const recipients = [
    settings.employee_email,
    ...(settings.additional_emails ?? []),
  ].filter(Boolean) as string[]

  const replyTo = settings.reply_to_emails?.length ? settings.reply_to_emails : undefined

  try {
    await Promise.all(
      recipients.map(to =>
        resend.emails.send({
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
        })
      )
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function sendReminderEmail(
  settings: Settings,
  reminder: Reminder,
): Promise<{ success: boolean; error?: string }> {
  const recipients = (settings.reminder_emails ?? []).filter(Boolean)
  if (!recipients.length) return { success: true }

  const subject = `Reminder: ${reminder.title} due ${formatDate(reminder.due_date)}`
  const body = `This is a reminder that ${reminder.title} is due on ${formatDate(reminder.due_date)}.\n\n${reminder.description}\n\nPersad Pay`

  try {
    await Promise.all(
      recipients.map(to =>
        resend.emails.send({
          from: FROM,
          to,
          subject,
          text: body,
        })
      )
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
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

  try {
    await Promise.all(
      recipients.map(to =>
        resend.emails.send({
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
        })
      )
    )
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
