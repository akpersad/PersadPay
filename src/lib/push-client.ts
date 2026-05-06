// Client-side helpers for managing this device's web-push subscription.
// Server-side counterpart lives in lib/push-server.ts.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

// Web Push expects the application server key as a Uint8Array. Browsers
// surface VAPID public keys as base64url; this is the standard converter.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function subscribePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'Push not supported on this browser.' }
  if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY not set.' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: `Notification permission ${permission}.` }
  }

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const subscription = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Cast to BufferSource — TS's lib.dom.d.ts narrowed PushManager.subscribe
    // to require ArrayBufferView<ArrayBuffer> in strict mode, and Uint8Array
    // surfaces as ArrayBufferLike. The runtime accepts Uint8Array regardless.
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  })

  // Push the subscription to our API. The endpoint + keys uniquely identify
  // this device; the API upserts on endpoint.
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.toJSON().keys,
      userAgent: navigator.userAgent,
    }),
  })

  if (!res.ok) {
    return { ok: false, reason: `Server rejected subscription (${res.status}).` }
  }
  return { ok: true }
}

export async function unsubscribePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'Push not supported.' }
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  if (!subscription) return { ok: true }

  const endpoint = subscription.endpoint
  await subscription.unsubscribe()

  // Tell the server too so the row is removed and we don't try to push later.
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })

  return { ok: true }
}
