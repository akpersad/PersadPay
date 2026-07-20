import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { OnboardingChecklist } from './OnboardingChecklist'
import { YearEndChecklist } from './YearEndChecklist'
import { UpcomingDeadlines } from './UpcomingDeadlines'
import { NextFilingCard } from './NextFilingCard'
import { formatDate, formatDateRange, formatCurrency, daysUntil, todayNY, addDays, shiftedDeadline } from '@/lib/dates'
import { getCurrentQuarter, getQuarterDateRange, getQuarterDueDate, previousQuarter } from '@/lib/filings'
import { PlusCircle, CheckCircle2, AlertCircle, PiggyBank, AlertTriangle, TrendingUp } from 'lucide-react'
import { computeCoverageWatch } from '@/lib/coverage'
import type { Paystub, Reminder, OnboardingItem, YearEndItem, Filing, Settings } from '@/lib/types'

// Fixed items seeded per tax year — label + detail only (id/year added at insert time).
const YEAR_END_ITEMS = [
  { label: 'Confirm all pay stubs for the year are generated', detail: 'Ensure every week worked has a stub. No gaps in the stubs list.' },
  { label: 'Verify HYSA balance covers all Q4 taxes', detail: 'Check the HYSA ledger against Q4 tax obligations before filing.' },
  { label: 'File NYS-45 Q4 (due Jan 31)', detail: 'File at nystax.gov. Pay UI tax + state withholding. See Reminders.' },
  { label: 'Generate and send W-2 to employee (due Jan 31)', detail: 'Generate from the W-2 tab, then email to employee.' },
  { label: 'File W-3 with SSA (due Jan 31)', detail: 'Submit W-3 transmittal to SSA. Download from the W-2 tab.' },
  { label: 'File Schedule H with federal return (due ~Apr 15)', detail: 'Attach to Form 1040. Generate from Filings → Schedule H.' },
  { label: 'Verify and update tax constants for the new year', detail: 'Review the Tax Rates panel in Settings and update if changed.' },
  { label: 'Check updated SUTA rate notice from NY DOL (Jan/Feb)', detail: 'Update suta_rate in Settings when your NY DOL notice arrives.' },
] as const

