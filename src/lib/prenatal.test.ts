import { describe, it, expect } from 'vitest'
import {
  computePrenatalLeaveBalance,
  availableExcluding,
  PRENATAL_LEAVE_HOURS_PER_PERIOD,
} from './prenatal'

describe('computePrenatalLeaveBalance — the P695 worked example', () => {
  // "if you use your first hour of Paid Prenatal Leave on June 1st, 2025, you
  //  have 20 hours available through May 31st, 2026. If after May 31st, you
  //  next need to use Paid Prenatal Leave on August 2nd, 2026, that date would
  //  trigger the start of another 52-week period."
  it('runs the first period from first use through the same date next year minus a day', () => {
    const b = computePrenatalLeaveBalance([{ date: '2025-06-01', hours: 1 }], '2025-06-01')
    expect(b.current).not.toBeNull()
    expect(b.current!.start).toBe('2025-06-01')
    expect(b.current!.end).toBe('2026-05-31')
    expect(b.current!.hours_used).toBe(1)
    expect(b.hours_available).toBe(19)
  })

  it('opens a second period on the first use after the window expires', () => {
    const b = computePrenatalLeaveBalance(
      [
        { date: '2025-06-01', hours: 1 },
        { date: '2026-08-02', hours: 3 },
      ],
      '2026-08-02',
    )
    expect(b.periods).toHaveLength(2)
    expect(b.periods[0].end).toBe('2026-05-31')
    expect(b.periods[1].start).toBe('2026-08-02')
    expect(b.periods[1].end).toBe('2027-08-01')
    // The new period is a fresh 20 hours; the old period's use does not follow it.
    expect(b.hours_available).toBe(17)
  })

  it('keeps a use on the final day of the window inside the same period', () => {
    const b = computePrenatalLeaveBalance(
      [
        { date: '2025-06-01', hours: 4 },
        { date: '2026-05-31', hours: 2 },
      ],
      '2026-05-31',
    )
    expect(b.periods).toHaveLength(1)
    expect(b.periods[0].hours_used).toBe(6)
    expect(b.hours_available).toBe(14)
  })

  it('starts a new period for a use one day after the window closes', () => {
    const b = computePrenatalLeaveBalance(
      [
        { date: '2025-06-01', hours: 4 },
        { date: '2026-06-01', hours: 2 },
      ],
      '2026-06-01',
    )
    expect(b.periods).toHaveLength(2)
    expect(b.hours_available).toBe(18)
  })
})

describe('computePrenatalLeaveBalance — availability', () => {
  it('offers the full entitlement when nothing has ever been used', () => {
    const b = computePrenatalLeaveBalance([], '2026-08-24')
    expect(b.has_history).toBe(false)
    expect(b.current).toBeNull()
    expect(b.hours_available).toBe(PRENATAL_LEAVE_HOURS_PER_PERIOD)
  })

  it('offers a fresh entitlement once the last period has lapsed', () => {
    // Used up entirely in a period that closed before the as-of date.
    const b = computePrenatalLeaveBalance([{ date: '2025-01-06', hours: 20 }], '2026-08-24')
    expect(b.has_history).toBe(true)
    expect(b.current).toBeNull()
    expect(b.periods[0].hours_remaining).toBe(0)
    // Unused hours don't carry over, but a lapsed period doesn't block a new one.
    expect(b.hours_available).toBe(20)
  })

  it('floors remaining at zero rather than going negative if over-recorded', () => {
    const b = computePrenatalLeaveBalance(
      [
        { date: '2026-03-02', hours: 18 },
        { date: '2026-03-09', hours: 5 },
      ],
      '2026-03-09',
    )
    expect(b.current!.hours_used).toBe(23)
    expect(b.current!.hours_remaining).toBe(0)
    expect(b.hours_available).toBe(0)
  })

  it('ignores zero-hour entries so ordinary stubs never open a period', () => {
    const b = computePrenatalLeaveBalance(
      [
        { date: '2026-05-13', hours: 0 },
        { date: '2026-08-19', hours: 0 },
      ],
      '2026-08-24',
    )
    expect(b.has_history).toBe(false)
    expect(b.periods).toHaveLength(0)
    expect(b.hours_available).toBe(20)
  })

  it('accepts uses in any order', () => {
    const shuffled = computePrenatalLeaveBalance(
      [
        { date: '2026-04-01', hours: 2 },
        { date: '2026-02-01', hours: 3 },
        { date: '2026-03-01', hours: 1 },
      ],
      '2026-04-01',
    )
    expect(shuffled.current!.start).toBe('2026-02-01')
    expect(shuffled.current!.hours_used).toBe(6)
    expect(shuffled.hours_available).toBe(14)
  })

  it('handles fractional hours without float drift', () => {
    const b = computePrenatalLeaveBalance(
      [
        { date: '2026-02-02', hours: 1.5 },
        { date: '2026-02-09', hours: 2.25 },
      ],
      '2026-02-09',
    )
    expect(b.current!.hours_used).toBe(3.75)
    expect(b.hours_available).toBe(16.25)
  })
})

describe('availableExcluding — editing a stub that already records leave', () => {
  it('does not count the edited stub against its own balance', () => {
    const uses = [
      { date: '2026-03-02', hours: 4 },
      { date: '2026-03-09', hours: 6 },
    ]
    // Editing the 03-09 stub: 4 hours are spoken for, so 16 are available to it.
    expect(availableExcluding(uses, '2026-03-09', '2026-03-09')).toBe(16)
    // Without excluding, only 10 would appear available.
    expect(computePrenatalLeaveBalance(uses, '2026-03-09').hours_available).toBe(10)
  })
})
