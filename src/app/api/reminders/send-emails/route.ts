import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderEmail } from '@/lib/email'
import { REMINDER_LEAD_DAYS, REMINDER_FOLLOWUP_DAYS, daysUntil } from '@/lib/dates'
import type { Reminder, Settings } from '@/lib/types'

// Called daily by Vercel Cron. Can also be triggered manually via GET for testing.
// Vercel automatically sets CRON_SECRET and sends it as a Bearer token in production.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createAdminClient()

  const [{ data: settings }, { data: reminders }] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    supabase.from('reminders').select('*').eq('dismissed', false),
  ])

  if (!settings?.reminder_emails?.length) {
    return NextResponse.json({ sent: 0, skipped: 'no reminder_emails configured' })
  }

  if (!reminders?.length) {
    return NextResponse.json({ sent: 0, skipped: 'no active reminders' })
  }

  const results: { title: string; trigger: string; success: boolean; error?: string }[] = []

  for (const reminder of reminders as Reminder[]) {
    const days = daysUntil(reminder.due_date)

    // First notice: 20 days out, only if not already sent
    if (days === REMINDER_LEAD_DAYS && !reminder.email_sent) {
      const result = await sendReminderEmail(settings, reminder)
      if (result.success) {
        await supabase.from('reminders').update({ email_sent: true }).eq('id', reminder.id)
      }
      results.push({ title: reminder.title, trigger: '20-day', ...result })
    }

    // Follow-up: 10 days out, always send if not dismissed
    if (days === REMINDER_FOLLOWUP_DAYS) {
      const result = await sendReminderEmail(settings, reminder)
      results.push({ title: reminder.title, trigger: '10-day', ...result })
    }
  }

  const sent = results.filter(r => r.success).length
  const errors = results.filter(r => !r.success)

  return NextResponse.json({ sent, results, ...(errors.length ? { errors } : {}) })
}
