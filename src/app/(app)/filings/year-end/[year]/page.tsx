import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Download, ExternalLink } from 'lucide-react'
import { formatDate, formatCurrency, daysUntil, shiftedDeadline, selfImposedDeadline } from '@/lib/dates'
import { calculateScheduleH, getScheduleHDueDate } from '@/lib/filings'
import { getTaxRatesForYear } from '@/lib/tax'
import type { Profile, Paystub, Filing, W2 } from '@/lib/types'

interface Params { year: string }

export default async function YearEndPage({ params }: { params: Promise<Params> }) {
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
    { data: schedHFiling },
    { data: w2 },
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
    supabase
      .from('w2s')
      .select('*')
      .eq('tax_year', year)
      .maybeSingle<W2>(),
  ])

  if (!rates) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
        <p className="text-sm text-yellow-700">No tax rates seeded for {year}.</p>
      </div>
    )
  }

  const stubs = (yearStubs ?? []) as Paystub[]
  const scheduleHData = calculateScheduleH(stubs, rates, year)
  const totalGross = stubs.reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const totalNet = stubs.reduce((sum, s) => sum + Number(s.net_pay), 0)

  // W-2 / W-3 deadline: Jan 31 of year+1 (shifted to next business day if weekend)
  const w2DueRaw = `${year + 1}-01-31`
  const { effective: w2Due, shifted: w2Shifted } = shiftedDeadline(w2DueRaw)
  const w2FileBy = selfImposedDeadline(w2Due)
  const w2Days = daysUntil(w2Due)
  const w2FileByDays = daysUntil(w2FileBy)

  // Schedule H deadline
  const schedHDueRaw = getScheduleHDueDate(year)
  const { effective: schedHDue, shifted: schedHShifted } = shiftedDeadline(schedHDueRaw)
  const schedHFileBy = selfImposedDeadline(schedHDue)
  const schedHDays = daysUntil(schedHDue)
  const schedHFileByDays = daysUntil(schedHFileBy)

  const isFiled = !!schedHFiling?.filed_on
  const w2Ready = !!w2

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg mx-auto space-y-4">
      <Link href="/filings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" />
        All filings
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Year-end · {year}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {stubs.length} stubs · {formatCurrency(totalGross)} gross paid · {formatCurrency(totalNet)} net to babysitter
        </p>
      </div>

      {/* W-2 / W-3 card */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>W-2 / W-3 to employee + SSA</span>
            {w2Ready
              ? <Badge variant="outline">Generated</Badge>
              : <Badge variant="secondary">Not yet generated</Badge>
            }
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-2 text-sm">
          <div className="text-xs space-y-0.5">
            <p>
              <span className="font-medium text-foreground">File by</span>{' '}
              <span className="text-foreground">{formatDate(w2FileBy)}</span>
              <span className="text-muted-foreground"> · {w2FileByDays <= 0 ? 'past your buffer' : `${w2FileByDays} days`}</span>
            </p>
            <p className="text-muted-foreground">
              Due {formatDate(w2Due)}
              {w2Shifted && <span className="text-yellow-700"> (shifted from {formatDate(w2DueRaw)})</span>}
              {' · '}
              {w2Days <= 0 ? 'overdue' : `${w2Days} days`}
            </p>
            <p className="text-muted-foreground">
              Furnish W-2 to babysitter + file W-2 Copy A + W-3 transmittal with SSA.
            </p>
          </div>
          {w2Ready && w2 && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              <a href={`/api/pdf/w2?id=${w2.id}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="w-full">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  W-2 PDF
                </Button>
              </a>
              <a href={`/api/pdf/w3?id=${w2.id}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="w-full">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  W-3 PDF
                </Button>
              </a>
            </div>
          )}
          {!w2Ready && (
            <Link href="/w2" className="text-sm text-primary hover:underline inline-flex items-center">
              Generate W-2 →
            </Link>
          )}
          <a
            href="https://www.ssa.gov/bso/bsowelcome.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center pt-1"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            File via SSA Business Services Online
          </a>
        </CardContent>
      </Card>

      {/* Schedule H card */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Schedule H · {year}</span>
            {isFiled && <Badge className="bg-green-600 hover:bg-green-600">Filed</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total household employment taxes</span>
            <span className="font-medium">{formatCurrency(scheduleHData.total_household_employment_taxes)}</span>
          </div>
          {!isFiled ? (
            <div className="text-xs space-y-0.5">
              <p>
                <span className="font-medium text-foreground">File by</span>{' '}
                <span className="text-foreground">{formatDate(schedHFileBy)}</span>
                <span className="text-muted-foreground"> · {schedHFileByDays <= 0 ? 'past your buffer' : `${schedHFileByDays} days`}</span>
              </p>
              <p className="text-muted-foreground">
                Due {formatDate(schedHDue)}
                {schedHShifted && <span className="text-yellow-700"> (shifted from {formatDate(schedHDueRaw)})</span>}
                {' · '}
                {schedHDays <= 0 ? 'overdue' : `${schedHDays} days`}
              </p>
              <p className="text-muted-foreground">Files with Form 1040.</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Filed {schedHFiling?.filed_on ? formatDate(schedHFiling.filed_on) : ''}.
            </p>
          )}
          <Link href={`/filings/schedule-h/${year}`} className="text-sm text-primary hover:underline inline-flex items-center">
            Open Schedule H worksheet →
          </Link>
        </CardContent>
      </Card>

      {/* Year-end PDF packet */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm">Accountant PDF packet</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">
            One PDF combining every paystub + W-2 + W-3 (if generated) for the year.
            Hand to your CPA at tax time.
          </p>
          <a href={`/api/pdf/year-end-packet?year=${year}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download year-end packet ({year})
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  )
}
