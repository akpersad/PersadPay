import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateW3PDF } from '@/lib/pdf'
import type { W2, Settings, Profile } from '@/lib/types'

// Admin-only — W-3 is a transmittal form filed with SSA, not the employee.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: w2 } = await supabase.from('w2s').select('*').eq('id', id).single<W2>()
  if (!w2) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()
  if (!settings) return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })

  const pdfBuffer = await generateW3PDF(w2, settings)

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="w3-${w2.tax_year}.pdf"`,
    },
  })
}
