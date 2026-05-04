import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OnboardingChecklist } from './OnboardingChecklist'
import { formatDate, formatDateRange, formatCurrency, daysUntil } from '@/lib/dates'
import { PlusCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import type { Paystub, Reminder, OnboardingItem } from '@/lib/types'

export async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA')

  const [
    { data: ytdStubs },
    { data: recentStubs },
    { data: reminders },
    { data: checklist },
  ] = await Promise.all([
    supabase
      .from('paystubs')
      .select('gross_pay')
      .gte('pay_date', yearStart),
    supabase
      .from('paystubs')
      .select('id, stub_number, pay_period_start, pay_period_end, gross_pay, payment_sent, stub_sent')
      .order('stub_number', { ascending: false })
      .limit(5),
    supabase
      .from('reminders')
      .select('*')
      .eq('dismissed', false)
      .lte('due_date', sixtyDaysOut)
      .order('due_date', { ascending: true }),
    supabase
      .from('onboarding_checklist')
      .select('*')
      .order('sort_order', { ascending: true }),
  ])

  const ytdGross = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const stubCount = ytdStubs?.length ?? 0
  const nextReminder = (reminders ?? []).find(r => !r.dismissed)
  const checklistItems = (checklist ?? []) as OnboardingItem[]
  const allDone = checklistItems.every(i => i.completed)

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 max-w-lg mx-auto">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">YTD Gross</p>
            <p className="text-lg font-semibold mt-0.5">{formatCurrency(ytdGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">Stubs This Year</p>
            <p className="text-lg font-semibold mt-0.5">{stubCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">Next Due</p>
            {nextReminder ? (
              <p className="text-sm font-semibold mt-0.5 leading-tight">
                {daysUntil(nextReminder.due_date) <= 0
                  ? 'Overdue'
                  : `${daysUntil(nextReminder.due_date)}d`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">None</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generate new stub CTA */}
      <Link href="/stubs/new" className={cn(buttonVariants(), 'w-full h-12 text-base')}>
        <PlusCircle className="h-5 w-5 mr-2" />
        Generate New Stub
      </Link>

      {/* Onboarding checklist */}
      {!allDone && <OnboardingChecklist items={checklistItems} />}

      {/* Recent stubs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Stubs</h2>
          <Link href="/stubs" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        {!recentStubs?.length ? (
          <p className="text-sm text-muted-foreground">No stubs yet.</p>
        ) : (
          <div className="space-y-2">
            {(recentStubs as Paystub[]).map(stub => (
              <Link key={stub.id} href={`/stubs/${stub.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">#{stub.stub_number} · {formatDateRange(stub.pay_period_start, stub.pay_period_end)}</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(Number(stub.gross_pay))}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {stub.payment_sent
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <AlertCircle className="h-4 w-4 text-amber-500" />
                      }
                      {stub.stub_sent
                        ? <CheckCircle2 className="h-4 w-4 text-blue-500" />
                        : <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Pending reminders */}
      {!!reminders?.length && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Upcoming Deadlines</h2>
            <Link href="/reminders" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {(reminders as Reminder[]).map(r => {
              const days = daysUntil(r.due_date)
              return (
                <Card key={r.id}>
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDate(r.due_date)}</p>
                    </div>
                    <Badge variant={days <= 10 ? 'destructive' : days <= 20 ? 'secondary' : 'outline'}>
                      {days <= 0 ? 'Overdue' : `${days}d`}
                    </Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
