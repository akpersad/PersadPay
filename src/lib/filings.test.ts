import { describe, it, expect } from 'vitest'
import {
  calculateScheduleH,
  calculateNYS45,
  calculateFederalEstimatedTax,
  getFederalEstimatedTaxPeriod,
  previousQuarter,
} from './filings'
import type { TaxRates } from './tax'
import type { Paystub } from './types'

const rates2026: TaxRates = {
  effective_year: 2026,
  fica_ss_rate: 0.062,
  fica_medicare_rate: 0.0145,
  ss_wage_base: 184500,
  futa_rate: 0.006,
  futa_wage_base: 7000,
  suta_wage_base: 13000,
  sdi_rate: 0.005,
  sdi_weekly_cap: 0.60,
  pfl_rate: 0.00432,
  pfl_annual_cap: 411.91,
  irs_mileage_rate: 0.725,
  fica_household_threshold: 3000,
  futa_quarterly_threshold: 1000,
  rsf_rate: 0.00075,
}

function makeStub(overrides: Partial<Paystub> = {}): Paystub {
  return {
    id: 'test-id',
    stub_number: 1,
    employee_id: 'emp-id',
    pay_period_start: '2026-01-06',
    pay_period_end: '2026-01-12',
    pay_date: '2026-01-12',
    hours_worked: 9,
    overtime_hours: 0,
    sick_hours: 0,
    reason: null,
    daily_hours: null,
    hourly_rate: 22,
    gross_pay: 198,
    federal_withholding: 0,
    fica_social_security: 12.28,
    fica_medicare: 2.87,
    state_withholding: 0,
    sdi: 0,
    pfl: 0,
    employer_fica_ss: 12.28,
    employer_fica_medicare: 2.87,
    futa: 1.19,
    suta: 8.12,
    net_pay: 182.85,
    payment_sent: true,
    zelle_transaction_id: null,
    stub_sent: true,
    stub_sent_at: null,
    resend_message_id: null,
    hysa_transferred: false,
    hysa_transferred_at: null,
    hysa_notes: null,
    created_at: '2026-01-12T00:00:00Z',
    created_by: 'admin-id',
    dbl_covered_at_generation: false,
    pfl_covered_at_generation: false,
    suta_rate_at_generation: 0.041,
    ...overrides,
  }
}

describe('calculateScheduleH — FICA threshold', () => {
  it('fica_threshold_met = false when total gross < $3,000', () => {
    const stubs = [makeStub({ gross_pay: 2999.99 })]
    const r = calculateScheduleH(stubs, rates2026, 2026)
    expect(r.fica_threshold_met).toBe(false)
  })

  it('fica_threshold_met = true when total gross = $3,000.00', () => {
    const stubs = [makeStub({ gross_pay: 3000 })]
    const r = calculateScheduleH(stubs, rates2026, 2026)
    expect(r.fica_threshold_met).toBe(true)
  })

  it('SS combined rate = 12.4% of ssWages', () => {
    const gross = 5000
    const stubs = [makeStub({ gross_pay: gross })]
    const r = calculateScheduleH(stubs, rates2026, 2026)
    expect(r.ss_wages).toBe(gross)
    expect(r.ss_tax).toBeCloseTo(gross * 0.062 * 2, 2)
  })

  it('Medicare combined rate = 2.9% of wages', () => {
    const gross = 5000
    const stubs = [makeStub({ gross_pay: gross })]
    const r = calculateScheduleH(stubs, rates2026, 2026)
    expect(r.medicare_wages).toBe(gross)
    expect(r.medicare_tax).toBeCloseTo(gross * 0.0145 * 2, 2)
  })
})

describe('calculateNYS45 — SUTA wage base cap', () => {
  it('excess wages accrue correctly across stubs when YTD approaches $13,000', () => {
    // Q1: two stubs bringing YTD from $12,600 to $12,996 (still under cap)
    const stub1 = makeStub({ gross_pay: 198, pay_date: '2026-01-12' })
    const stub2 = makeStub({ gross_pay: 198, pay_date: '2026-01-19' })
    const ytdBefore = 12600

    const r = calculateNYS45([stub1, stub2], ytdBefore, rates2026, 0.041, 2026, 1)

    // Both stubs fit under the cap: 12600 + 198 + 198 = 12,996 < 13,000
    expect(r.ui_taxable_wages).toBe(396)
    expect(r.ui_excess_wages).toBe(0)
  })

  it('caps taxable wages at $13,000 when YTD crosses the wage base', () => {
    // YTD before = $12,900, two stubs of $198 → first stub: $100 taxable, second: $0
    const stub1 = makeStub({ gross_pay: 198, pay_date: '2026-01-12' })
    const stub2 = makeStub({ gross_pay: 198, pay_date: '2026-01-19' })
    const ytdBefore = 12900

    const r = calculateNYS45([stub1, stub2], ytdBefore, rates2026, 0.041, 2026, 1)

    expect(r.ui_taxable_wages).toBe(100)
    expect(r.ui_excess_wages).toBeCloseTo(296, 2)
  })
})

describe('calculateNYS45 — total UI due rounding', () => {
  it('totals unrounded UI + RSF and truncates fractional cents, matching NY DOL', () => {
    // Real Q2 2026 case: $1,287 taxable at 4.025% UI + 0.075% RSF.
    // Rounded lines: 51.80 + 0.97 = 52.77, but the unrounded sum is
    // 51.80175 + 0.96525 = 52.767, truncated to 52.76 (what the state assessed).
    const stubs = [makeStub({ gross_pay: 1287, pay_date: '2026-05-13' })]
    const r = calculateNYS45(stubs, 0, rates2026, 0.04025, 2026, 2)
    expect(r.ui_tax_due).toBe(51.8)
    expect(r.rsf).toBe(0.97)
    expect(r.total_ui_due).toBe(52.76)
  })
})

