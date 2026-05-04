import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateW2PDF } from '@/lib/pdf'
import type { W2, Settings } from '@/lib/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { data: w2 } = await supabase.from('w2s').select('*').eq('id', id).single<W2>()
  if (!w2) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Employees can only get their own
  if (profile?.role === 'employee' && w2.employee_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  const pdfBuffer = await generateW2PDF(w2, settings)

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="w2-${w2.tax_year}.pdf"`,
    },
  })
}
