import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { generateW2PDF, generateW2PacketPDF } from '@/lib/pdf'
import type { W2, Settings, W2Copy, Paystub } from '@/lib/types'

const VALID_COPIES: W2Copy[] = ['B', 'C', '2', 'D', 'worksheet']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const rawCopy = searchParams.get('copy') ?? 'packet'
  const isPacket = rawCopy === 'packet'
  const copy: W2Copy = (!isPacket && VALID_COPIES.includes(rawCopy as W2Copy)) ? (rawCopy as W2Copy) : 'B'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { data: w2 } = await supabase.from('w2s').select('*').eq('id', id).single<W2>()
  if (!w2) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (profile?.role === 'employee' && w2.employee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use admin client for settings and paystubs: employees can't SELECT settings
  // via RLS but data is only used for PDF rendering, not exposed to the user.
  const adminClient = createAdminClient()
  const [{ data: settings }, { data: stubRows }] = await Promise.all([
    adminClient.from('settings').select('*').single<Settings>(),
    adminClient
      .from('paystubs')
      .select('sdi, pfl')
      .eq('employee_id', w2.employee_id)
      .gte('pay_date', `${w2.tax_year}-01-01`)
      .lte('pay_date', `${w2.tax_year}-12-31`),
  ])
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  const stubs = (stubRows ?? []) as Pick<Paystub, 'sdi' | 'pfl'>[]
  const sdiWithheld = stubs.reduce((sum, s) => sum + Number(s.sdi ?? 0), 0)
  const pflWithheld = stubs.reduce((sum, s) => sum + Number(s.pfl ?? 0), 0)

  const filename = isPacket
    ? `w2-${w2.tax_year}-copies-b-c-2.pdf`
    : copy === 'worksheet' ? `w2-${w2.tax_year}-worksheet.pdf` : `w2-${w2.tax_year}-copy-${copy.toLowerCase()}.pdf`

  try {
    const pdfBuffer = isPacket
      ? await generateW2PacketPDF(w2, settings, sdiWithheld, pflWithheld)
      : await generateW2PDF(w2, settings, copy, sdiWithheld, pflWithheld)
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('PDF generation failed:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
