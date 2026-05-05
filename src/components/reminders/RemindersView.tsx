'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Square } from 'lucide-react'
import { formatDate, daysUntil } from '@/lib/dates'
import { toast } from 'sonner'
import type { Reminder } from '@/lib/types'

const REMINDER_LINKS: Record<string, string> = {
  'NYS-45': 'https://www.tax.ny.gov/bus/ads/efile_addnys45.htm',
  'Schedule H': 'https://www.irs.gov/forms-pubs/about-schedule-h-form-1040',
}

function getReminderUrl(title: string): string | null {
  for (const [key, url] of Object.entries(REMINDER_LINKS)) {
    if (title.includes(key)) return url
  }
  return null
}

export function RemindersView({ reminders }: { reminders: Reminder[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const active = reminders.filter(r => !r.dismissed)
  const dismissed = reminders.filter(r => r.dismissed)

  async function dismiss(reminder: Reminder) {
    const supabase = createClient()
    const nextDue = reminder.due_date.replace(/^\d{4}/, y => String(parseInt(y) + 1))
    const nextTitle = reminder.title.replace(/\d{4}/, y => String(parseInt(y) + 1))

    const [{ error }] = await Promise.all([
      supabase.from('reminders').update({ dismissed: true }).eq('id', reminder.id),
      supabase.from('reminders').insert({
        title: nextTitle,
        due_date: nextDue,
        description: reminder.description,
        dismissed: false,
        email_sent: false,
      }),
    ])

    if (error) {
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
          const url = getReminderUrl(r.title)
          return (
            <Card key={r.id}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <button
                  onClick={() => dismiss(r)}
                  disabled={pending}
                  className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-green-600 disabled:opacity-50"
                  aria-label="Mark as filed"
                >
                  <Square className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {r.title}
                        </a>
                      ) : (
                        <p className="text-sm font-medium">{r.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Due {formatDate(r.due_date)}</p>
                    </div>
                    <Badge variant={days <= 0 ? 'destructive' : days <= 10 ? 'destructive' : days <= 20 ? 'secondary' : 'outline'}>
                      {days <= 0 ? 'Overdue' : `${days}d`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
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
