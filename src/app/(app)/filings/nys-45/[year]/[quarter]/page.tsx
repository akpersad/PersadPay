import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { formatDate, formatCurrency, daysUntil, shiftedDeadline, selfImposedDeadline } from '@/lib/dates'
import { calculateNYS45, type Quarter } from '@/lib/filings'
import { getTaxRatesForYear } from '@/lib/tax'
import { CopyValue } from '@/components/filings/CopyValue'
import { MarkFiledForm } from '@/components/filings/MarkFiledForm'
import type { Profile, Paystub, Settings, Filing } from '@/lib/types'

interface Params { year: string; quarter: string }

export default async function NYS45QuarterPage({ params }: { params: Promise<Params> }) {
  const { year: yearStr, quarter: quarterStr } = await params
  const year = parseInt(yearStr)
  const quarter = parseInt(quarterStr)
  // NaN passes < / > comparisons, so guard with Number.isInteger too.
  if (!year || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) notFound()
  const q = quarter as Quarter

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const startMonth = (q - 1) * 3 + 1
  const endMonth = q * 3
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  const quarterStart = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const quarterEnd = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const yearStart = `${year}-01-01`

  const [
    rates,
    { data: settings },
    { data: yearStubs },
    { data: filing },
  ] = await Promise.all([
    getTaxRatesForYear(supabase, year),
    supabase.from('settings').select('suta_rate').single<Pick<Settings, 'suta_rate'>>(),
    supabase
      .from('paystubs')
      .select('*')
      .gte('pay_date', yearStart)
      .lte('pay_date', quarterEnd)
      .order('pay_date', { ascending: true }),
    supabase
      .from('filings')
      .select('*')
      .eq('filing_type', 'NYS-45')
      .eq('tax_year', year)
      .eq('quarter', q)
      .maybeSingle<Filing>(),
  ])

  if (!rates) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
        <p className="text-sm text-yellow-700">No tax rates seeded for {year}.</p>
      </div>
    )
  }

  const stubsForYear = (yearStubs ?? []) as Paystub[]
  const stubsInQuarter = stubsForYear.filter(s => s.pay_date >= quarterStart)
  const ytdGrossBeforeQuarter = stubsForYear
    .filter(s => s.pay_date < quarterStart)
    .reduce((sum, s) => sum + Number(s.gross_pay), 0)

  const sutaRate = Number(settings?.suta_rate ?? 0)
  const data = calculateNYS45(stubsInQuarter, ytdGrossBeforeQuarter, rates, sutaRate, year, q, stubsForYear)
  const { effective: dueDateEffective, shifted } = shiftedDeadline(data.due_date)
  const fileBy = selfImposedDeadline(dueDateEffective)
  const daysUntilDue = daysUntil(dueDateEffective)
  const daysUntilFileBy = daysUntil(fileBy)
  const isFiled = !!filing?.filed_on
  const isNotApplicable = !!filing?.not_applicable

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto space-y-4">
      <Link href="/filings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" />
        All filings
      </Link>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          NYS-45 · Q{q} {year}
          {isFiled && <Badge className="bg-green-600 hover:bg-green-600">Filed</Badge>}
          {isNotApplicable && <Badge variant="outline" className="text-muted-foreground">Not applicable</Badge>}
        </h1>
        <p className="text-xs text-muted-foreground">
          {formatDate(data.date_range.start)} – {formatDate(data.date_range.end)}
        </p>
        {!isFiled && !isNotApplicable && (
          <div className="text-xs space-y-0.5">
            <p>
              <span className="font-medium text-foreground">File by</span>{' '}
              <span className="text-foreground">{formatDate(fileBy)}</span>
              <span className="text-muted-foreground"> · {daysUntilFileBy < 0 ? 'past your buffer' : daysUntilFileBy === 0 ? 'today' : `${daysUntilFileBy} days`}</span>
            </p>
            <p className="text-muted-foreground">
              Due {formatDate(dueDateEffective)}
              {shifted && <span className="text-yellow-700"> (shifted from {formatDate(data.due_date)})</span>}
              {' · '}
              {daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due today' : `${daysUntilDue} days`}
            </p>
          </div>
        )}
      </div>

      {!data.stub_count ? (
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-sm text-muted-foreground">
              No paystubs in this quarter. NYS-45 still required even with zero wages. File a no-payroll return.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Part A — UI */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Part A: Unemployment Insurance</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <BoxRow box="2" label="Total UI quarterly remuneration" value={data.ui_gross_wages} />
              <BoxRow box="3" label="Quarterly remuneration in excess of UI wage base" value={data.ui_excess_wages} />
              <BoxRow box="4" label="UI taxable wages" value={data.ui_taxable_wages} />
              <BoxRow
                box="5"
                label="UI contributions due"
                value={data.ui_tax_due}
                hint={`Wage base $${Number(rates.suta_wage_base).toLocaleString()} · rate ${parseFloat((sutaRate * 100).toFixed(3))}%`}
              />
              <BoxRow
                box="6"
                label="Re-employment Service Fund (RSF) contribution"
                value={data.rsf}
                hint={`Box 4 × ${(Number(rates.rsf_rate ?? 0.00075) * 100).toFixed(3)}%`}
              />
              <BoxRow
                box=""
                label="Total UI amount due"
                value={data.total_ui_due}
                hint="Boxes 5 + 6, rounded on the sum to match NY DOL's online total. Can differ by a penny from adding the rounded boxes."
              />
            </CardContent>
          </Card>

          {/* Part A — Employee counts */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Part A: Covered Employees (12th of each month)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              {data.employee_counts_by_month.map((count, i) => {
                const monthNum = (q - 1) * 3 + 1 + i
                const monthName = new Date(year, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' })
                return (
                  <BoxRow
                    key={i}
                    box=""
                    label={`${monthName}: employees on the 12th`}
                    value={count}
                    mono={false}
                  />
                )
              })}
              <p className="text-[11px] text-muted-foreground pt-1">
                Count of covered employees who worked during (or received pay for) the pay period that includes the 12th of each month.
              </p>
            </CardContent>
          </Card>

          {/* Part B — Withholding */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Part B: Withholding</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <BoxRow box="12" label="NY State income tax withheld" value={data.ny_state_tax_withheld} />
              <BoxRow box="13" label="NYC income tax withheld" value={0} hint="Not applicable (Nassau resident)" />
              <BoxRow box="14" label="Yonkers income tax withheld" value={0} hint="Not applicable" />
              <BoxRow box="15" label="Total income tax withheld" value={data.total_tax_withheld} />
            </CardContent>
          </Card>

          {/* Federal — informational */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Federal: for your records</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <BoxRow
                box=""
                label="Federal income tax withheld this quarter"
                value={data.fed_income_tax_withheld}
                hint="Not on NYS-45. Used for federal estimated taxes / Schedule H."
              />
              <BoxRow box="" label="Stub count" value={data.stub_count} mono={false} />
            </CardContent>
          </Card>
        </>
      )}

      <MarkFiledForm
        existing={filing ?? null}
        filingType="NYS-45"
        taxYear={year}
        quarter={q}
        createdBy={user.id}
        computedAmount={data.total_ui_due + data.total_tax_withheld}
      />

      <a
        href="https://www.tax.ny.gov/bus/ads/efile_addnys45.htm"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Button variant="outline" className="w-full">
          <ExternalLink className="h-4 w-4 mr-2" />
          File NYS-45 on tax.ny.gov
        </Button>
      </a>
    </div>
  )
}

function BoxRow({
  box,
  label,
  value,
  hint,
  mono = true,
}: {
  box: string
  label: string
  value: number
  hint?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      {box && <span className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1 w-8 flex-shrink-0">Box {box}</span>}
      {!box && <span className="w-8 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={mono ? 'font-mono text-sm' : 'text-sm'}>
          {mono ? formatCurrency(value) : value}
        </span>
        {mono && <CopyValue value={value} label={label} />}
      </div>
    </div>
  )
}
