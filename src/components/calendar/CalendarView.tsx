'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, PiggyBank } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateRange, formatCurrency } from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface CalendarStub {
  id: string
  stub_number: number
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  hours_worked: number
  daily_hours: Record<string, number> | null
  payment_sent: boolean
  stub_sent: boolean
  hysa_transferred: boolean
  gross_pay: number
}

interface Props {
  stubs: CalendarStub[]
  year: number
  month: number
}

const DAY_ABBRS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function getMonthDays(year: number, month: number): Array<string | null> {
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startWeekday = firstDay.getDay()
  const days: Array<string | null> = []
  for (let i = 0; i < startWeekday; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return days
}

function formatHours(h: number): string {
  if (h === 0) return '0h'
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(2).replace(/\.?0+$/, '')}h`
}

function stubBgClass(stub: CalendarStub) {
  if (!stub.payment_sent) return 'bg-yellow-50 border border-yellow-200'
  if (!stub.stub_sent) return 'bg-sky-50 border border-sky-200'
  return 'bg-green-50 border border-green-200'
}

export function CalendarView({ stubs, year, month }: Props) {
  const router = useRouter()
  const days = getMonthDays(year, month)
  const monthFirst = `${year}-${String(month).padStart(2, '0')}-01`

  // Map each calendar date to its stub (for days within a pay period).
  const dateToStub = new Map<string, CalendarStub>()
  for (const stub of stubs) {
    const cur = new Date(stub.pay_period_start + 'T12:00:00')
    const end = new Date(stub.pay_period_end + 'T12:00:00')
    while (cur <= end) {
      dateToStub.set(cur.toISOString().slice(0, 10), stub)
      cur.setDate(cur.getDate() + 1)
    }
  }

  // First visible day per stub within this month (for stub-number label placement).
  const stubFirstDay = new Map<string, string>()
  for (const stub of stubs) {
    stubFirstDay.set(
      stub.id,
      stub.pay_period_start >= monthFirst ? stub.pay_period_start : monthFirst,
    )
  }

  function navMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    router.push(`/calendar?month=${y}-${String(m).padStart(2, '0')}`)
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Calendar</h1>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navMonth(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">{monthLabel}</h1>
        <Button variant="ghost" size="icon" onClick={() => navMonth(1)}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_ABBRS.map(d => (
          <div key={d} className="text-center text-[11px] text-muted-foreground pb-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((date, idx) => {
          if (!date) return <div key={`pad-${idx}`} className="min-h-[52px]" />

          const stub = dateToStub.get(date)
          const isFirst = stub != null && stubFirstDay.get(stub.id) === date
          const dailyHrs = stub?.daily_hours?.[date]
          const showDailyHrs = dailyHrs !== undefined && Number(dailyHrs) > 0
          // For stubs without a daily breakdown, show the total on the first visible day.
          const showTotalHrs = isFirst && stub != null && !stub.daily_hours && Number(stub.hours_worked) > 0

          return (
            <div
              key={date}
              role={stub ? 'button' : undefined}
              tabIndex={stub ? 0 : undefined}
              onClick={() => stub && router.push(`/stubs/${stub.id}`)}
              onKeyDown={e => stub && e.key === 'Enter' && router.push(`/stubs/${stub.id}`)}
              className={cn(
                'min-h-[52px] rounded-sm p-1 flex flex-col select-none',
                stub
                  ? cn(stubBgClass(stub), 'cursor-pointer hover:opacity-75 active:opacity-60 transition-opacity')
                  : 'bg-muted/20',
              )}
            >
              <span className="text-[11px] text-muted-foreground leading-none">
                {parseInt(date.slice(8), 10)}
              </span>
              {isFirst && (
                <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
                  #{stub!.stub_number}
                </span>
              )}
              {showDailyHrs && (
                <span className="text-[11px] font-semibold text-center mt-auto leading-none pt-1">
                  {formatHours(Number(dailyHrs))}
                </span>
              )}
              {showTotalHrs && (
                <span className="text-[11px] font-semibold text-center mt-auto leading-none pt-1">
                  {formatHours(Number(stub!.hours_worked))}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-yellow-50 border border-yellow-200 flex-shrink-0" />
          Unpaid
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-sky-50 border border-sky-200 flex-shrink-0" />
          Paid
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-50 border border-green-200 flex-shrink-0" />
          Paid + emailed
        </div>
      </div>

      {/* Stub list for quick reference */}
      {stubs.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Stubs this month
          </p>
          {stubs.map(stub => (
            <button
              key={stub.id}
              onClick={() => router.push(`/stubs/${stub.id}`)}
              className={cn(
                'w-full text-left rounded-lg border px-3 py-2.5 transition-opacity hover:opacity-80',
                stubBgClass(stub),
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  #{stub.stub_number} · {formatDateRange(stub.pay_period_start, stub.pay_period_end)}
                </span>
                <span className="text-sm font-semibold">{formatCurrency(Number(stub.gross_pay))}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {Number(stub.hours_worked)} hrs
                  {stub.daily_hours ? ' · daily breakdown' : ''}
                </span>
                <div className="flex gap-1">
                  {stub.payment_sent
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    : <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                  }
                  {stub.stub_sent
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                    : <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                  <PiggyBank className={cn('h-3.5 w-3.5', stub.hysa_transferred ? 'text-green-600' : 'text-muted-foreground')} />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center pt-2">No stubs in this month.</p>
      )}
    </div>
  )
}
