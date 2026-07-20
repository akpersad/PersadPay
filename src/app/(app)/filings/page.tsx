import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, CheckCircle2, MinusCircle } from 'lucide-react'
import { formatDate, formatDateRange, formatCurrency, daysUntil, shiftedDeadline } from '@/lib/dates'
import {
  getCurrentQuarter,
  getQuarterDateRange,
  getQuarterDueDate,
  getScheduleHDueDate,
  getFederalEstimatedTaxDueDate,
  getFederalEstimatedTaxPeriod,
  type Quarter,
} from '@/lib/filings'
import type { Profile, Paystub, Filing } from '@/lib/types'

export default async function FilingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { year: currentYear } = getCurrentQuarter()

  const [{ data: stubs }, { data: filings }] = await Promise.all([
    supabase.from('paystubs').select('id, pay_date, gross_pay').order('pay_date', { ascending: true }),
    supabase.from('filings').select('*'),
  ])

  const stubsByQuarter: Record<string, { count: number; gross: number }> = {}
  // 1040-ES uses IRS fiscal periods (Jan–Mar / Apr–May / Jun–Aug / Sep–Dec),
  // not calendar quarters, so it needs its own grouping.
  const stubsByFedPeriod: Record<string, { count: number; gross: number }> = {}
  let earliestYear = currentYear
  for (const s of (stubs ?? []) as Pick<Paystub, 'id' | 'pay_date' | 'gross_pay'>[]) {
    const y = parseInt(s.pay_date.slice(0, 4))
    const m = parseInt(s.pay_date.slice(5, 7))
    const q = Math.ceil(m / 3)
    const fedQ = m <= 3 ? 1 : m <= 5 ? 2 : m <= 8 ? 3 : 4
    const key = `${y}-${q}`
    if (!stubsByQuarter[key]) stubsByQuarter[key] = { count: 0, gross: 0 }
    stubsByQuarter[key].count += 1
    stubsByQuarter[key].gross += Number(s.gross_pay)
    const fedKey = `${y}-${fedQ}`
    if (!stubsByFedPeriod[fedKey]) stubsByFedPeriod[fedKey] = { count: 0, gross: 0 }
    stubsByFedPeriod[fedKey].count += 1
    stubsByFedPeriod[fedKey].gross += Number(s.gross_pay)
    if (y < earliestYear) earliestYear = y
  }

  const filingMap = new Map<string, Filing>()
  for (const f of (filings ?? []) as Filing[]) {
    const key =
      f.filing_type === 'NYS-45' ? `nys45-${f.tax_year}-${f.quarter}` :
      f.filing_type === 'Federal Estimated Tax' ? `fed1040es-${f.tax_year}-${f.quarter}` :
      `sh-${f.tax_year}`
    filingMap.set(key, f)
  }

  const years: number[] = []
  for (let y = currentYear; y >= earliestYear; y--) years.push(y)

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Filings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Quarterly NYS-45 and annual Schedule H. Numbers are computed live from stored paystubs.
        </p>
      </div>

      {!stubs?.length && (
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-sm text-muted-foreground">
              No paystubs yet. Generate at least one stub to populate filing data.
            </p>
          </CardContent>
        </Card>
      )}

      {years.map(year => (
        <YearSection
          key={year}
          year={year}
          stubsByQuarter={stubsByQuarter}
          stubsByFedPeriod={stubsByFedPeriod}
          filingMap={filingMap}
          isCurrentYear={year === currentYear}
        />
      ))}
    </div>
  )
}

