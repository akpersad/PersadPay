import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getTaxRatesForYear } from '@/lib/tax'
import type { Paystub, PaystubLineItem } from '@/lib/types'

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

  const yearInt = parseInt(year)

  const adminClient = createAdminClient()
  // The DB may hold a permanent test-employee profile alongside the real one
  // (migration 0026). Ordering by is_test puts the real employee first;
  // .single() would error with two rows and break W-2 generation entirely.
  const { data: emp } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'employee')
    .order('is_test', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!emp) return NextResponse.json({ error: 'No employee profile found' }, { status: 500 })

  const [{ data: stubs }, rates] = await Promise.all([
    supabase
      .from('paystubs')
      .select('*')
      .eq('employee_id', emp.id)
      .gte('pay_date', `${year}-01-01`)
      .lte('pay_date', `${year}-12-31`),
    getTaxRatesForYear(supabase, yearInt),
  ])

  if (!stubs?.length) return NextResponse.json({ error: 'No stubs found for this year' }, { status: 404 })
  if (!rates) return NextResponse.json({ error: `No tax rates seeded for ${year}` }, { status: 500 })

  const typedStubs = stubs as Paystub[]
  const stubIds = typedStubs.map(s => s.id)

  // Fetch line items so W-2 boxes can be aggregated per taxability flag.
  // This correctly handles any future line type where flags may differ across
  // w2_box1 / taxable_fica / taxable_ny.
  const { data: lineItemRows } = stubIds.length > 0
    ? await supabase
        .from('paystub_line_items')
        .select('paystub_id, amount, w2_box1, taxable_fica, taxable_ny')
        .in('paystub_id', stubIds)
    : { data: [] as Pick<PaystubLineItem, 'paystub_id' | 'amount' | 'w2_box1' | 'taxable_fica' | 'taxable_ny'>[] }

  const lineItems = (lineItemRows ?? []) as Pick<PaystubLineItem, 'paystub_id' | 'amount' | 'w2_box1' | 'taxable_fica' | 'taxable_ny'>[]

  // gross_pay on each stub already includes taxable line items. To get per-flag
  // W-2 wages correctly, subtract all taxable line items from gross_pay to get
  // base wages, then re-add only the items with the flag we need.
  const totalTaxableLineItems = lineItems.reduce((acc, li) => {
    const contributes = li.w2_box1 || li.taxable_fica || li.taxable_ny
    return acc + (contributes ? Number(li.amount) : 0)
  }, 0)

  const totalGross = typedStubs.reduce((acc, s) => acc + Number(s.gross_pay), 0)
  const totalBaseWages = totalGross - totalTaxableLineItems

  const sumLineItems = (flag: 'w2_box1' | 'taxable_fica' | 'taxable_ny') =>
    lineItems.reduce((acc, li) => acc + (li[flag] ? Number(li.amount) : 0), 0)

  const sumStubs = (key: keyof Paystub) =>
    typedStubs.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)

  const wages_tips = totalBaseWages + sumLineItems('w2_box1')
  const ficaWages = totalBaseWages + sumLineItems('taxable_fica')
  const nyWages = totalBaseWages + sumLineItems('taxable_ny')
  const ssWages = Math.min(ficaWages, Number(rates.ss_wage_base))

  return NextResponse.json({
    employee_id: emp.id,
    tax_year: yearInt,
    wages_tips,
    federal_tax_withheld: sumStubs('federal_withholding'),
    ss_wages: ssWages,
    ss_tax_withheld: sumStubs('fica_social_security'),
    medicare_wages: ficaWages,
    medicare_tax_withheld: sumStubs('fica_medicare'),
    state_wages: nyWages,
    state_tax_withheld: sumStubs('state_withholding'),
  })
}
