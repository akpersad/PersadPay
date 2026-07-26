'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Square } from 'lucide-react'
import { formatDate, daysUntil, formatCurrency, shiftedDeadline, selfImposedDeadline } from '@/lib/dates'
import { rollForwardReminder } from '@/lib/reminders'
import { toast } from 'sonner'
import type { Reminder } from '@/lib/types'

export interface ReminderAmount {
  amount: number
  agency: string
}

// Map a reminder title to an internal filing detail URL when one exists.
// Falls back to null for reminders that don't have a corresponding filing
// view (e.g., "Verify 2027 tax rates").
function getReminderHref(title: string): string | null {
  const nys45 = title.match(/NYS-45\s+Q([1-4])\s+(\d{4})/i)
  if (nys45) return `/filings/nys-45/${nys45[2]}/${nys45[1]}`

  const fed1040es = title.match(/Federal Estimated Tax\s+Q([1-4])\s+(\d{4})/i)
  if (fed1040es) return `/filings/federal-estimated-tax/${fed1040es[2]}/${fed1040es[1]}`

  const schedH = title.match(/Schedule H\s+(\d{4})/i)
  if (schedH) return `/filings/schedule-h/${schedH[1]}`

  return null
}

export function RemindersView({
  reminders,
  amounts = {},
}: {
  reminders: Reminder[]
  amounts?: Record<string, ReminderAmount>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const active = reminders.filter(r => !r.dismissed)
  const dismissed = reminders.filter(r => r.dismissed)

  async function dismiss(reminder: Reminder) {
    const supabase = createClient()

    const [{ error: updateError }, { error: insertError }] = await Promise.all([
      supabase.from('reminders').update({ dismissed: true }).eq('id', reminder.id),
      supabase.from('reminders').insert(rollForwardReminder(reminder)),
    ])

    if (updateError || insertError) {
      toast.error('Failed to dismiss reminder. Please try again.')
      return
    }
    toast.success("Reminder dismissed. Next year's reminder created.")
    startTransition(() => router.refresh())
  }

  if (!reminders.length) {
    return <p className="text-sm text-muted-foreground">No reminders.</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {active.map(r => {
          const { effective: effectiveDue, shifted } = shiftedDeadline(r.due_date)
          const fileBy = selfImposedDeadline(effectiveDue)
          const daysUntilDue = daysUntil(effectiveDue)
          const daysUntilFileBy = daysUntil(fileBy)
          // Only show the File By line for reminders that have a live $ amount
          // (financial filings) — the buffer doesn't really apply to "verify
          // tax rates" type reminders.
          const liveAmount = amounts[r.id]
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
                    <div className="flex-1 min-w-0">
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
                      {liveAmount ? (
                        <div className="text-xs space-y-0.5 mt-0.5">
                          <p>
                            <span className="font-medium text-foreground">File by</span>{' '}
                            <span className="text-foreground">{formatDate(fileBy)}</span>
                            <span className="text-muted-foreground"> · {daysUntilFileBy < 0 ? 'past your buffer' : daysUntilFileBy === 0 ? 'today' : `${daysUntilFileBy} days`}</span>
                          </p>
                          <p className="text-muted-foreground">
                            Due {formatDate(effectiveDue)}
                            {shifted && <span className="text-yellow-700"> (shifted from {formatDate(r.due_date)})</span>}
                            {' · '}
                            {daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due today' : `${daysUntilDue} days`}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Due {formatDate(effectiveDue)}
                          {shifted && <span className="text-yellow-700"> (shifted from {formatDate(r.due_date)})</span>}
                          {' · '}
                          {daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due today' : `${daysUntilDue} days`}
                        </p>
                      )}
                    </div>
                    <Badge variant={daysUntilDue <= 10 ? 'destructive' : daysUntilDue <= 20 ? 'secondary' : 'outline'}>
                      {daysUntilDue < 0 ? 'Overdue' : daysUntilDue === 0 ? 'Today' : `${daysUntilDue}d`}
                    </Badge>
                  </div>
                  {liveAmount && (
                    <p className="text-sm font-medium">
                      {formatCurrency(liveAmount.amount)}
                      <span className="text-xs font-normal text-muted-foreground"> · pays {liveAmount.agency}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                  {href && (
                    <Link
                      href={href}
                      className="text-xs text-primary font-medium hover:underline"
                    >
                      View Filing →
                    </Link>
                  )}
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
