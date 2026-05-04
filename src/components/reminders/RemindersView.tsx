'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatDate, daysUntil, addDays } from '@/lib/dates'
import { toast } from 'sonner'
import type { Reminder } from '@/lib/types'

function nextYearDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(y) + 1}-${m}-${d}`
}

export function RemindersView({ reminders }: { reminders: Reminder[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const active = reminders.filter(r => !r.dismissed)
  const dismissed = reminders.filter(r => r.dismissed)

  async function dismiss(reminder: Reminder) {
    const supabase = createClient()

    const nextDue = nextYearDate(reminder.due_date)
    const nextTitle = reminder.title.replace(/\d{4}/, str => String(parseInt(str) + 1))

    const [{ error: dismissError }] = await Promise.all([
      supabase.from('reminders').update({ dismissed: true }).eq('id', reminder.id),
      supabase.from('reminders').insert({
        title: nextTitle,
        due_date: nextDue,
        description: reminder.description,
        dismissed: false,
        email_sent: false,
      }),
    ])

    if (dismissError) {
      toast.error('Failed to dismiss reminder.')
    } else {
      toast.success("Reminder dismissed. Next year's reminder created.")
      startTransition(() => router.refresh())
    }
  }

  if (!reminders.length) {
    return <p className="text-sm text-muted-foreground">No reminders.</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {active.map(r => {
          const days = daysUntil(r.due_date)
          return (
            <Card key={r.id}>
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(r.due_date)}</p>
                  </div>
                  <Badge variant={days <= 0 ? 'destructive' : days <= 10 ? 'destructive' : days <= 20 ? 'secondary' : 'outline'}>
                    {days <= 0 ? 'Overdue' : `${days}d`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.description}</p>
                <Button size="sm" variant="outline" onClick={() => dismiss(r)}>
                  Mark as filed
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {dismissed.length > 0 && (
        <>
          <Separator />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Filed</p>
          <div className="space-y-2">
            {dismissed.map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm text-muted-foreground py-1">
                <span className="line-through">{r.title}</span>
                <span className="text-xs">{formatDate(r.due_date)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
