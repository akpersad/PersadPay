import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { formatDate, formatCurrency, daysUntil, shiftedDeadline, selfImposedDeadline } from '@/lib/dates'
import { calculateScheduleH } from '@/lib/filings'
import { getTaxRatesForYear } from '@/lib/tax'
import { CopyValue } from '@/components/filings/CopyValue'
import { MarkFiledForm } from '@/components/filings/MarkFiledForm'
import type { Profile, Paystub, Filing } from '@/lib/types'

interface Params { year: string }

export default async function ScheduleHYearPage({ params }: { params: Promise<Params> }) {
  const { year: yearStr } = await params
  const year = parseInt(yearStr)
  if (!year) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    rates,
    { data: yearStubs },
    { data: filing },
  ] = await Promise.all([
    getTaxRatesForYear(supabase, year),
    supabase
      .from('paystubs')
      .select('*')
      .gte('pay_date', `${year}-01-01`)
      .lte('pay_date', `${year}-12-31`)
      .order('pay_date', { ascending: true }),
    supabase
      .from('filings')
      .select('*')
      .eq('filing_type', 'Schedule H')
      .eq('tax_year', year)
      .maybeSingle<Filing>(),
  ])

  if (!rates) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
        <p className="text-sm text-yellow-700">No tax rates seeded for {year}.</p>
      </div>
    )
  }

  const data = calculateScheduleH((yearStubs ?? []) as Paystub[], rates, year)
  const { effective: dueDateEffective, shifted } = shiftedDeadline(data.due_date)
  const fileBy = selfImposedDeadline(dueDateEffective)
  const daysUntilDue = daysUntil(dueDateEffective)
  const daysUntilFileBy = daysUntil(fileBy)
  const isFiled = !!filing?.filed_on

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto space-y-4">
      <Link href="/filings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" />
        All filings
      </Link>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          Schedule H · {year}
          {isFiled && <Badge className="bg-green-600 hover:bg-green-600">Filed</Badge>}
        </h1>
        <p className="text-xs text-muted-foreground">
          Files with federal Form 1040
        </p>
        {!isFiled && (
          <div className="text-xs space-y-0.5">
            <p>
              <span className="font-medium text-foreground">File by</span>{' '}
              <span className="text-foreground">{formatDate(fileBy)}</span>
              <span className="text-muted-foreground"> · {daysUntilFileBy <= 0 ? 'past your buffer' : `${daysUntilFileBy} days`}</span>
            </p>
            <p className="text-muted-foreground">
              Due {formatDate(dueDateEffective)}
              {shifted && <span className="text-yellow-700"> (shifted from {formatDate(data.due_date)})</span>}
              {' · '}
              {daysUntilDue <= 0 ? 'overdue' : `${daysUntilDue} days`}
            </p>
          </div>
        )}
      </div>

      {!data.stub_count ? (
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-sm text-muted-foreground">
              No paystubs in {year}. Schedule H may not be required if no household wages were paid.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Threshold check */}
          {(!data.fica_threshold_met || !data.futa_threshold_met) && (
            <Card>
              <CardContent className="py-3 px-4 text-xs space-y-1">
                {!data.fica_threshold_met && (
                  <p className="text-yellow-700">
                    FICA threshold ({formatCurrency(Number(rates.fica_household_threshold))}/yr per IRS Pub 926) not met — Lines 1a–2b will be $0.
                  </p>
                )}
                {!data.futa_threshold_met && (
                  <p className="text-yellow-700">
                    FUTA threshold ($1,000/quarter per IRS Pub 926) not met — Lines 7–8 will be $0.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Social Security */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Social Security</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <LineRow line="1a" label="Cash wages subject to social security tax" value={data.ss_wages} />
              <LineRow
                line="1b"
                label="Social security tax (Line 1a × 12.4%)"
                value={data.ss_tax}
                hint="Combined employee 6.2% + employer 6.2%"
              />
            </CardContent>
          </Card>

          {/* Medicare */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Medicare</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <LineRow line="2a" label="Cash wages subject to Medicare tax" value={data.medicare_wages} />
              <LineRow
                line="2b"
                label="Medicare tax (Line 2a × 2.9%)"
                value={data.medicare_tax}
                hint="Combined employee 1.45% + employer 1.45%"
              />
            </CardContent>
          </Card>

          {/* Federal Income Tax + subtotal */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Federal Income Tax</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <LineRow line="5" label="Federal income tax withheld" value={data.fed_income_tax_withheld} />
              <LineRow
                line="6"
                label="Total social security, Medicare, and income taxes"
                value={data.line_6_total}
                hint="Lines 1b + 2b + 5"
              />
            </CardContent>
          </Card>

          {/* FUTA */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Federal Unemployment (Section A)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <LineRow
                line="7"
                label="Cash wages subject to FUTA tax"
                value={data.futa_wages}
                hint={`Capped at $${Number(rates.futa_wage_base).toLocaleString()}`}
              />
              <LineRow
                line="8"
                label="FUTA tax (Line 7 × 0.6%)"
                value={data.futa_tax}
                hint="Single-state employer (NY, paid SUTA)"
              />
            </CardContent>
          </Card>

          {/* Total */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Total</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <LineRow
                line="9"
                label="Total household employment taxes"
                value={data.total_household_employment_taxes}
                hint="Add to Form 1040 line for other taxes"
                emphasized
              />
            </CardContent>
          </Card>
        </>
      )}

      <MarkFiledForm
        existing={filing ?? null}
        filingType="Schedule H"
        taxYear={year}
        quarter={null}
        createdBy={user.id}
        computedAmount={data.total_household_employment_taxes}
      />

      <a
        href="https://www.irs.gov/forms-pubs/about-schedule-h-form-1040"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Button variant="outline" className="w-full">
          <ExternalLink className="h-4 w-4 mr-2" />
          About Schedule H on irs.gov
        </Button>
      </a>

      <a
        href="https://www.irs.gov/publications/p926"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Button variant="outline" className="w-full h-auto py-2 whitespace-normal text-center">
          <ExternalLink className="h-4 w-4 mr-2 shrink-0" />
          IRS Publication 926 — Household Employer&apos;s Tax Guide
        </Button>
      </a>
    </div>
  )
}

function LineRow({
  line,
  label,
  value,
  hint,
  emphasized = false,
}: {
  line: string
  label: string
  value: number
  hint?: string
  emphasized?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1 w-10 flex-shrink-0">
        Line {line}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${emphasized ? 'font-semibold' : ''}`}>{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`font-mono ${emphasized ? 'text-base font-semibold' : 'text-sm'}`}>
          {formatCurrency(value)}
        </span>
        <CopyValue value={value} label={label} />
      </div>
    </div>
  )
}
