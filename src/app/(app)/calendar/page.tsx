import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { CalendarStub } from '@/components/calendar/CalendarView'
import type { Profile } from '@/lib/types'

interface SearchParams { month?: string }

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { month } = await searchParams
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthParam = month ?? defaultMonth

  const parts = monthParam.split('-')
  const year = parseInt(parts[0] ?? '0', 10)
  const monthNum = parseInt(parts[1] ?? '0', 10)

  if (!year || monthNum < 1 || monthNum > 12) {
    redirect(`/calendar?month=${defaultMonth}`)
  }

  const firstDay = `${year}-${String(monthNum).padStart(2, '0')}-01`
  const lastDayNum = new Date(year, monthNum, 0).getDate()
  const lastDay = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`

  // Fetch stubs whose pay period overlaps this month.
  const { data: stubs } = await supabase
    .from('paystubs')
    .select('id, stub_number, pay_period_start, pay_period_end, pay_date, hours_worked, daily_hours, payment_sent, stub_sent, hysa_transferred, gross_pay')
    .lte('pay_period_start', lastDay)
    .gte('pay_period_end', firstDay)
    .order('pay_period_start', { ascending: true })

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <CalendarView stubs={(stubs ?? []) as CalendarStub[]} year={year} month={monthNum} />
    </div>
  )
}
