import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { PrintButton } from '../sick-leave-policy/PrintButton'
import { YearPicker } from './YearPicker'
import { formatDate, formatDateRange } from '@/lib/dates'
import type { Profile, Settings, Paystub } from '@/lib/types'

interface SearchParams { year?: string }

export default async function SickLeaveSummaryPage({
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

  const isEmployee = profile?.role === 'employee'

  const params = await searchParams
  const today = new Date()
  const currentYear = today.getFullYear()
  const year = parseInt(params.year ?? String(currentYear)) || currentYear

  // Employees see only their own stubs (enforced by RLS + explicit filter).
  const stubQuery = supabase
    .from('paystubs')
    .select('id, pay_period_start, pay_period_end, pay_date, sick_hours, reason')
    .gte('pay_date', `${year}-01-01`)
    .lte('pay_date', `${year}-12-31`)
    .gt('sick_hours', 0)
    .order('pay_date', { ascending: true })

  if (isEmployee) stubQuery.eq('employee_id', user.id)

  const anyStubQuery = supabase
    .from('paystubs')
    .select('pay_date')
    .order('pay_date', { ascending: true })
    .limit(1)

  if (isEmployee) anyStubQuery.eq('employee_id', user.id)

  const [{ data: settings }, { data: stubsThisYear }, { data: anyStubs }] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    stubQuery,
    anyStubQuery,
  ])

  const earliestYear = anyStubs?.[0]
    ? parseInt((anyStubs[0] as Pick<Paystub, 'pay_date'>).pay_date.slice(0, 4))
    : currentYear
  const availableYears: number[] = []
  for (let y = currentYear; y >= earliestYear; y--) availableYears.push(y)

  const entries = (stubsThisYear ?? []) as Pick<Paystub, 'id' | 'pay_period_start' | 'pay_period_end' | 'pay_date' | 'sick_hours' | 'reason'>[]
  const totalSickHours = entries.reduce((sum, e) => sum + Number(e.sick_hours), 0)

  const employer = settings?.employer_name ?? 'Employer'
  const employee = settings?.employee_name ?? 'Employee'
  const employerAddress = settings?.employer_address ?? ''

  return (
    <div className="px-4 pt-4 pb-4 max-w-2xl mx-auto print:max-w-none print:px-0 print:pt-0">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link href={isEmployee ? '/dashboard' : '/documents'}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <YearPicker current={year} available={availableYears} />
          <PrintButton />
        </div>
      </div>

      {/* Document body */}
      <article className="bg-white text-black space-y-5 print:text-[11pt] leading-relaxed">
        <header className="text-center space-y-1 border-b pb-4">
          <h1 className="text-xl font-bold uppercase tracking-wide">Sick Leave Summary — {year}</h1>
          <p className="text-sm">{employer}</p>
          {employerAddress && <p className="text-xs text-muted-foreground">{employerAddress}</p>}
          <p className="text-xs text-muted-foreground pt-1">Generated {formatDate(today.toISOString().slice(0, 10))}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Employee</h2>
          <p className="text-sm">{employee}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Sick Leave Used</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sick leave recorded for {year}.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 font-medium">Pay period</th>
                  <th className="text-left py-1 font-medium">Pay date</th>
                  <th className="text-right py-1 font-medium">Sick hours</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-b">
                    <td className="py-1.5">{formatDateRange(e.pay_period_start, e.pay_period_end)}</td>
                    <td className="py-1.5">{formatDate(e.pay_date)}</td>
                    <td className="py-1.5 text-right tabular-nums">{Number(e.sick_hours)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2" colSpan={2}>Total sick hours used in {year}</td>
                  <td className="py-2 text-right tabular-nums">{totalSickHours}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Statutory Note</h2>
          <p className="text-sm">
            Provided pursuant to NY Labor Law § 196-b(4), which requires employers to furnish, in
            writing within three business days of an employee request, a summary of sick leave used
            in the current and prior calendar years. {employer} maintains an unlimited unpaid sick
            leave policy that exceeds the 40-hour statutory floor for small employers (1–4
            employees, ≤$1M net income).
          </p>
        </section>

        {/* Signatures */}
        <section className="pt-8 grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-6">
            <p className="font-semibold">Employer</p>
            <div>
              <div className="border-b border-black h-8" />
              <p className="text-xs text-muted-foreground mt-1">Signature</p>
            </div>
            <div>
              <div className="border-b border-black h-6" />
              <p className="text-xs text-muted-foreground mt-1">Date</p>
            </div>
          </div>
          <div className="space-y-6">
            <p className="font-semibold">Received by employee</p>
            <div>
              <div className="border-b border-black h-8" />
              <p className="text-xs text-muted-foreground mt-1">Signature</p>
            </div>
            <div>
              <div className="border-b border-black h-6" />
              <p className="text-xs text-muted-foreground mt-1">Date</p>
            </div>
          </div>
        </section>
      </article>
    </div>
  )
}