export async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // All "today"-derived values use the NY calendar date — the UTC clock is
  // already on tomorrow from ~8 PM NY, which shifted years/quarters early.
  const today = todayNY()
  const nyYear = Number(today.slice(0, 4))
  const yearStart = `${nyYear}-01-01`
  const yearEnd = `${nyYear}-12-31`
  const ninetyDaysOut = addDays(today, 90)

  const { year: currentYear, quarter: currentQuarter } = getCurrentQuarter(today)
  const currentQuarterRange = getQuarterDateRange(currentYear, currentQuarter)
  const prevQ = previousQuarter(currentYear, currentQuarter)
  const prevQuarterRange = getQuarterDateRange(prevQ.year, prevQ.quarter)

  const [
    { data: ytdStubs },
    { data: recentStubs },
    { data: reminders },
    { data: checklist },
    { data: currentQuarterStubs },
    { data: currentQuarterFiling },
    { data: prevQuarterStubs },
    { data: prevQuarterFiling },
    { data: coverageStubs },
    { data: hysaTxAmounts },
    { data: hysaSettings },
    { data: nearestReminder },
  ] = await Promise.all([
    supabase
      .from('paystubs')
      .select('gross_pay, employer_fica_ss, employer_fica_medicare, futa, suta')
      .gte('pay_date', yearStart)
      .lte('pay_date', yearEnd),
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
    supabase
      .from('paystubs')
      .select('gross_pay')
      .gte('pay_date', prevQuarterRange.start)
      .lte('pay_date', prevQuarterRange.end),
    supabase
      .from('filings')
      .select('*')
      .eq('filing_type', 'NYS-45')
      .eq('tax_year', prevQ.year)
      .eq('quarter', prevQ.quarter)
      .maybeSingle<Filing>(),
    // Last 52 weeks of stubs for the DBL/PFL coverage threshold watch.
    supabase
      .from('paystubs')
      .select('pay_date, hours_worked')
      .gte('pay_date', addDays(today, -52 * 7)),
    supabase.from('hysa_transactions').select('amount'),
    supabase.from('settings').select('hysa_actual_balance, hysa_actual_balance_at').single<Pick<Settings, 'hysa_actual_balance' | 'hysa_actual_balance_at'>>(),
    // Nearest reminder for the Next Due stat card — uncapped, unlike the
    // 90-day pending-reminders list below it.
    supabase
      .from('reminders')
      .select('due_date')
      .eq('dismissed', false)
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle<Pick<Reminder, 'due_date'>>(),
  ])

  // Year-end checklist: show in December (filing year) and January (prior year).
  const currentMonth = Number(today.slice(5, 7)) // 1-12
  const isYearEndPeriod = currentMonth === 12 || currentMonth === 1
  const yearEndTaxYear = currentMonth === 1 ? nyYear - 1 : nyYear

  let yearEndItems: YearEndItem[] = []
  if (isYearEndPeriod) {
    const { data: existing } = await supabase
      .from('year_end_checklist')
      .select('*')
      .eq('tax_year', yearEndTaxYear)
      .order('sort_order', { ascending: true })

    if (!existing?.length) {
      await supabase.from('year_end_checklist').insert(
        YEAR_END_ITEMS.map((item, i) => ({
          tax_year: yearEndTaxYear,
          label: item.label,
          detail: item.detail,
          sort_order: i + 1,
        }))
      )
      const { data: seeded } = await supabase
        .from('year_end_checklist')
        .select('*')
        .eq('tax_year', yearEndTaxYear)
        .order('sort_order', { ascending: true })
      yearEndItems = (seeded ?? []) as YearEndItem[]
    } else {
      yearEndItems = existing as YearEndItem[]
    }
  }

  const allYearEndDone = yearEndItems.every(i => i.completed)

  const coverage = computeCoverageWatch((coverageStubs ?? []) as Paystub[], today)

  const ytdGross = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const ytdEmployerCost = (ytdStubs ?? []).reduce(
    (sum, s) =>
      sum +
      Number(s.gross_pay) +
      Number(s.employer_fica_ss) +
      Number(s.employer_fica_medicare) +
      Number(s.futa) +
      Number(s.suta),
    0
  )
  const stubCount = ytdStubs?.length ?? 0

  const hysaExpectedBalance = Math.round(
    (hysaTxAmounts ?? []).reduce((s, row) => s + Number((row as { amount: number }).amount), 0) * 100
  ) / 100
  const hysaActualBalance = hysaSettings?.hysa_actual_balance ?? null
  const hysaActualBalanceAt = hysaSettings?.hysa_actual_balance_at ?? null
  const hysaDiscrepancy = hysaActualBalance !== null
    ? Math.round((hysaActualBalance - hysaExpectedBalance) * 100) / 100
    : null
  // Weekend/holiday statutory dates shift to the next business day, and a
  // filing is only overdue the day AFTER the (shifted) deadline.
  const nextDueDays = nearestReminder
    ? daysUntil(shiftedDeadline(nearestReminder.due_date).effective)
    : null
  const checklistItems = (checklist ?? []) as OnboardingItem[]
  const allDone = checklistItems.every(i => i.completed)

  const currentQuarterStubCount = currentQuarterStubs?.length ?? 0
  const currentQuarterGross = (currentQuarterStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  // Treat both Filed and Not Applicable as "handled" — either one means the
  // admin has resolved this quarter and the urgency card should disappear.
  const currentQuarterFiled = !!currentQuarterFiling?.filed_on || !!currentQuarterFiling?.not_applicable
  const prevQuarterStubCount = prevQuarterStubs?.length ?? 0
  const prevQuarterGross = (prevQuarterStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const prevQuarterHandled = !!prevQuarterFiling?.filed_on || !!prevQuarterFiling?.not_applicable
  // The previous quarter's NYS-45 is the one actually due during this quarter
  // (Q2 is due Jul 31, mid-Q3). Keep surfacing it until it's handled; only
  // then track the quarter currently accruing.
  const showPrevQuarterCard = !prevQuarterHandled && prevQuarterStubCount > 0
  const filingCard = showPrevQuarterCard
    ? {
        year: prevQ.year,
        quarter: prevQ.quarter,
        stubCount: prevQuarterStubCount,
        grossPay: prevQuarterGross,
        filed: false,
      }
    : {
        year: currentYear,
        quarter: currentQuarter,
        stubCount: currentQuarterStubCount,
        grossPay: currentQuarterGross,
        filed: currentQuarterFiled,
      }
  const showFilingCard = showPrevQuarterCard
    || currentQuarterStubCount > 0
    || daysUntil(getQuarterDueDate(currentYear, currentQuarter)) <= 20

  return (
    <div className="px-4 pt-6 pb-4 space-y-8 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
      {/* DBL/PFL coverage threshold watch — only renders when triggered */}
      {coverage.status !== 'ok' && (
        <Card className={coverage.status === 'exceeded' ? 'border-destructive' : 'border-yellow-500'}>
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${coverage.status === 'exceeded' ? 'text-destructive' : 'text-yellow-600'}`} />
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {coverage.status === 'exceeded'
                  ? 'NY DBL + PFL coverage now required'
                  : 'Approaching DBL/PFL coverage threshold'}
              </p>
              <p className="text-xs text-muted-foreground">{coverage.message}</p>
              {coverage.status === 'exceeded' && (
                <p className="text-xs text-muted-foreground">
                  Quote: <a href="https://www.nysif.com" target="_blank" rel="noopener noreferrer" className="underline">NYSIF</a> · Enable DBL and PFL coverage in Settings once policies are in place.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">YTD Gross</p>
            <p className="text-lg font-semibold font-mono mt-0.5">{formatCurrency(ytdGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">Employer Cost YTD</p>
            <p className="text-lg font-semibold font-mono mt-0.5">{formatCurrency(ytdEmployerCost)}</p>
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
            {nextDueDays !== null ? (
              <p className="text-sm font-semibold mt-0.5 leading-tight">
                {nextDueDays < 0
                  ? 'Overdue'
                  : nextDueDays === 0
                    ? 'Today'
                    : `${nextDueDays}d`}
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
          year={filingCard.year}
          quarter={filingCard.quarter}
          dueDate={getQuarterDueDate(filingCard.year, filingCard.quarter)}
          stubCount={filingCard.stubCount}
          grossPay={filingCard.grossPay}
          filed={filingCard.filed}
        />
      )}

      {/* HYSA balance card */}
      <Link href="/hysa" className="block">
        <Card className={`hover:bg-muted/50 transition-colors cursor-pointer ${hysaDiscrepancy !== null && hysaDiscrepancy !== 0 ? 'border-yellow-400' : ''}`}>
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <PiggyBank className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">HYSA Balance</p>
                {hysaActualBalanceAt && (
                  <p className="text-xs text-muted-foreground">
                    {/* Stored as a date the admin picked, not a moment in time —
                        render the date portion directly (matches /hysa). */}
                    Reconciled {formatDate(hysaActualBalanceAt.slice(0, 10))}
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
                <p className="text-[10px] text-yellow-600 flex items-center gap-0.5 justify-end">
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

      {/* Year-end task checklist — December and January only */}
      {isYearEndPeriod && !allYearEndDone && yearEndItems.length > 0 && (
        <YearEndChecklist items={yearEndItems} taxYear={yearEndTaxYear} />
      )}

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
                        : <AlertCircle className="h-4 w-4 text-yellow-500" />
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
