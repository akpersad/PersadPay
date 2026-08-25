import { describe, it, expect } from 'vitest'
import { computeCoverageWatch, type CoverageStub } from './coverage'

// Builds a stub with a per-day breakdown, the shape the live data uses.
function stub(payDate: string, daily: Record<string, number>): CoverageStub {
  const total = Object.values(daily).reduce((a, b) => a + b, 0)
  return { pay_date: payDate, hours_worked: total, daily_hours: daily }
}

// Legacy stub with no daily breakdown, to exercise the approximation fallback.
function legacyStub(payDate: string, hours: number): CoverageStub {
  return { pay_date: payDate, hours_worked: hours, daily_hours: null }
}

describe('computeCoverageWatch — the live 2026 schedule', () => {
  // Mirrors production as of 2026-08-24: 4.5 hrs on each of two days per week.
  const stubs: CoverageStub[] = [
    stub('2026-07-01', { '2026-06-29': 4.5, '2026-06-30': 0, '2026-07-01': 4.5 }),
    stub('2026-07-08', { '2026-07-08': 4.5 }),
    stub('2026-07-15', { '2026-07-13': 4.5, '2026-07-15': 4.5 }),
    stub('2026-07-22', { '2026-07-20': 4.5, '2026-07-22': 4.5 }),
    stub('2026-07-29', { '2026-07-27': 4.5, '2026-07-29': 4.5 }),
    stub('2026-08-12', { '2026-08-10': 4.5, '2026-08-12': 4.5 }),
    stub('2026-08-19', { '2026-08-17': 4.5, '2026-08-19': 4.5 }),
  ]

  it('stays ok at ~9 hrs/wk and reports the real per-week figure, not a fixed-divisor average', () => {
    const r = computeCoverageWatch(stubs, '2026-08-24')
    expect(r.status).toBe('ok')
    // Each worked week is 9 hrs. The old fixed /26 divisor reported 4.5 here.
    expect(r.peak_weekly_hours).toBe(9)
    expect(r.avg_hrs_last_8_weeks).toBeGreaterThan(6)
    expect(r.days_are_approximate).toBe(false)
  })

  it('counts distinct days worked from daily_hours, not one per stub', () => {
    const r = computeCoverageWatch(stubs, '2026-08-24')
    // 13 days have hours > 0 across these 7 stubs; the stub-count proxy said 7.
    expect(r.days_worked_this_year).toBe(13)
    expect(r.days_worked_last_52_weeks).toBe(13)
  })
})

describe('computeCoverageWatch — WCL § 202(2) requires BOTH conditions', () => {
  // 25 hrs/wk over 5 days, which is over the 20-hour line immediately.
  function heavyWeek(sunday: string): CoverageStub {
    const daily: Record<string, number> = {}
    for (let i = 1; i <= 5; i++) {
      const d = new Date(Date.UTC(
        Number(sunday.slice(0, 4)), Number(sunday.slice(5, 7)) - 1, Number(sunday.slice(8, 10)) + i,
      ))
      daily[d.toISOString().slice(0, 10)] = 5
    }
    return stub(sunday, daily)
  }

  it('warns but does not declare coverage required before 30 days worked', () => {
    // Two weeks at 25 hrs = 10 days worked. Hours condition met, days not.
    const r = computeCoverageWatch(
      [heavyWeek('2026-08-09'), heavyWeek('2026-08-16')],
      '2026-08-24',
    )
    expect(r.peak_weekly_hours).toBe(25)
    expect(r.days_worked_this_year).toBe(10)
    expect(r.status).toBe('approaching')
    expect(r.message).toContain('30 needed')
  })

  it('declares coverage required once 20+ hrs/wk and 30+ days both hold', () => {
    // Seven weeks at 25 hrs = 35 days worked, all inside the 8-week window.
    const weeks = [
      '2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26',
      '2026-08-02', '2026-08-09', '2026-08-16',
    ].map(heavyWeek)

    const r = computeCoverageWatch(weeks, '2026-08-24')
    expect(r.peak_weekly_hours).toBe(25)
    expect(r.days_worked_this_year).toBe(35)
    expect(r.status).toBe('exceeded')
    expect(r.message).toContain('§ 202(2)')
  })

  it('does not let a long low-hours stretch dilute a qualifying week away', () => {
    // The failure mode of the old 26-week average: 4 heavy weeks (25 hrs) plus
    // many 4-hour weeks averaged under 20 and reported "ok". The per-week test
    // must still see the 25-hour peak.
    const heavy = ['2026-08-02', '2026-08-09', '2026-08-16'].map(heavyWeek)
    const light = ['2026-07-05', '2026-07-12', '2026-07-19', '2026-07-26']
      .map(d => stub(d, { [`${d}`]: 4 }))

    const r = computeCoverageWatch([...heavy, ...light], '2026-08-24')
    expect(r.peak_weekly_hours).toBe(25)
    expect(r.avg_hrs_last_8_weeks).toBeLessThan(20)
    // Peak alone triggers the hours condition, so this cannot report 'ok'.
    expect(r.status).not.toBe('ok')
  })
})

describe('computeCoverageWatch — legacy stubs without daily_hours', () => {
  it('falls back to one day per stub and says so', () => {
    const r = computeCoverageWatch(
      [legacyStub('2026-08-12', 9), legacyStub('2026-08-19', 9)],
      '2026-08-24',
    )
    expect(r.days_worked_this_year).toBe(2)
    expect(r.days_are_approximate).toBe(true)
  })

  it('reports nothing and stays ok with no stubs at all', () => {
    const r = computeCoverageWatch([], '2026-08-24')
    expect(r.status).toBe('ok')
    expect(r.peak_weekly_hours).toBe(0)
    expect(r.avg_hrs_last_8_weeks).toBe(0)
    expect(r.days_worked_this_year).toBe(0)
  })
})
