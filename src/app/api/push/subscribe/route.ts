import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SubscribeBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: SubscribeBody
  try {
    body = await request.json() as SubscribeBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'endpoint + keys.p256dh + keys.auth required' }, { status: 400 })
  }

  // Upsert on endpoint so re-subscribing from the same browser/device
  // refreshes the row instead of creating duplicates. The audit trigger
  // captures both the original insert and any update.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        p256dh_key: body.keys.p256dh,
        auth_key: body.keys.auth,
        user_agent: body.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { endpoint?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  }

  // RLS limits this to rows where user_id = auth.uid(); harmless if the row
  // belongs to a different user (no-op). Endpoint match alone is unique
  // because endpoint is globally unique per browser-issued URL.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', body.endpoint)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
