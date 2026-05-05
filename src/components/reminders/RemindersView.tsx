'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Square } from 'lucide-react'
import { formatDate, daysUntil } from '@/lib/dates'
import { toast } from 'sonner'
import type { Reminder } from '@/lib/types'

// Map a reminder title to an internal filing detail URL when one exists.
// Falls back to null for reminders that don't have a corresponding filing
// view (e.g., "Verify 2027 tax rates").
function getReminderHref(title: string): string | null {
  const nys45 = title.match(/NYS-45\s+Q([1-4])\s+(\d{4})/i)
  if (nys45) return `/filings/nys-45/${nys45[2]}/${nys45[1]}`

  const schedH = title.match(/Schedule H\s+(\d{4})/i)
  if (schedH) return `/filings/schedule-h/${schedH[1]}`

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
          const href = getReminderHref(r.title)
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
                      {href ? (
                        <Link
                          href={href}
                          className="text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {r.title}
                        </Link>
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
