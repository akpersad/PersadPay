import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendW2Email } from '@/lib/email'
import { generateW2PacketPDF } from '@/lib/pdf'
import type { W2, Settings, Paystub } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { w2Id } = await request.json()

  const [{ data: w2 }, { data: settings }] = await Promise.all([
    supabase.from('w2s').select('*').eq('id', w2Id).single<W2>(),
    supabase.from('settings').select('*').single<Settings>(),
  ])

  if (!w2) return NextResponse.json({ error: 'W-2 not found' }, { status: 404 })
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  const { data: stubRows } = await supabase
    .from('paystubs')
    .select('sdi, pfl')
    .eq('employee_id', w2.employee_id)
    .gte('pay_date', `${w2.tax_year}-01-01`)
    .lte('pay_date', `${w2.tax_year}-12-31`)

  const stubs = (stubRows ?? []) as Pick<Paystub, 'sdi' | 'pfl'>[]
  const sdiWithheld = stubs.reduce((sum, s) => sum + Number(s.sdi ?? 0), 0)
  const pflWithheld = stubs.reduce((sum, s) => sum + Number(s.pfl ?? 0), 0)

  const pdfBuffer = await generateW2PacketPDF(w2, settings, sdiWithheld, pflWithheld)
  const result = await sendW2Email(w2, settings, pdfBuffer)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
