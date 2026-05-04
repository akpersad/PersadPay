// Reminder email lead times — verify these feel right each year
export const REMINDER_LEAD_DAYS = 20
export const REMINDER_FOLLOWUP_DAYS = 10

const NY_TZ = 'America/New_York'

/** Format a date string or Date object for display in America/New_York timezone */
export function formatNYDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    timeZone: NY_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  })
}

/** Format a date-only string (YYYY-MM-DD) as "Jan 1, 2026" without timezone conversion */
export function formatDate(dateStr: string): string {
  // date-only strings should not be run through timezone conversion
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Format a date range: "Jan 1 – Jan 7, 2026" */
export function formatDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const s = new Date(sy, sm - 1, sd)
  const e = new Date(ey, em - 1, ed)
  const startStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

/** Days between today and a future date (negative if past) */
export function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

/** Get today's date as YYYY-MM-DD in NY timezone */
export function todayNY(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: NY_TZ }) // en-CA gives YYYY-MM-DD
}

/** Add days to a YYYY-MM-DD string, return YYYY-MM-DD */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD
}

/** Format a dollar amount */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
