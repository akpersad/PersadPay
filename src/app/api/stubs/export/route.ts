import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Paystub, Profile } from '@/lib/types'

const COLUMNS: { key: keyof Paystub | string; header: string }[] = [
  { key: 'stub_number', header: 'Stub #' },
  { key: 'pay_date', header: 'Pay Date' },
  { key: 'pay_period_start', header: 'Period Start' },
  { key: 'pay_period_end', header: 'Period End' },
  { key: 'hours_worked', header: 'Total Hours' },
  { key: 'overtime_hours', header: 'OT Hours' },
  { key: 'hourly_rate', header: 'Rate' },
  { key: 'gross_pay', header: 'Gross (Taxable)' },
  { key: 'federal_withholding', header: 'Federal WH' },
  { key: 'fica_social_security', header: 'FICA SS' },
  { key: 'fica_medicare', header: 'FICA Medicare' },
  { key: 'state_withholding', header: 'NY State WH' },
  { key: 'sdi', header: 'NY SDI' },
  { key: 'pfl', header: 'NY PFL' },
  { key: 'employer_fica_ss', header: 'Employer FICA SS' },
  { key: 'employer_fica_medicare', header: 'Employer FICA Medicare' },
  { key: 'futa', header: 'FUTA' },
  { key: 'suta', header: 'SUTA' },
  { key: 'net_pay', header: 'Net Pay' },
  { key: 'payment_sent', header: 'Payment Sent' },
  { key: 'zelle_transaction_id', header: 'Zelle ID' },
  { key: 'stub_sent', header: 'Emailed' },
  { key: 'reason', header: 'Reason' },
  { key: 'sick_hours', header: 'Sick Hours' },
  { key: 'created_at', header: 'Created' },
]

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
  // Quote when the value contains a delimiter, newline, or quote, per RFC 4180.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  if (!year || !/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: 'year (YYYY) required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: stubs } = await supabase
    .from('paystubs')
    .select('*')
    .gte('pay_date', `${year}-01-01`)
    .lte('pay_date', `${year}-12-31`)
    .order('pay_date', { ascending: true })

  const rows = (stubs ?? []) as Paystub[]
  const lines: string[] = []
  lines.push(COLUMNS.map(c => csvEscape(c.header)).join(','))
  for (const row of rows) {
    const cells = COLUMNS.map(c => csvEscape((row as unknown as Record<string, unknown>)[c.key as string]))
    lines.push(cells.join(','))
  }

  const csv = lines.join('\n') + '\n'

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="paystubs-${year}.csv"`,
    },
  })
}
