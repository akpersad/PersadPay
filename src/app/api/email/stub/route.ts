import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendStubEmail } from '@/lib/email'
import { generateStubPDF } from '@/lib/pdf'
import type { Paystub, Settings, PaystubWithYTD } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { stubId } = await request.json()

  const { data: stub } = await supabase.from('paystubs').select('*').eq('id', stubId).single<Paystub>()
  if (!stub) return NextResponse.json({ error: 'Stub not found' }, { status: 404 })
  if (!stub.payment_sent) return NextResponse.json({ error: 'Payment not yet marked as sent' }, { status: 400 })

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  // Build YTD values
  const payYear = stub.pay_date.substring(0, 4)
  const { data: ytdStubs } = await supabase
    .from('paystubs')
    .select('*')
    .gte('pay_date', `${payYear}-01-01`)
    .lte('pay_date', `${payYear}-12-31`)
    .lte('stub_number', stub.stub_number)

  const prior = ((ytdStubs ?? []) as Paystub[]).filter(s => s.id !== stubId)
  const sum = (key: keyof Paystub) => prior.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)
  const totalEmpTaxes = Number(stub.federal_withholding) + Number(stub.fica_social_security) + Number(stub.fica_medicare) + Number(stub.state_withholding) + Number(stub.sdi) + Number(stub.pfl)

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
    ytd_total_employee_taxes: sum('federal_withholding') + sum('fica_social_security') + sum('fica_medicare') + sum('state_withholding') + sum('sdi') + sum('pfl') + totalEmpTaxes,
    total_employee_taxes: totalEmpTaxes,
  }

  const pdfBuffer = await generateStubPDF(stubWithYTD, settings, 'employee')
  const result = await sendStubEmail(stubWithYTD, settings, pdfBuffer)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  await supabase.from('paystubs').update({ stub_sent: true }).eq('id', stubId)

  return NextResponse.json({ success: true })
}
