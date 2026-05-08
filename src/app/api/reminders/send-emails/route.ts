import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderEmail } from '@/lib/email'
import { sendPushToRoles } from '@/lib/push-server'
import { REMINDER_LEAD_DAYS, REMINDER_FOLLOWUP_DAYS, daysUntil, formatDate, todayNY } from '@/lib/dates'
import type { Reminder, Settings, Paystub } from '@/lib/types'

// Called daily by Vercel Cron. Can also be triggered manually via GET for testing.
// Vercel automatically sets CRON_SECRET and sends it as a Bearer token in production.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()

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
      // Mirror the email with a push to both roles so admins/employee see it
      // on their phones too. Pushes silently skip users without subscriptions.
      await sendPushToRoles(supabase, ['admin', 'employee'], {
        title: `${reminder.title}`,
        body: `Due ${formatDate(reminder.due_date)} — ${reminder.description.slice(0, 80)}`,
        url: '/reminders',
        tag: `reminder-${reminder.id}-20`,
      })
    }

    // Follow-up: 10 days out, always send if not dismissed
    if (days === REMINDER_FOLLOWUP_DAYS) {
      const result = await sendReminderEmail(settings, reminder)
      results.push({ title: reminder.title, trigger: '10-day', ...result })
      await sendPushToRoles(supabase, ['admin', 'employee'], {
        title: `${reminder.title} — 10 days`,
        body: `Due ${formatDate(reminder.due_date)}`,
        url: '/reminders',
        tag: `reminder-${reminder.id}-10`,
      })
    }
  }

  // ── Daily push-only triggers (no email counterpart) ─────────────────────
  const today = new Date()
  const isFriday = today.getDay() === 5

  // (1) Friday morning admin nudge — "It's Friday, generate this week's stub"
  // unless one's already been generated covering today's week.
  if (isFriday) {
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay()) // back to Sunday
    const weekStartIso = weekStart.toISOString().slice(0, 10)
    const { data: stubsThisWeek } = await supabase
      .from('paystubs')
      .select('id')
      .gte('pay_period_end', weekStartIso)
      .limit(1)

    if (!stubsThisWeek?.length) {
      await sendPushToRoles(supabase, ['admin'], {
        title: "It's Friday — time for this week's stub",
        body: 'Generate the babysitter\'s paystub for the week so you can run payroll.',
        url: '/stubs/new',
        tag: 'friday-nudge',
      })
    }
  }

  // (2) Stubs created > 24h ago that haven't been marked payment_sent.
  const cutoff = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data: stalePending } = await supabase
    .from('paystubs')
    .select('id, stub_number, gross_pay, created_at')
    .eq('payment_sent', false)
    .lt('created_at', cutoff)
    .limit(5)

  for (const stub of (stalePending ?? []) as Pick<Paystub, 'id' | 'stub_number' | 'gross_pay' | 'created_at'>[]) {
    await sendPushToRoles(supabase, ['admin'], {
      title: `Stub #${stub.stub_number} — payment not marked sent`,
      body: 'It\'s been more than 24 hours since you generated this stub. Mark payment sent once you\'ve Zelled her.',
      url: `/stubs/${stub.id}`,
      tag: `payment-nag-${stub.id}`,
    })
  }

  const sent = results.filter(r => r.success).length
  const errors = results.filter(r => !r.success)

  return NextResponse.json({
    sent,
    results,
    todayNY: todayNY(),
    fridayNudgeFired: isFriday,
    paymentNagsFired: stalePending?.length ?? 0,
    ...(errors.length ? { errors } : {}),
  })
}
