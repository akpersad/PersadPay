import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateRange, formatCurrency } from '@/lib/dates'
import { CheckCircle2, AlertCircle, PlusCircle, PiggyBank } from 'lucide-react'
import { ExportCsvButton } from '@/components/stubs/ExportCsvButton'
import type { Paystub, Profile } from '@/lib/types'

export default async function StubsPage() {
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

  // Derive years available for CSV export (admin only) from the earliest stub.
  const currentYear = new Date().getFullYear()
  const earliestYear = stubs?.length
    ? Math.min(...stubs.map(s => parseInt((s as Paystub).pay_date.slice(0, 4))))
    : currentYear
  const availableYears: number[] = []
  for (let y = currentYear; y >= earliestYear; y--) availableYears.push(y)

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pay Stubs</h1>
        {profile?.role === 'admin' && (
          <Link href="/stubs/new" className={cn(buttonVariants({ size: 'sm' }))}>
            <PlusCircle className="h-4 w-4 mr-1" />
            New
          </Link>
        )}
      </div>

      {profile?.role === 'admin' && stubs?.length ? (
        <div className="flex justify-end">
          <ExportCsvButton availableYears={availableYears} defaultYear={currentYear} />
        </div>
      ) : null}

      {!stubs?.length ? (
        <p className="text-sm text-muted-foreground">No stubs yet.</p>
      ) : (
        <div className="space-y-2">
          {(stubs as Paystub[]).map(stub => (
            <Link key={stub.id} href={`/stubs/${stub.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      #{stub.stub_number} · {formatDateRange(stub.pay_period_start, stub.pay_period_end)}
                    </p>
                    <p className="text-sm text-muted-foreground">{formatCurrency(Number(stub.gross_pay))}</p>
                  </div>
                  {profile?.role === 'admin' && (
                    <div className="flex gap-1.5">
                      <span aria-label={stub.payment_sent ? 'Payment sent' : 'Payment pending'}>
                        {stub.payment_sent
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <AlertCircle className="h-4 w-4 text-amber-500" />
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
