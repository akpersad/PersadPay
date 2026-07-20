'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { isPushSupported, getCurrentSubscription, subscribePush, unsubscribePush } from '@/lib/push-client'

interface ToggleState {
  supported: boolean
  permission: NotificationPermission | 'unknown'
  subscribed: boolean
  checked: boolean
}

export function PushNotificationsToggle() {
  const [state, setState] = useState<ToggleState>({
    supported: false,
    permission: 'unknown',
    subscribed: false,
    checked: false,
  })
  const { supported, permission, subscribed, checked } = state
  const [pending, setPending] = useState(false)

  useEffect(() => {
    // Single async step + single setState avoids cascading renders.
    void (async () => {
      const ok = isPushSupported()
      if (!ok) {
        setState({ supported: false, permission: 'unknown', subscribed: false, checked: true })
        return
      }
      const sub = await getCurrentSubscription()
      setState({
        supported: true,
        permission: Notification.permission,
        subscribed: !!sub,
        checked: true,
      })
    })()
  }, [])

  async function toggle(next: boolean) {
    setPending(true)
    if (next) {
      const result = await subscribePush()
      if (result.ok) {
        setState(s => ({ ...s, subscribed: true, permission: 'granted' }))
        toast.success('Push notifications enabled on this device.')
      } else {
        toast.error(`Could not enable: ${result.reason}`)
      }
    } else {
      const result = await unsubscribePush()
      if (result.ok) {
        setState(s => ({ ...s, subscribed: false }))
        toast.success('Push notifications disabled on this device.')
      } else {
        toast.error(`Could not disable: ${result.reason}`)
      }
    }
    setPending(false)
  }

  if (!checked) return null

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm">Push notifications</CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-2">
        {!supported ? (
          <p className="text-xs text-muted-foreground">
            This browser doesn&apos;t support web push. Install the app to your home screen
            (Add to Home Screen on iOS 16.4+; Install App on Android/desktop) and try again.
          </p>
        ) : permission === 'denied' ? (
          <p className="text-xs text-yellow-700">
            Notifications are blocked in browser settings. Reset the site permission and try again.
          </p>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label className="text-sm">Enable on this device</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Stub-ready Friday nudges, payment-not-sent reminders after 24h, and filing
                deadline alerts. Each device subscribes independently. Toggle on every phone
                and laptop you want notified.
              </p>
            </div>
            <Switch checked={subscribed} onCheckedChange={toggle} disabled={pending} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
