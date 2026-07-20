import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PushSubscriptionRow } from './types'

// VAPID setup runs once per cold start. Missing env vars cause a clean
// no-op rather than a runtime crash so the rest of the app keeps working
// in dev environments that haven't been wired up yet.
let vapidConfigured = false
function ensureVapid(): boolean {
  if (vapidConfigured) return true
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) {
    console.warn('[push] VAPID env vars not set, pushes are disabled')
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  url?: string   // path to navigate to when notification is clicked (default /dashboard)
  tag?: string   // de-duplicates successive notifications with the same tag
}

interface SendResult {
  attempted: number
  delivered: number
  pruned: number
  errors: string[]
}

/**
 * Send a push to every active subscription for the given user IDs. Prunes
 * subscriptions that come back 410 Gone or 404 Not Found (browser revoked
 * or the user uninstalled). Other errors are logged but the subscription
 * is left alone so transient failures don't drop a working device.
 */
export async function sendPushToUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<SendResult> {
  const result: SendResult = { attempted: 0, delivered: 0, pruned: 0, errors: [] }
  if (!userIds.length) return result
  if (!ensureVapid()) return result

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds)

  const subscriptions = (subs ?? []) as PushSubscriptionRow[]
  result.attempted = subscriptions.length

  const message = JSON.stringify(payload)

  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        },
        message,
      )
      result.delivered += 1
      // Best-effort last_used_at update; ignore failures.
      await supabase
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id)
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 410 || status === 404) {
        // Subscription is gone — prune so the next send doesn't waste work.
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        result.pruned += 1
      } else {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`${sub.endpoint.slice(0, 50)}…: ${message}`)
        console.error('[push] sendNotification failed:', err)
      }
    }
  }))

  return result
}

/**
 * Convenience wrapper for sending to all admins, all employees, or both.
 */
export async function sendPushToRoles(
  supabase: SupabaseClient,
  roles: ('admin' | 'employee')[],
  payload: PushPayload,
): Promise<SendResult> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .in('role', roles)
  const ids = (profiles ?? []).map(p => p.id as string)
  return sendPushToUsers(supabase, ids, payload)
}
