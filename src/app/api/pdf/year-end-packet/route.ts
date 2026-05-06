import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateYearEndPacketPDF } from '@/lib/pdf'
import { calculateScheduleH } from '@/lib/filings'
import { getTaxRatesForYear } from '@/lib/tax'
import type { Paystub, Settings, W2, Profile } from '@/lib/types'

// Year-end summary PDF for accountant handoff. Cover + Schedule H + W-2
// boxes + per-stub table. Admin only — contains employer-side data.
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

  const yearInt = parseInt(year)

  const [{ data: settings }, { data: stubs }, { data: w2 }, rates] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    supabase
      .from('paystubs')
      .select('*')
      .gte('pay_date', `${year}-01-01`)
      .lte('pay_date', `${year}-12-31`)
      .order('pay_date', { ascending: true }),
    supabase
      .from('w2s')
      .select('*')
      .eq('tax_year', yearInt)
      .maybeSingle<W2>(),
    getTaxRatesForYear(supabase, yearInt),
  ])

  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })
  if (!rates) return NextResponse.json({ error: `No tax rates seeded for ${year}` }, { status: 500 })

  const stubRows = (stubs ?? []) as Paystub[]
  const sh = calculateScheduleH(stubRows, rates, yearInt)

  const pdfBuffer = await generateYearEndPacketPDF({
    year: yearInt,
    settings,
    stubs: stubRows,
    w2: w2 ?? null,
    scheduleH: {
      ss_wages: sh.ss_wages,
      ss_tax: sh.ss_tax,
      medicare_wages: sh.medicare_wages,
      medicare_tax: sh.medicare_tax,
      fed_income_tax_withheld: sh.fed_income_tax_withheld,
      futa_wages: sh.futa_wages,
      futa_tax: sh.futa_tax,
      total_household_employment_taxes: sh.total_household_employment_taxes,
    },
  })

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="persadpay-year-end-${year}.pdf"`,
    },
  })
}
