import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewStubForm } from '@/components/stubs/NewStubForm'
import { getTaxRatesForYear } from '@/lib/tax'
import type { Settings, Paystub, Profile, PaystubLineItem } from '@/lib/types'

interface Params { id: string }

export default async function EditStubPage({ params }: { params: Promise<Params> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: stub } = await supabase.from('paystubs').select('*').eq('id', id).single<Paystub>()
  if (!stub) notFound()

  // Lock once paid — editing a paid stub would corrupt the audit trail.
  if (stub.payment_sent) redirect(`/stubs/${id}`)

  const payYear = stub.pay_date.substring(0, 4)

  const [
    { data: settings },
    { data: lineItems },
    { data: priorStubs },
    taxRates,
  ] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    supabase
      .from('paystub_line_items')
      .select('*')
      .eq('paystub_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('paystubs')
      .select('gross_pay, pfl')
      .gte('pay_date', `${payYear}-01-01`)
      .lt('pay_date', stub.pay_date),
    getTaxRatesForYear(supabase, parseInt(payYear)),
  ])

  if (!taxRates) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-3xl mx-auto">
        <p className="text-sm text-yellow-700">No tax rates seeded for {payYear}.</p>
      </div>
    )
  }

  const ytdGrossBefore = (priorStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const ytdPflBefore = (priorStubs ?? []).reduce((sum, s) => sum + Number(s.pfl ?? 0), 0)

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Edit Stub #{stub.stub_number}</h1>
      <NewStubForm
        settings={settings}
        employeeId={stub.employee_id}
        lastPayPeriodEnd={null}
        nextStubNumber={stub.stub_number}
        ytdGrossBefore={ytdGrossBefore}
        ytdPflBefore={ytdPflBefore}
        taxRates={taxRates}
        createdBy={user.id}
        initialStub={stub}
        initialLineItems={(lineItems ?? []) as PaystubLineItem[]}
      />
    </div>
  )
}
