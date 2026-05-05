import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StubDetail } from '@/components/stubs/StubDetail'
import type { Paystub, Profile, PaystubWithYTD, Settings } from '@/lib/types'

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

  // Calculate YTD: sum all stubs in the same calendar year with lower or equal stub_number
  const payYear = stub.pay_date.substring(0, 4)
  const { data: ytdStubs } = await supabase
    .from('paystubs')
    .select('*')
    .gte('pay_date', `${payYear}-01-01`)
    .lte('pay_date', `${payYear}-12-31`)
    .lte('stub_number', stub.stub_number)

  const prior = (ytdStubs ?? []).filter(s => s.id !== id) as Paystub[]
  const sum = (key: keyof Paystub) =>
    prior.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)

  const totalEmployeeTaxes =
    stub.federal_withholding + stub.fica_social_security + stub.fica_medicare +
    stub.state_withholding + stub.sdi + stub.pfl

  const ytd_total_employee_taxes =
    sum('federal_withholding') + sum('fica_social_security') + sum('fica_medicare') +
    sum('state_withholding') + sum('sdi') + sum('pfl')

  const stubWithYTD: PaystubWithYTD = {
    ...stub,
    ytd_gross: sum('gross_pay') + Number(stub.gross_pay),
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

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()

  return (
    <StubDetail
      stub={stubWithYTD}
      role={profile?.role ?? 'employee'}
      settings={settings}
    />
  )
}
