'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Square } from 'lucide-react'
import { formatDate, daysUntil, shiftedDeadline } from '@/lib/dates'
import { rollForwardReminder } from '@/lib/reminders'
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

export function UpcomingDeadlines({ reminders }: { reminders: Reminder[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  async function dismiss(reminder: Reminder) {
    const supabase = createClient()

    const [{ error: dismissError }, { error: insertError }] = await Promise.all([
      supabase.from('reminders').update({ dismissed: true }).eq('id', reminder.id),
      supabase.from('reminders').insert(rollForwardReminder(reminder)),
    ])

    // A swallowed insert failure silently ends this filing's future reminders,
    // so surface it as loudly as the dismiss itself.
    if (dismissError) {
      toast.error('Failed to dismiss reminder.')
    } else if (insertError) {
      toast.error("Reminder dismissed, but creating next year's reminder failed. Re-add it from the Reminders page.")
      startTransition(() => router.refresh())
    } else {
      startTransition(() => router.refresh())
    }
  }

  return (
    <div className="space-y-2">
      {reminders.map(r => {
        const days = daysUntil(shiftedDeadline(r.due_date).effective)
        const url = getReminderUrl(r.title)
        return (
          <Card key={r.id}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <button
                onClick={() => dismiss(r)}
                disabled={pending}
                className="flex-shrink-0 text-muted-foreground hover:text-green-600 disabled:opacity-50"
                aria-label="Mark as filed"
              >
                <Square className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
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
              <Badge variant={days <= 10 ? 'destructive' : days <= 20 ? 'secondary' : 'outline'}>
                {days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days}d`}
              </Badge>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
