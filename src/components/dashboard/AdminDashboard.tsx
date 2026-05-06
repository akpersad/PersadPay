import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { OnboardingChecklist } from './OnboardingChecklist'
import { UpcomingDeadlines } from './UpcomingDeadlines'
import { NextFilingCard } from './NextFilingCard'
import { formatDateRange, formatCurrency, daysUntil } from '@/lib/dates'
import { getCurrentQuarter, getQuarterDateRange, getQuarterDueDate } from '@/lib/filings'
import { PlusCircle, CheckCircle2, AlertCircle, PiggyBank, AlertTriangle, TrendingUp } from 'lucide-react'
import { computeCoverageWatch } from '@/lib/coverage'
import type { Paystub, Reminder, OnboardingItem, Filing, Settings } from '@/lib/types'

export async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    .toLocaleDateString('en-CA')

  const { year: currentYear, quarter: currentQuarter } = getCurrentQuarter(now)
  const currentQuarterRange = getQuarterDateRange(currentYear, currentQuarter)

  const [
    { data: ytdStubs },
    { data: recentStubs },
    { data: reminders },
    { data: checklist },
    { data: currentQuarterStubs },
    { data: currentQuarterFiling },
    { data: coverageStubs },
    { data: hysaTxAmounts },
    { data: hysaSettings },
  ] = await Promise.all([
    supabase
      .from('paystubs')
      .select('gross_pay')
      .gte('pay_date', yearStart),
    supabase
      .from('paystubs')
      .select('id, stub_number, pay_period_start, pay_period_end, gross_pay, payment_sent, stub_sent, hysa_transferred')
      .order('stub_number', { ascending: false })
      .limit(5),
    supabase
      .from('reminders')
      .select('*')
      .eq('dismissed', false)
      .lte('due_date', ninetyDaysOut)
      .order('due_date', { ascending: true }),
    supabase
      .from('onboarding_checklist')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('paystubs')
      .select('gross_pay')
      .gte('pay_date', currentQuarterRange.start)
      .lte('pay_date', currentQuarterRange.end),
    supabase
      .from('filings')
      .select('*')
      .eq('filing_type', 'NYS-45')
      .eq('tax_year', currentYear)
      .eq('quarter', currentQuarter)
      .maybeSingle<Filing>(),
    // Last 52 weeks of stubs for the DBL/PFL coverage threshold watch.
    (() => {
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - 52 * 7)
      return supabase
        .from('paystubs')
        .select('pay_date, hours_worked')
        .gte('pay_date', cutoff.toISOString().slice(0, 10))
    })(),
    supabase.from('hysa_transactions').select('amount'),
    supabase.from('settings').select('hysa_actual_balance, hysa_actual_balance_at').single<Pick<Settings, 'hysa_actual_balance' | 'hysa_actual_balance_at'>>(),
  ])

  const coverage = computeCoverageWatch((coverageStubs ?? []) as Paystub[], now)

  const ytdGross = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const stubCount = ytdStubs?.length ?? 0

  const hysaExpectedBalance = Math.round(
    (hysaTxAmounts ?? []).reduce((s, row) => s + Number((row as { amount: number }).amount), 0) * 100
  ) / 100
  const hysaActualBalance = hysaSettings?.hysa_actual_balance ?? null
  const hysaActualBalanceAt = hysaSettings?.hysa_actual_balance_at ?? null
  const hysaDiscrepancy = hysaActualBalance !== null
    ? Math.round((hysaActualBalance - hysaExpectedBalance) * 100) / 100
    : null
  const nextReminder = (reminders ?? []).find(r => !r.dismissed)
  const checklistItems = (checklist ?? []) as OnboardingItem[]
  const allDone = checklistItems.every(i => i.completed)

  const currentQuarterStubCount = currentQuarterStubs?.length ?? 0
  const currentQuarterGross = (currentQuarterStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const currentQuarterFiled = !!currentQuarterFiling?.filed_on
  const showFilingCard = currentQuarterStubCount > 0 || daysUntil(getQuarterDueDate(currentYear, currentQuarter)) <= 20

  return (
    <div className="px-4 pt-6 pb-4 space-y-6 max-w-lg mx-auto">
      {/* DBL/PFL coverage threshold watch — only renders when triggered */}
      {coverage.status !== 'ok' && (
        <Card className={coverage.status === 'exceeded' ? 'border-destructive' : 'border-amber-500'}>
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${coverage.status === 'exceeded' ? 'text-destructive' : 'text-amber-600'}`} />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {coverage.status === 'exceeded'
                  ? 'NY DBL + PFL coverage now required'
                  : 'Approaching DBL/PFL coverage threshold'}
              </p>
              <p className="text-xs text-muted-foreground">{coverage.message}</p>
              {coverage.status === 'exceeded' && (
                <p className="text-xs text-muted-foreground">
                  Quote: <a href="https://www.nysif.com" target="_blank" rel="noopener noreferrer" className="underline">NYSIF</a> · Update settings.pfl_waived = false once policy is in place.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Next NYS-45 filing card */}
      {showFilingCard && (
        <NextFilingCard
          year={currentYear}
          quarter={currentQuarter}
          dueDate={getQuarterDueDate(currentYear, currentQuarter)}
          stubCount={currentQuarterStubCount}
          grossPay={currentQuarterGross}
          filed={currentQuarterFiled}
        />
      )}

      {/* HYSA balance card */}
      <Link href="/hysa">
        <Card className={`hover:bg-muted/50 transition-colors cursor-pointer ${hysaDiscrepancy !== null && hysaDiscrepancy !== 0 ? 'border-amber-400' : ''}`}>
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <PiggyBank className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">HYSA Balance</p>
                {hysaActualBalanceAt && (
                  <p className="text-xs text-muted-foreground">
                    Reconciled {new Date(hysaActualBalanceAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
                  </p>
                )}
                {!hysaActualBalanceAt && (
                  <p className="text-xs text-muted-foreground">Not yet reconciled</p>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold font-mono">
                {formatCurrency(hysaExpectedBalance)}
              </p>
              {hysaDiscrepancy !== null && hysaDiscrepancy !== 0 && (
                <p className="text-[10px] text-amber-600 flex items-center gap-0.5 justify-end">
                  <TrendingUp className="h-3 w-3" />
                  {formatCurrency(Math.abs(hysaDiscrepancy))} off
                </p>
              )}
            </div>
          </CardContent>
        </Card>
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
                    <div className="flex gap-1.5" aria-label="Workflow status: paid · emailed · HYSA-funded">
                      {stub.payment_sent
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <AlertCircle className="h-4 w-4 text-amber-500" />
                      }
                      {stub.stub_sent
                        ? <CheckCircle2 className="h-4 w-4 text-blue-500" />
                        : <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      }
                      {stub.hysa_transferred
                        ? <PiggyBank className="h-4 w-4 text-green-600" />
                        : <PiggyBank className="h-4 w-4 text-muted-foreground" />
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
          <UpcomingDeadlines reminders={reminders as Reminder[]} />
        </section>
      )}
    </div>
  )
}
