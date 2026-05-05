import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Paystub } from '@/lib/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')
  if (!year) return NextResponse.json({ error: 'year required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: stubs } = await supabase
    .from('paystubs')
    .select('*')
    .gte('pay_date', `${year}-01-01`)
    .lte('pay_date', `${year}-12-31`)

  if (!stubs?.length) return NextResponse.json({ error: 'No stubs found for this year' }, { status: 404 })

  const sum = (key: keyof Paystub) =>
    (stubs as Paystub[]).reduce((acc, s) => acc + Number(s[key] ?? 0), 0)

  const SS_WAGE_BASE = 176100 // 2026 — verify annually
  const totalGross = sum('gross_pay')
  const ssWages = Math.min(totalGross, SS_WAGE_BASE)

  // Find the employee (there's only one)
  const employeeId = (stubs[0] as Paystub).employee_id

  return NextResponse.json({
    employee_id: employeeId,
    tax_year: parseInt(year),
    wages_tips: totalGross,
    federal_tax_withheld: sum('federal_withholding'),
    ss_wages: ssWages,
    ss_tax_withheld: sum('fica_social_security'),
    medicare_wages: totalGross,
    medicare_tax_withheld: sum('fica_medicare'),
    state_wages: totalGross,
    state_tax_withheld: sum('state_withholding'),
  })
}