describe('calculateNYS45 — covered employees by 12th of month', () => {
  // Recorded pay periods only span days actually worked (e.g. Mon–Wed),
  // so the 12th itself can fall in a gap between stubs even though the
  // employee worked the week containing the 12th.
  it('counts a month when a stub overlaps the week of the 12th but not the 12th itself', () => {
    // Real Q2 2026 shape: Jun 12 is a Friday; periods Jun 4–10 and Jun 15–17
    // straddle it, but Jun 4–10 overlaps the Sun–Sat week of Jun 7–13.
    const stubs = [
      makeStub({ pay_period_start: '2026-05-11', pay_period_end: '2026-05-13', pay_date: '2026-05-13' }),
      makeStub({ pay_period_start: '2026-06-04', pay_period_end: '2026-06-10', pay_date: '2026-06-10' }),
      makeStub({ pay_period_start: '2026-06-15', pay_period_end: '2026-06-17', pay_date: '2026-06-17' }),
    ]
    const r = calculateNYS45(stubs, 0, rates2026, 0.041, 2026, 2)
    expect(r.employee_counts_by_month).toEqual([0, 1, 1])
  })

  it('still counts a month when a stub period contains the 12th directly', () => {
    const stubs = [
      makeStub({ pay_period_start: '2026-05-11', pay_period_end: '2026-05-13', pay_date: '2026-05-13' }),
    ]
    const r = calculateNYS45(stubs, 0, rates2026, 0.041, 2026, 2)
    expect(r.employee_counts_by_month).toEqual([0, 1, 0])
  })

  it('does not count a month when no stub touches the week of the 12th', () => {
    // Week of Jun 12, 2026 is Sun Jun 7 – Sat Jun 13; both stubs miss it.
    const stubs = [
      makeStub({ pay_period_start: '2026-06-01', pay_period_end: '2026-06-03', pay_date: '2026-06-03' }),
      makeStub({ pay_period_start: '2026-06-22', pay_period_end: '2026-06-24', pay_date: '2026-06-24' }),
    ]
    const r = calculateNYS45(stubs, 0, rates2026, 0.041, 2026, 2)
    expect(r.employee_counts_by_month).toEqual([0, 0, 0])
  })

  it('uses allYearStubs when provided so cross-quarter periods are seen', () => {
    // Period covering the week of Mar 12 but paid in Q2 quarter list edge:
    // quarter stubs empty, year stubs carry the coverage.
    const yearStubs = [
      makeStub({ pay_period_start: '2026-04-08', pay_period_end: '2026-04-14', pay_date: '2026-04-14' }),
    ]
    const r = calculateNYS45([], 0, rates2026, 0.041, 2026, 2, yearStubs)
    expect(r.employee_counts_by_month).toEqual([1, 0, 0])
  })
})

describe('calculateFederalEstimatedTax — IRS fiscal periods', () => {
  it('Q1 period covers Jan 1 – Mar 31', () => {
    const p = getFederalEstimatedTaxPeriod(2026, 1)
    expect(p.start).toBe('2026-01-01')
    expect(p.end).toBe('2026-03-31')
  })

  it('Q2 period covers Apr 1 – May 31 (2 months)', () => {
    const p = getFederalEstimatedTaxPeriod(2026, 2)
    expect(p.start).toBe('2026-04-01')
    expect(p.end).toBe('2026-05-31')
  })

  it('Q3 period covers Jun 1 – Aug 31', () => {
    const p = getFederalEstimatedTaxPeriod(2026, 3)
    expect(p.start).toBe('2026-06-01')
    expect(p.end).toBe('2026-08-31')
  })

  it('Q4 period covers Sep 1 – Dec 31 (4 months)', () => {
    const p = getFederalEstimatedTaxPeriod(2026, 4)
    expect(p.start).toBe('2026-09-01')
    expect(p.end).toBe('2026-12-31')
  })

  it('sums combined FICA and FUTA correctly across stubs', () => {
    const stubs = [
      makeStub({ fica_social_security: 12.28, employer_fica_ss: 12.28, fica_medicare: 2.87, employer_fica_medicare: 2.87, federal_withholding: 0, futa: 1.19, pay_date: '2026-01-12' }),
      makeStub({ fica_social_security: 12.28, employer_fica_ss: 12.28, fica_medicare: 2.87, employer_fica_medicare: 2.87, federal_withholding: 0, futa: 1.19, pay_date: '2026-01-19' }),
    ]
    const r = calculateFederalEstimatedTax(stubs, 2026, 1)
    // SS combined: (12.28 + 12.28) × 2 = 49.12
    expect(r.ss_combined).toBeCloseTo(49.12, 2)
    // Medicare combined: (2.87 + 2.87) × 2 = 11.48
    expect(r.medicare_combined).toBeCloseTo(11.48, 2)
    // FUTA: 1.19 + 1.19 = 2.38
    expect(r.futa).toBeCloseTo(2.38, 2)
    // Total: 49.12 + 11.48 + 0 + 2.38 = 62.98
    expect(r.total_due).toBeCloseTo(62.98, 2)
  })
})

describe('previousQuarter', () => {
  it('steps back within the same year', () => {
    expect(previousQuarter(2026, 3)).toEqual({ year: 2026, quarter: 2 })
    expect(previousQuarter(2026, 2)).toEqual({ year: 2026, quarter: 1 })
    expect(previousQuarter(2026, 4)).toEqual({ year: 2026, quarter: 3 })
  })

  it('wraps Q1 into the prior year Q4', () => {
    expect(previousQuarter(2027, 1)).toEqual({ year: 2026, quarter: 4 })
  })
})
