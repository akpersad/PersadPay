import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateRange, formatCurrency, formatDate } from '@/lib/dates'
import type { Paystub } from '@/lib/types'

export async function EmployeeDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: latestStub } = await supabase
    .from('paystubs')
    .select('*')
    .eq('employee_id', user.id)
    .order('stub_number', { ascending: false })
    .limit(1)
    .single<Paystub>()

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold">Your Pay</h1>

      {latestStub ? (
        <Link href={`/stubs/${latestStub.id}`}>
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="py-4 px-4 space-y-1">
              <p className="text-xs text-muted-foreground">Most Recent Pay Stub</p>
              <p className="text-sm font-medium">
                {formatDateRange(latestStub.pay_period_start, latestStub.pay_period_end)}
              </p>
              <p className="text-xs text-muted-foreground">
                Pay date: {formatDate(latestStub.pay_date)}
              </p>
              <div className="flex gap-6 pt-1">
                <div>
                  <p className="text-xs text-muted-foreground">Gross</p>
                  <p className="text-base font-semibold">{formatCurrency(Number(latestStub.gross_pay))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Pay</p>
                  <p className="text-base font-semibold">{formatCurrency(Number(latestStub.net_pay))}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-sm text-muted-foreground">No pay stubs yet.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <Link href="/stubs" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          View All Pay Stubs
        </Link>
        <Link href="/w2" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          View W-2s
        </Link>
      </div>
    </div>
  )
}
