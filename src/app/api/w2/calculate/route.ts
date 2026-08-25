import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeW2Boxes, w2ErrorResponse } from '@/lib/w2'

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
  if (!Number.isInteger(yearInt)) {
    return NextResponse.json({ error: 'year must be an integer' }, { status: 400 })
  }

  const result = await computeW2Boxes(supabase, createAdminClient(), yearInt)
  if (!result.ok) {
    const { error, status } = w2ErrorResponse(result.error)
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json(result.boxes)
}
