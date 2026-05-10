import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { w2Id } = await request.json()
  if (!w2Id) return NextResponse.json({ error: 'w2Id required' }, { status: 400 })

  const { error } = await supabase
    .from('w2s')
    .update({ filed_with_ssa: true, filed_with_ssa_at: new Date().toISOString() })
    .eq('id', w2Id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
