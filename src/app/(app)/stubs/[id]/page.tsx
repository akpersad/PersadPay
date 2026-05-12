import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StubDetail } from '@/components/stubs/StubDetail'
import type { Paystub, Profile, PaystubWithYTD, PaystubLineItem } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StubDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  const { data: stub } = await supabase
    .from('paystubs')
    .select('*')
    .eq('id', id)
    .single<Paystub>()

  if (!stub) notFound()

  // Employees can only see their own stubs
  if (profile?.role === 'employee' && stub.employee_id !== user.id) notFound()

  // Fetch all stubs in the calendar year so line-item YTD can span the full year.
  // "Prior" stubs for YTD sums use a composite predicate: earlier pay_date OR
  // same pay_date with a lower stub_number (handles backdated and same-day stubs).
  const payYear = stub.pay_date.substring(0, 4)
  const { data: ytdStubs } = await supabase
    .from('paystubs')
    .select('*')
    .eq('employee_id', stub.employee_id)
    .gte('pay_date', `${payYear}-01-01`)
    .lte('pay_date', `${payYear}-12-31`)

  const prior = (ytdStubs ?? []).filter(s =>
    s.id !== id && (
      s.pay_date < stub.pay_date ||
      (s.pay_date === stub.pay_date && s.stub_number < stub.stub_number)
    )
  ) as Paystub[]
  const sum = (key: keyof Paystub) =>
    prior.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)

  const totalEmployeeTaxes =
    stub.federal_withholding + stub.fica_social_security + stub.fica_medicare +
    stub.state_withholding + stub.sdi + stub.pfl

  const ytd_total_employee_taxes =
    sum('federal_withholding') + sum('fica_social_security') + sum('fica_medicare') +
    sum('state_withholding') + sum('sdi') + sum('pfl')

  const overtimeHoursThisStub = Number(stub.overtime_hours ?? 0)
  const regularWagesThisStub = (Number(stub.hours_worked) - overtimeHoursThisStub) * Number(stub.hourly_rate)
  const overtimeWagesThisStub = overtimeHoursThisStub * Number(stub.hourly_rate) * 1.5
  const regularWagesPrior = prior.reduce(
    (acc, s) => acc + (Number(s.hours_worked) - Number(s.overtime_hours ?? 0)) * Number(s.hourly_rate),
    0,
  )
  const overtimeWagesPrior = prior.reduce(
    (acc, s) => acc + Number(s.overtime_hours ?? 0) * Number(s.hourly_rate) * 1.5,
    0,
  )

  const stubWithYTD: PaystubWithYTD = {
    ...stub,
    ytd_gross: sum('gross_pay') + Number(stub.gross_pay),
    ytd_regular_wages: regularWagesPrior + regularWagesThisStub,
    ytd_overtime_wages: overtimeWagesPrior + overtimeWagesThisStub,
    ytd_federal_withholding: sum('federal_withholding') + Number(stub.federal_withholding),
    ytd_fica_social_security: sum('fica_social_security') + Number(stub.fica_social_security),
    ytd_fica_medicare: sum('fica_medicare') + Number(stub.fica_medicare),
    ytd_state_withholding: sum('state_withholding') + Number(stub.state_withholding),
    ytd_sdi: sum('sdi') + Number(stub.sdi),
    ytd_pfl: sum('pfl') + Number(stub.pfl),
    ytd_employer_fica_ss: sum('employer_fica_ss') + Number(stub.employer_fica_ss),
    ytd_employer_fica_medicare: sum('employer_fica_medicare') + Number(stub.employer_fica_medicare),
    ytd_futa: sum('futa') + Number(stub.futa),
    ytd_suta: sum('suta') + Number(stub.suta),
    ytd_net_pay: sum('net_pay') + Number(stub.net_pay),
    ytd_total_employee_taxes: ytd_total_employee_taxes + totalEmployeeTaxes,
    total_employee_taxes: totalEmployeeTaxes,
  }

  const stubIdsInYear = (ytdStubs ?? []).map(s => s.id)

  const [{ data: lineItems }, { data: ytdLineItemRows }] = await Promise.all([
    supabase
      .from('paystub_line_items')
      .select('*')
      .eq('paystub_id', id)
      .order('sort_order', { ascending: true }),
    stubIdsInYear.length > 0
      ? supabase
          .from('paystub_line_items')
          .select('line_type, amount')
          .in('paystub_id', stubIdsInYear)
      : Promise.resolve({ data: [] }),
  ])

  // Aggregate YTD per line_type so each row on the stub can render its own YTD.
  const ytdByLineType: Record<string, number> = {}
  for (const row of (ytdLineItemRows ?? []) as { line_type: string; amount: number }[]) {
    ytdByLineType[row.line_type] = (ytdByLineType[row.line_type] ?? 0) + Number(row.amount)
  }

  // Strip employer-side financials and Zelle data for employee users.
  // The UI already hides these behind {isAdmin && ...} but the full object is
  // serialized into the React flight payload and visible in DevTools → Network.
  const safeStub: PaystubWithYTD = profile?.role === 'employee' ? {
    ...stubWithYTD,
    employer_fica_ss: 0,
    employer_fica_medicare: 0,
    futa: 0,
    suta: 0,
    ytd_employer_fica_ss: 0,
    ytd_employer_fica_medicare: 0,
    ytd_futa: 0,
    ytd_suta: 0,
    zelle_transaction_id: null,
  } : stubWithYTD

  return (
    <StubDetail
      stub={safeStub}
      role={profile?.role ?? 'employee'}
      userId={user.id}
      lineItems={(lineItems ?? []) as PaystubLineItem[]}
      ytdByLineType={ytdByLineType}
    />
  )
}
