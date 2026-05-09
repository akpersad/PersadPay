import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewStubForm } from '@/components/stubs/NewStubForm'
import { getTaxRatesForYear } from '@/lib/tax'
import { addDays } from '@/lib/dates'
import type { Settings, Paystub, Profile, PaystubLineItem } from '@/lib/types'

interface SearchParams { duplicate?: string }

export default async function NewStubPage({
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

  const { duplicate: duplicateId } = await searchParams

  // "Same as last week" — when ?duplicate=stub_id is set, fetch the source
  // and pre-fill the form with its hours/rate/line items, dates rolled
  // forward by one week. Form still operates in CREATE mode (no initialStub)
  // so saving inserts a new stub rather than updating the source.
  let sourceStub: Paystub | null = null
  let sourceLineItems: PaystubLineItem[] = []
  if (duplicateId) {
    const [{ data: dupStub }, { data: dupLineItems }] = await Promise.all([
      supabase.from('paystubs').select('*').eq('id', duplicateId).single<Paystub>(),
      supabase
        .from('paystub_line_items')
        .select('*')
        .eq('paystub_id', duplicateId)
        .order('sort_order', { ascending: true }),
    ])
    sourceStub = dupStub ?? null
    sourceLineItems = (dupLineItems ?? []) as PaystubLineItem[]
  }

  // Fetch last stub and employee first: both are needed to compute the correct
  // pay year before querying YTD totals.
  const [{ data: lastStub }, { data: employee }] = await Promise.all([
    supabase
      .from('paystubs')
      .select('stub_number, pay_period_end')
      .order('stub_number', { ascending: false })
      .limit(1)
      .single<Pick<Paystub, 'stub_number' | 'pay_period_end'>>(),
    supabase.from('profiles').select('id').eq('role', 'employee').single<Pick<Profile, 'id'>>(),
  ])

  // Derive the expected pay year from the suggested pay date, not the server
  // clock — a stub generated on Dec 30 for a Jan 2 pay date must use next
  // year's YTD and tax rates.
  const suggestedPayDate = lastStub?.pay_period_end
    ? addDays(lastStub.pay_period_end, 7)
    : new Date().toISOString().slice(0, 10)
  const currentYear = parseInt(suggestedPayDate.substring(0, 4))

  const [
    { data: settings },
    { data: ytdStubs },
    taxRates,
  ] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    employee?.id
      ? supabase.from('paystubs').select('gross_pay, pfl').eq('employee_id', employee.id).gte('pay_date', `${currentYear}-01-01`)
      : Promise.resolve({ data: [] as Pick<Paystub, 'gross_pay' | 'pfl'>[] }),
    getTaxRatesForYear(supabase, currentYear),
  ])

  const nextStubNumber = lastStub ? lastStub.stub_number + 1 : 1
  const ytdGrossBefore = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const ytdPflBefore = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.pfl ?? 0), 0)

  const settingsIncomplete = !settings?.employee_email || !settings?.employer_name || !employee?.id

  if (!taxRates) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
        <h1 className="text-lg font-semibold mb-4">New Pay Stub</h1>
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          No tax rates seeded for {currentYear}. Run the latest migration in Supabase or seed the
          tax_rates table before generating stubs.
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">New Pay Stub</h1>
      {settingsIncomplete && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Settings are incomplete. Please fill out employer info, employee info, and create the employee account before generating stubs.
        </div>
      )}
      <NewStubForm
        settings={settings}
        employeeId={employee?.id ?? ''}
        lastPayPeriodEnd={sourceStub?.pay_period_end ?? lastStub?.pay_period_end ?? null}
        nextStubNumber={nextStubNumber}
        ytdGrossBefore={ytdGrossBefore}
        ytdPflBefore={ytdPflBefore}
        taxRates={taxRates}
        createdBy={user.id}
        prefillFromStub={sourceStub ? {
          hours: Number(sourceStub.hours_worked),
          rate: Number(sourceStub.hourly_rate),
          lineItems: sourceLineItems,
          // Roll the last source pay_date forward by 7 days as a sensible default.
          // The lastPayPeriodEnd-based suggestedStart/End above already handles
          // period dates; this is just a comment for the date field semantics.
          suggestedPayDate: addDays(sourceStub.pay_date, 7),
        } : undefined}
      />
    </div>
  )
}
