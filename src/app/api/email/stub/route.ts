import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendStubEmail } from '@/lib/email'
import { sendPushToUsers } from '@/lib/push-server'
import { generateStubPDF } from '@/lib/pdf'
import { formatCurrency, formatDateRange } from '@/lib/dates'
import type { Paystub, Settings, PaystubWithYTD, PaystubLineItem } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // force=true is sent by the "Resend Email" button (stub already sent once).
  // Without force, a second identical request within the same session is a
  // double-click and should be rejected to prevent duplicate emails.
  const { stubId, force } = await request.json()

  const { data: stub } = await supabase.from('paystubs').select('*').eq('id', stubId).single<Paystub>()
  if (!stub) return NextResponse.json({ error: 'Stub not found' }, { status: 404 })
  if (!stub.payment_sent) return NextResponse.json({ error: 'Payment not yet marked as sent' }, { status: 400 })

  if (stub.stub_sent && !force) {
    return NextResponse.json({ error: 'Stub has already been emailed. Use Resend Email to send again.' }, { status: 409 })
  }

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  // Build YTD values
  const payYear = stub.pay_date.substring(0, 4)
  const { data: ytdStubs } = await supabase
    .from('paystubs')
    .select('*')
    .eq('employee_id', stub.employee_id)
    .gte('pay_date', `${payYear}-01-01`)
    .lte('pay_date', `${payYear}-12-31`)

  const prior = ((ytdStubs ?? []) as Paystub[]).filter(s =>
    s.id !== stubId && (
      s.pay_date < stub.pay_date ||
      (s.pay_date === stub.pay_date && s.stub_number < stub.stub_number)
    )
  )
  const sum = (key: keyof Paystub) => prior.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)
  const totalEmpTaxes = Number(stub.federal_withholding) + Number(stub.fica_social_security) + Number(stub.fica_medicare) + Number(stub.state_withholding) + Number(stub.sdi) + Number(stub.pfl)

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
    ytd_total_employee_taxes: sum('federal_withholding') + sum('fica_social_security') + sum('fica_medicare') + sum('state_withholding') + sum('sdi') + sum('pfl') + totalEmpTaxes,
    total_employee_taxes: totalEmpTaxes,
  }

  // Line-item YTD must cover the same window as the main YTD sums — prior
  // stubs plus this one — so a re-sent stub doesn't absorb bonuses or
  // reimbursements paid after it (NY § 195(3) statement consistency).
  const ytdLineItemStubIds = [...prior.map(s => s.id), stub.id]

  const [{ data: lineItems }, { data: ytdLineItemRows }] = await Promise.all([
    supabase
      .from('paystub_line_items')
      .select('*')
      .eq('paystub_id', stubId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('paystub_line_items')
      .select('line_type, amount')
      .in('paystub_id', ytdLineItemStubIds),
  ])

  const ytdByLineType: Record<string, number> = {}
  for (const row of (ytdLineItemRows ?? []) as { line_type: string; amount: number }[]) {
    ytdByLineType[row.line_type] = (ytdByLineType[row.line_type] ?? 0) + Number(row.amount)
  }

  const pdfBuffer = await generateStubPDF(
    stubWithYTD,
    settings,
    'employee',
    (lineItems ?? []) as PaystubLineItem[],
    ytdByLineType,
  )
  const result = await sendStubEmail(stubWithYTD, settings, pdfBuffer)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  // result.success=true even if additional recipients had errors (partial failure).
  // The stub is marked sent once the primary recipient (employee) receives it.
  const { error: updateError } = await supabase
    .from('paystubs')
    .update({
      stub_sent: true,
      stub_sent_at: new Date().toISOString(),
      resend_message_id: result.messageId ?? null,
    })
    .eq('id', stubId)

  if (updateError) {
    console.error('[email/stub] stub record update failed after send:', updateError)
    return NextResponse.json({ error: 'Email sent but failed to update stub record. Check logs.' }, { status: 500 })
  }

  await sendPushToUsers(supabase, [stub.employee_id], {
    title: 'New paystub from PersadPay',
    body: `${formatDateRange(stub.pay_period_start, stub.pay_period_end)} · Net ${formatCurrency(Number(stub.net_pay))}`,
    url: `/stubs/${stubId}`,
    tag: `stub-${stubId}`,
  })

  return NextResponse.json({
    success: true,
    partialErrors: result.partialErrors ?? null,
  })
}
