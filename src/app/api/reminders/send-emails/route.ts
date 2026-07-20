import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendReminderEmail } from '@/lib/email'
import { sendPushToRoles } from '@/lib/push-server'
import { REMINDER_LEAD_DAYS, REMINDER_FOLLOWUP_DAYS, addDays, daysUntil, formatDate, todayNY } from '@/lib/dates'
import type { Reminder, Settings, Paystub } from '@/lib/types'

// Called daily by Vercel Cron. Can also be triggered manually via GET for testing.
// CRON_SECRET must be set manually in the Vercel project env — Vercel does NOT
// create it, but when it exists Vercel Cron sends it as `Authorization: Bearer
// <CRON_SECRET>` on each invocation. Fail with a distinct status when it is
// missing so a misconfiguration shows up in cron logs instead of silently
// 401ing every scheduled run.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
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

    // First notice: fires the first successful run at or inside the lead window,
    // only if not already sent. Self-healing — a cron outage during the window
    // can't permanently skip the notice; the flag flips only on send success.
    let firstNoticeSentThisRun = false
    if (days <= REMINDER_LEAD_DAYS && !reminder.email_sent) {
      const result = await sendReminderEmail(settings, reminder)
      if (result.success) {
        await supabase.from('reminders').update({ email_sent: true }).eq('id', reminder.id)
        firstNoticeSentThisRun = true
      }
      results.push({ title: reminder.title, trigger: '20-day', ...result })
      // Filing reminders are admin-only — employees don't file taxes.
      await sendPushToRoles(supabase, ['admin'], {
        title: `${reminder.title}`,
        body: `Due ${formatDate(reminder.due_date)}. ${reminder.description.slice(0, 80)}`,
        url: '/reminders',
        tag: `reminder-${reminder.id}-20`,
      })
    }

    // Follow-up: same self-healing shape at the 10-day mark. Skipped on the run
    // that just sent the first notice so a fully missed window doesn't produce
    // two emails at once — the follow-up then goes out on the next run.
    if (days <= REMINDER_FOLLOWUP_DAYS && !reminder.followup_email_sent && !firstNoticeSentThisRun) {
      const result = await sendReminderEmail(settings, reminder)
      if (result.success) {
        await supabase.from('reminders').update({ followup_email_sent: true }).eq('id', reminder.id)
      }
      results.push({ title: reminder.title, trigger: '10-day', ...result })
      await sendPushToRoles(supabase, ['admin'], {
        title: `${reminder.title}: 10 days left`,
        body: `Due ${formatDate(reminder.due_date)}`,
        url: '/reminders',
        tag: `reminder-${reminder.id}-10`,
      })
    }
  }

  // ── Daily push-only triggers (no email counterpart) ─────────────────────
  // Weekday and week boundaries follow the NY calendar, not the UTC clock.
  const todayStr = todayNY()
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const nyWeekday = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay()
  const isFriday = nyWeekday === 5

  // (1) Friday morning admin nudge — "It's Friday, generate this week's stub"
  // unless one's already been generated covering today's week.
  if (isFriday) {
    const weekStartIso = addDays(todayStr, -nyWeekday) // back to Sunday
    const { data: stubsThisWeek } = await supabase
      .from('paystubs')
      .select('id')
      .gte('pay_period_end', weekStartIso)
      .limit(1)

    if (!stubsThisWeek?.length) {
      await sendPushToRoles(supabase, ['admin'], {
        title: "It's Friday. Time for this week's stub",
        body: 'Generate the babysitter\'s paystub for the week so you can run payroll.',
        url: '/stubs/new',
        tag: 'friday-nudge',
      })
    }
  }

  // (2) Stubs created > 24h ago that haven't been marked payment_sent.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: stalePending } = await supabase
    .from('paystubs')
    .select('id, stub_number, gross_pay, created_at')
    .eq('payment_sent', false)
    .lt('created_at', cutoff)
    .limit(5)

  for (const stub of (stalePending ?? []) as Pick<Paystub, 'id' | 'stub_number' | 'gross_pay' | 'created_at'>[]) {
    await sendPushToRoles(supabase, ['admin'], {
      title: `Stub #${stub.stub_number}: payment not marked sent`,
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
