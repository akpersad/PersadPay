import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDateRange, formatCurrency, formatDate } from '@/lib/dates'
import { FileText } from 'lucide-react'
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
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
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
                  <p className="text-base font-semibold font-mono">{formatCurrency(Number(latestStub.gross_pay))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net Pay</p>
                  <p className="text-base font-semibold font-mono">{formatCurrency(Number(latestStub.net_pay))}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ) : (
        <Card>
          <CardContent className="py-8 px-4 flex flex-col items-center text-center gap-2">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No pay stubs yet</p>
            <p className="text-xs text-muted-foreground">Your pay stubs will appear here once your employer generates them.</p>
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
        <Link href="/documents/sick-leave-summary" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
          View Sick Leave Summary
        </Link>
      </div>

    </div>
  )
}
