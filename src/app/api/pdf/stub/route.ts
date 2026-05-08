import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateStubPDF } from '@/lib/pdf'
import type { Paystub, Settings, PaystubWithYTD, Profile, PaystubLineItem } from '@/lib/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const variantParam = searchParams.get('variant') ?? 'employee'
  const variant = variantParam === 'admin' ? 'admin' : 'employee'

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  // Only admins can get the admin variant
  const effectiveVariant = profile?.role === 'admin' ? variant : 'employee'

  const { data: stub } = await supabase.from('paystubs').select('*').eq('id', id).single<Paystub>()
  if (!stub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Employees can only get their own
  if (profile?.role === 'employee' && stub.employee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payYear = stub.pay_date.substring(0, 4)
  const { data: ytdStubs } = await supabase
    .from('paystubs')
    .select('*')
    .gte('pay_date', `${payYear}-01-01`)
    .lte('pay_date', `${payYear}-12-31`)

  const prior = ((ytdStubs ?? []) as Paystub[]).filter(s =>
    s.id !== id && (
      s.pay_date < stub.pay_date ||
      (s.pay_date === stub.pay_date && s.stub_number < stub.stub_number)
    )
  )
  const sum = (key: keyof Paystub) => prior.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)
  const totalEmpTaxes = Number(stub.federal_withholding) + Number(stub.fica_social_security) + Number(stub.fica_medicare) + Number(stub.state_withholding) + Number(stub.sdi) + Number(stub.pfl)

  const regularWagesPrior = prior.reduce(
    (acc, s) => acc + Number(s.hours_worked) * Number(s.hourly_rate),
    0,
  )
  const regularWagesThisStub = Number(stub.hours_worked) * Number(stub.hourly_rate)

  const stubWithYTD: PaystubWithYTD = {
    ...stub,
    ytd_gross: sum('gross_pay') + Number(stub.gross_pay),
    ytd_regular_wages: regularWagesPrior + regularWagesThisStub,
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

  const stubIdsInYear = ((ytdStubs ?? []) as Paystub[]).map(s => s.id)

  const [{ data: settings }, { data: lineItems }, { data: ytdLineItemRows }] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
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
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  const ytdByLineType: Record<string, number> = {}
  for (const row of (ytdLineItemRows ?? []) as { line_type: string; amount: number }[]) {
    ytdByLineType[row.line_type] = (ytdByLineType[row.line_type] ?? 0) + Number(row.amount)
  }

  const pdfBuffer = await generateStubPDF(
    stubWithYTD,
    settings,
    effectiveVariant,
    (lineItems ?? []) as PaystubLineItem[],
    ytdByLineType,
  )

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="paystub-${stub.stub_number}.pdf"`,
    },
  })
}
