import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import { formatDate, daysUntil } from '@/lib/dates'
import {
  getCurrentQuarter,
  getQuarterDateRange,
  getQuarterDueDate,
  getScheduleHDueDate,
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
  let earliestYear = currentYear
  for (const s of (stubs ?? []) as Pick<Paystub, 'id' | 'pay_date' | 'gross_pay'>[]) {
    const y = parseInt(s.pay_date.slice(0, 4))
    const m = parseInt(s.pay_date.slice(5, 7))
    const q = Math.ceil(m / 3)
    const key = `${y}-${q}`
    if (!stubsByQuarter[key]) stubsByQuarter[key] = { count: 0, gross: 0 }
    stubsByQuarter[key].count += 1
    stubsByQuarter[key].gross += Number(s.gross_pay)
    if (y < earliestYear) earliestYear = y
  }

  const filingMap = new Map<string, Filing>()
  for (const f of (filings ?? []) as Filing[]) {
    const key = f.filing_type === 'NYS-45'
      ? `nys45-${f.tax_year}-${f.quarter}`
      : `sh-${f.tax_year}`
    filingMap.set(key, f)
  }

  const years: number[] = []
  for (let y = currentYear; y >= earliestYear; y--) years.push(y)

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto space-y-5">
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
  filingMap,
  isCurrentYear,
}: {
  year: number
  stubsByQuarter: Record<string, { count: number; gross: number }>
  filingMap: Map<string, Filing>
  isCurrentYear: boolean
}) {
  const quarters: Quarter[] = [1, 2, 3, 4]
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{year}</h2>
      <div className="space-y-1.5">
        {quarters.map(q => {
          const data = stubsByQuarter[`${year}-${q}`]
          const filing = filingMap.get(`nys45-${year}-${q}`)
          const range = getQuarterDateRange(year, q)
          const due = getQuarterDueDate(year, q)
          const days = daysUntil(due)

          return (
            <Link key={q} href={`/filings/nys-45/${year}/${q}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Q{q} NYS-45</p>
                      {filing?.filed_on
                        ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Filed {formatDate(filing.filed_on)}
                          </Badge>
                        )
                        : days <= 0
                          ? <Badge variant="destructive">Overdue</Badge>
                          : days <= 20
                            ? <Badge variant="secondary">Due in {days}d</Badge>
                            : null
                      }
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(range.start)} – {formatDate(range.end)} · Due {formatDate(due)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {data ? `${data.count} stubs · $${data.gross.toFixed(2)} gross` : 'No stubs'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          )
        })}

        {/* Schedule H — only show for past years and once Dec 31 has passed for current */}
        {!isCurrentYear && (
          <ScheduleHRow year={year} filing={filingMap.get(`sh-${year}`) ?? null} />
        )}
      </div>
    </section>
  )
}

function ScheduleHRow({ year, filing }: { year: number; filing: Filing | null }) {
  const due = getScheduleHDueDate(year)
  const days = daysUntil(due)
  return (
    <Link href={`/filings/schedule-h/${year}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Schedule H {year}</p>
              {filing?.filed_on
                ? (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Filed
                  </Badge>
                )
                : days <= 0
                  ? <Badge variant="destructive">Overdue</Badge>
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
