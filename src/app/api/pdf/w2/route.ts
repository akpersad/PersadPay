import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateW2PDF } from '@/lib/pdf'
import type { W2, Settings, W2Copy, Paystub } from '@/lib/types'

const VALID_COPIES: W2Copy[] = ['B', 'C', '2', 'D', 'worksheet']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const rawCopy = searchParams.get('copy') ?? 'B'
  const copy: W2Copy = VALID_COPIES.includes(rawCopy as W2Copy) ? (rawCopy as W2Copy) : 'B'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { data: w2 } = await supabase.from('w2s').select('*').eq('id', id).single<W2>()
  if (!w2) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (profile?.role === 'employee' && w2.employee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  // Fetch sdi/pfl totals for Box 14 directly from paystubs for this tax year.
  const { data: stubRows } = await supabase
    .from('paystubs')
    .select('sdi, pfl')
    .gte('pay_date', `${w2.tax_year}-01-01`)
    .lte('pay_date', `${w2.tax_year}-12-31`)

  const stubs = (stubRows ?? []) as Pick<Paystub, 'sdi' | 'pfl'>[]
  const sdiWithheld = stubs.reduce((sum, s) => sum + Number(s.sdi ?? 0), 0)
  const pflWithheld = stubs.reduce((sum, s) => sum + Number(s.pfl ?? 0), 0)

  const pdfBuffer = await generateW2PDF(w2, settings, copy, sdiWithheld, pflWithheld)
  const copyLabel = copy === 'worksheet' ? 'worksheet' : `copy-${copy.toLowerCase()}`

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="w2-${w2.tax_year}-${copyLabel}.pdf"`,
    },
  })
}
