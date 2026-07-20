import type { Reminder } from '@/lib/types'

/**
 * Compute next year's equivalent of a dismissed reminder.
 *
 * The due date always advances one calendar year (statutory dates are stored
 * unshifted; weekend/holiday shifting happens at display time via
 * shiftedDeadline()). The title's year is incremented from its OWN matched
 * year, not derived from the due date — for filings like Schedule H, NYS-45
 * Q4, 1040-ES Q4, and W-2/W-3 the title carries the tax year (due year − 1),
 * so deriving it from the due date would skip a year.
 *
 * Every year token in the description advances by one too — descriptions
 * reference both tax years ("wages paid in 2025") and due years
 * ("by Jan 31, 2027"), and on a one-year roll-forward all of them move
 * together. Copying the description verbatim left stale years behind.
 */
export function rollForwardReminder(reminder: Pick<Reminder, 'title' | 'due_date' | 'description'>): {
  title: string
  due_date: string
  description: string
  dismissed: false
  email_sent: false
} {
  const due_date = reminder.due_date.replace(/^\d{4}/, y => String(parseInt(y) + 1))
  const title = reminder.title.replace(/\b20\d{2}\b(?=[^0-9]*$)/, y => String(parseInt(y) + 1))
  const description = reminder.description.replace(/\b20\d{2}\b/g, y => String(parseInt(y) + 1))
  return {
    title,
    due_date,
    description,
    dismissed: false,
    email_sent: false,
  }
}