function YearSection({
  year,
  stubsByQuarter,
  stubsByFedPeriod,
  filingMap,
  isCurrentYear,
}: {
  year: number
  stubsByQuarter: Record<string, { count: number; gross: number }>
  stubsByFedPeriod: Record<string, { count: number; gross: number }>
  filingMap: Map<string, Filing>
  isCurrentYear: boolean
}) {
  const quarters: Quarter[] = [1, 2, 3, 4]
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{year}</h2>
      <div className="space-y-5">
        {quarters.map(q => {
          const data = stubsByQuarter[`${year}-${q}`]
          const fedData = stubsByFedPeriod[`${year}-${q}`]
          const nysFiling = filingMap.get(`nys45-${year}-${q}`)
          const fedFiling = filingMap.get(`fed1040es-${year}-${q}`)
          const range = getQuarterDateRange(year, q)
          const fedPeriod = getFederalEstimatedTaxPeriod(year, q)

          return (
            <div key={q}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Q{q} · {formatDate(range.start)} – {formatDate(range.end)}</p>
              <div>
                <FilingRow
                  href={`/filings/nys-45/${year}/${q}`}
                  title="NYS-45"
                  subtitle="NY State quarterly unemployment"
                  rangeText={data ? `${data.count} stubs · ${formatCurrency(data.gross)} gross` : 'No stubs'}
                  dueDate={getQuarterDueDate(year, q)}
                  filed={nysFiling}
                  threshold={20}
                />
                <FilingRow
                  href={`/filings/federal-estimated-tax/${year}/${q}`}
                  title="1040-ES"
                  subtitle={`Federal estimated tax · IRS · covers ${formatDateRange(fedPeriod.start, fedPeriod.end)}`}
                  rangeText={fedData ? `${fedData.count} stubs covered` : 'No stubs'}
                  dueDate={getFederalEstimatedTaxDueDate(year, q)}
                  filed={fedFiling}
                  threshold={30}
                  className="mt-2"
                />
              </div>
            </div>
          )
        })}

        {/* Schedule H + Year-end packet — only for past years */}
        {!isCurrentYear && (
          <>
            <ScheduleHRow year={year} filing={filingMap.get(`sh-${year}`) ?? null} />
            <YearEndPacketRow year={year} />
          </>
        )}
      </div>
    </section>
  )
}

function YearEndPacketRow({ year }: { year: number }) {
  return (
    <Link href={`/filings/year-end/${year}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Year-end packet · {year}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              W-2 + W-3 + Schedule H + every paystub in one PDF for the CPA
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </CardContent>
      </Card>
    </Link>
  )
}

function FilingRow({
  href,
  title,
  subtitle,
  rangeText,
  dueDate,
  filed,
  threshold,
  className,
}: {
  href: string
  title: string
  subtitle: string
  rangeText: string
  dueDate: string
  filed: Filing | undefined
  threshold: number
  className?: string
}) {
  const days = daysUntil(shiftedDeadline(dueDate).effective)
  return (
    <Link href={href}>
      <Card className={`hover:bg-muted/50 transition-colors cursor-pointer${className ? ` ${className}` : ''}`}>
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{title}</p>
              {filed?.not_applicable
                ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    <MinusCircle className="h-3 w-3 mr-1" />
                    Not applicable
                  </Badge>
                )
                : filed?.filed_on
                  ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Filed {formatDate(filed.filed_on)}
                    </Badge>
                  )
                  : days < 0
                    ? <Badge variant="destructive">Overdue</Badge>
                    : days === 0
                      ? <Badge variant="destructive">Due today</Badge>
                      : days <= threshold
                        ? <Badge variant="secondary">Due in {days}d</Badge>
                        : null
              }
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {subtitle} · Due {formatDate(dueDate)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{rangeText}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </CardContent>
      </Card>
    </Link>
  )
}

function ScheduleHRow({ year, filing }: { year: number; filing: Filing | null }) {
  const due = getScheduleHDueDate(year)
  const days = daysUntil(shiftedDeadline(due).effective)
  return (
    <Link href={`/filings/schedule-h/${year}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Schedule H {year}</p>
              {filing?.not_applicable
                ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    <MinusCircle className="h-3 w-3 mr-1" />
                    Not applicable
                  </Badge>
                )
                : filing?.filed_on
                  ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Filed
                    </Badge>
                  )
                  : days < 0
                    ? <Badge variant="destructive">Overdue</Badge>
                    : days === 0
                      ? <Badge variant="destructive">Due today</Badge>
                      : days <= 30
                        ? <Badge variant="secondary">Due in {days}d</Badge>
                        : null
              }
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Annual federal household employment taxes · Due {formatDate(due)}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </CardContent>
      </Card>
    </Link>
  )
}
