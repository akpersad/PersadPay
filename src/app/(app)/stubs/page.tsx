import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateRange, formatCurrency } from '@/lib/dates'
import { CheckCircle2, AlertCircle, PlusCircle, PiggyBank, CalendarDays, FileText } from 'lucide-react'
import { ExportCsvButton } from '@/components/stubs/ExportCsvButton'
import { StubYearFilter } from '@/components/stubs/StubYearFilter'
import type { Paystub, Profile } from '@/lib/types'

interface Props {
  searchParams: Promise<{ year?: string }>
}

export default async function StubsPage({ searchParams }: Props) {
  const { year } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  const query = supabase
    .from('paystubs')
    .select('*')
    .order('stub_number', { ascending: false })

  if (profile?.role === 'employee') {
    query.eq('employee_id', user.id)
  }

  const { data: stubs } = await query

  const currentYear = new Date().getFullYear()
  const selectedYear = year ?? String(currentYear)

  // Derive available years from all fetched stubs
  const availableYears = stubs?.length
    ? [...new Set(stubs.map(s => parseInt((s as Paystub).pay_date.slice(0, 4))))]
        .sort((a, b) => b - a)
    : [currentYear]

  // Filter displayed stubs by selected year
  const filteredStubs = selectedYear === 'all'
    ? (stubs as Paystub[] | null)
    : (stubs as Paystub[] | null)?.filter(s => s.pay_date.startsWith(selectedYear))

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 max-w-lg md:max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pay Stubs</h1>
        {profile?.role === 'admin' && (
          <div className="flex gap-2">
            <Link href="/calendar" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              <CalendarDays className="h-4 w-4 mr-1" />
              Calendar
            </Link>
            <Link href="/stubs/new" className={cn(buttonVariants({ size: 'sm' }))}>
              <PlusCircle className="h-4 w-4 mr-1" />
              New
            </Link>
          </div>
        )}
      </div>

      {/* Year filter + CSV export row */}
      {stubs?.length ? (
        <div className="flex items-center justify-between">
          <StubYearFilter years={availableYears} selected={selectedYear} />
          {profile?.role === 'admin' && (
            <ExportCsvButton
              availableYears={availableYears}
              defaultYear={selectedYear === 'all' ? currentYear : parseInt(selectedYear)}
            />
          )}
        </div>
      ) : null}

      {!filteredStubs?.length ? (
        stubs?.length ? (
          <p className="text-sm text-muted-foreground">No stubs for {selectedYear}.</p>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No pay stubs yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {profile?.role === 'admin'
                  ? 'Generate your first stub to start tracking payroll.'
                  : 'Your pay stubs will appear here once your employer generates them.'}
              </p>
            </div>
            {profile?.role === 'admin' && (
              <Link href="/stubs/new" className={cn(buttonVariants({ size: 'sm' }))}>
                <PlusCircle className="h-4 w-4 mr-2" />
                Generate First Stub
              </Link>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {filteredStubs.map(stub => (
            <Link key={stub.id} href={`/stubs/${stub.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      #{stub.stub_number} · {formatDateRange(stub.pay_period_start, stub.pay_period_end)}
                    </p>
                    <p className="text-sm text-muted-foreground font-mono">{formatCurrency(Number(stub.gross_pay))}</p>
                  </div>
                  {profile?.role === 'admin' && (
                    <div className="flex gap-1.5">
                      <span aria-label={stub.payment_sent ? 'Payment sent' : 'Payment pending'}>
                        {stub.payment_sent
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-yellow-500" />
                        }
                      </span>
                      <span aria-label={stub.stub_sent ? 'Stub emailed' : 'Not emailed'}>
                        {stub.stub_sent
                          ? <CheckCircle2 className="h-4 w-4 text-blue-500" />
                          : <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        }
                      </span>
                      <span aria-label={stub.hysa_transferred ? 'Money moved to HYSA' : 'HYSA transfer pending'}>
                        <PiggyBank className={cn('h-4 w-4', stub.hysa_transferred ? 'text-green-600' : 'text-muted-foreground')} />
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
