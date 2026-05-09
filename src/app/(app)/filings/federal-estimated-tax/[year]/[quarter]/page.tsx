import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { formatDate, formatCurrency, daysUntil, shiftedDeadline, selfImposedDeadline } from '@/lib/dates'
import { calculateFederalEstimatedTax, getFederalEstimatedTaxPeriod, type Quarter } from '@/lib/filings'
import { CopyValue } from '@/components/filings/CopyValue'
import { MarkFiledForm } from '@/components/filings/MarkFiledForm'
import type { Profile, Paystub, Filing } from '@/lib/types'

interface Params { year: string; quarter: string }

export default async function FederalEstimatedTaxQuarterPage({ params }: { params: Promise<Params> }) {
  const { year: yearStr, quarter: quarterStr } = await params
  const year = parseInt(yearStr)
  const quarter = parseInt(quarterStr)
  if (!year || quarter < 1 || quarter > 4) notFound()
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

  // IRS Form 1040-ES uses non-calendar fiscal periods (3/2/3/4 months).
  // Use those, not the calendar-quarter range that NYS-45 uses.
  const period = getFederalEstimatedTaxPeriod(year, q)

  const [{ data: stubsInPeriod }, { data: filing }] = await Promise.all([
    supabase
      .from('paystubs')
      .select('*')
      .gte('pay_date', period.start)
      .lte('pay_date', period.end)
      .order('pay_date', { ascending: true }),
    supabase
      .from('filings')
      .select('*')
      .eq('filing_type', 'Federal Estimated Tax')
      .eq('tax_year', year)
      .eq('quarter', q)
      .maybeSingle<Filing>(),
  ])

  const data = calculateFederalEstimatedTax((stubsInPeriod ?? []) as Paystub[], year, q)
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
          Federal Estimated Tax · Q{q} {year}
          {isFiled && <Badge className="bg-green-600 hover:bg-green-600">Paid</Badge>}
          {isNotApplicable && <Badge variant="outline" className="text-muted-foreground">Not applicable</Badge>}
        </h1>
        <p className="text-xs text-muted-foreground">
          Form 1040-ES · IRS fiscal period {formatDate(data.date_range.start)} – {formatDate(data.date_range.end)}
        </p>
        {!isFiled && !isNotApplicable && (
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
              No paystubs in this quarter. No federal estimated tax payment needed for Q{q}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* What to send */}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Send via Form 1040-ES</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2">
              <LineRow label="Social Security tax (12.4% combined)" value={data.ss_combined} hint="Employee 6.2% + employer 6.2% — Schedule H Line 1b slice" />
              <LineRow label="Medicare tax (2.9% combined)" value={data.medicare_combined} hint="Employee 1.45% + employer 1.45% — Schedule H Line 2b slice" />
              <LineRow label="Federal income tax withheld" value={data.fed_income_tax_withheld} hint="Schedule H Line 5 slice" />
              <LineRow label="FUTA" value={data.futa} hint="Capped at $7,000 wage base annually — Schedule H Line 8 slice" />
              <div className="flex items-start gap-3 pt-2 border-t">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground pt-1 w-10 flex-shrink-0">Total</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Move from HYSA to IRS this quarter</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-mono text-base font-semibold">{formatCurrency(data.total_due)}</span>
                  <CopyValue value={data.total_due} label="Federal estimated tax payment" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">How to pay</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-2 text-xs text-muted-foreground">
              <p>Two options for sending Form 1040-ES payments to the IRS:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>EFTPS</strong> (Electronic Federal Tax Payment System) — free, requires enrollment.</li>
                <li><strong>IRS Direct Pay</strong> — free, no enrollment, pay directly from a bank account.</li>
              </ul>
              <p className="pt-1">
                Save your confirmation number — it&apos;s your only audit trail until Schedule H reconciles in April. Then come back and use the form below to mark this quarter paid.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <MarkFiledForm
        existing={filing ?? null}
        filingType="Federal Estimated Tax"
        taxYear={year}
        quarter={q}
        createdBy={user.id}
        computedAmount={data.total_due}
      />

      <a
        href="https://directpay.irs.gov/"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Button variant="outline" className="w-full">
          <ExternalLink className="h-4 w-4 mr-2" />
          Open IRS Direct Pay
        </Button>
      </a>
      <a
        href="https://www.eftps.gov"
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Button variant="outline" className="w-full">
          <ExternalLink className="h-4 w-4 mr-2" />
          Open EFTPS
        </Button>
      </a>
    </div>
  )
}

function LineRow({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="font-mono text-sm">{formatCurrency(value)}</span>
        <CopyValue value={value} label={label} />
      </div>
    </div>
  )
}
