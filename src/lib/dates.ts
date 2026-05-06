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

// Federal holidays observed by IRS / NY DTF / SSA when shifting deadlines.
// Dates in YYYY-MM-DD form. Federal-observed dates only — both agencies use
// the federal calendar for filing-deadline next-business-day rules. List
// covers 2025–2027 to safely cover all paths the user might browse.
const FEDERAL_HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19',
  '2025-07-04', '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  // 2027
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24',
])

/**
 * Returns the next business day on or after the given date — skipping
 * Saturdays, Sundays, and federal holidays. Used to display the actual
 * filing deadline when a statutory due date lands on a non-business day.
 *
 * IRS, NY DTF, and SSA all follow the next-business-day rule for filing
 * deadlines (IRC § 7503 for federal; NY DTF Pub 72 for state).
 */
export function nextBusinessDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  while (true) {
    const day = date.getDay()
    const iso = date.toLocaleDateString('en-CA')
    if (day !== 0 && day !== 6 && !FEDERAL_HOLIDAYS.has(iso)) {
      return iso
    }
    date.setDate(date.getDate() + 1)
  }
}

/**
 * If a statutory deadline falls on a weekend / federal holiday, returns the
 * shifted business-day deadline; otherwise returns the original. Returns
 * the same string when no shift applies, so callers can safely render
 * either value.
 */
export function shiftedDeadline(dateStr: string): { effective: string; shifted: boolean } {
  const next = nextBusinessDay(dateStr)
  return { effective: next, shifted: next !== dateStr }
}

/**
 * Returns the most recent business day on or before the given date. Used for
 * self-imposed pre-deadlines — when the user wants a personal buffer before
 * the statutory due date, "due minus N days" needs to land on a workday and
 * we shift *earlier* (not later) to preserve the buffer.
 */
export function previousBusinessDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  while (true) {
    const day = date.getDay()
    const iso = date.toLocaleDateString('en-CA')
    if (day !== 0 && day !== 6 && !FEDERAL_HOLIDAYS.has(iso)) {
      return iso
    }
    date.setDate(date.getDate() - 1)
  }
}

/**
 * Self-imposed "file by" deadline — N days before the statutory due date,
 * shifted earlier to the most recent business day if it lands on a weekend
 * or federal holiday. Default buffer is 7 days. Used as a personal target
 * so the user has slack before the actual deadline.
 */
export function selfImposedDeadline(dueDateStr: string, daysEarly = 7): string {
  const earlier = addDays(dueDateStr, -daysEarly)
  return previousBusinessDay(earlier)
}
