import { describe, it, expect } from 'vitest'
import { calculateTaxes } from './tax'
import type { TaxRates, TaxInputs } from './tax'

// 2026 rates — must match the tax_rates DB row for effective_year = 2026
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
}

function inputs(overrides: Partial<TaxInputs> = {}): TaxInputs {
  return {
    gross: 198,
    ytdGrossBefore: 0,
    ytdPflBefore: 0,
    federalWithholding: 0,
    stateWithholding: 0,
    dblCovered: false,
    pflCovered: false,
    sutaRate: 0.041,
    ...overrides,
  }
}

describe('calculateTaxes — happy path (9 hrs × $22 = $198)', () => {
  it('FICA SS: 6.2% of gross', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.fica_social_security).toBe(12.28)
  })

  it('FICA Medicare: 1.45% of gross', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.fica_medicare).toBe(2.87)
  })

  it('SDI is $0 by default (dblCovered = false)', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.sdi).toBe(0)
  })

  it('PFL is $0 by default (pflCovered = false)', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.pfl).toBe(0)
  })

  it('employer FICA mirrors employee amounts', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.employer_fica_ss).toBe(r.fica_social_security)
    expect(r.employer_fica_medicare).toBe(r.fica_medicare)
  })

  it('FUTA: 0.6% of gross when YTD < $7,000 cap', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.futa).toBe(1.19)
  })

  it('net pay = gross − FICA SS − FICA Medicare (no other deductions)', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.net_pay).toBe(182.85)
  })
})

describe('calculateTaxes — zero hours', () => {
  it('all fields are $0 when gross = 0', () => {
    const r = calculateTaxes(inputs({ gross: 0, federalWithholding: 50, stateWithholding: 20 }), rates2026)
    expect(r.gross_pay).toBe(0)
    expect(r.federal_withholding).toBe(0)
    expect(r.fica_social_security).toBe(0)
    expect(r.fica_medicare).toBe(0)
    expect(r.state_withholding).toBe(0)
    expect(r.sdi).toBe(0)
    expect(r.pfl).toBe(0)
    expect(r.employer_fica_ss).toBe(0)
    expect(r.employer_fica_medicare).toBe(0)
    expect(r.futa).toBe(0)
    expect(r.suta).toBe(0)
    expect(r.net_pay).toBe(0)
  })
})

describe('calculateTaxes — SDI cap (dblCovered = true)', () => {
  it('caps at $0.60/week when gross ≥ $120', () => {
    const r = calculateTaxes(inputs({ gross: 198, dblCovered: true }), rates2026)
    expect(r.sdi).toBe(0.60)
  })

  it('does not cap when gross < $120 (0.5% is under $0.60)', () => {
    // gross = 100 → 0.5% = $0.50 (under cap)
    const r = calculateTaxes(inputs({ gross: 100, dblCovered: true }), rates2026)
    expect(r.sdi).toBe(0.50)
  })
})

describe('calculateTaxes — PFL annual cap (pflCovered = true)', () => {
  it('collects only remaining cap space', () => {
    // Cap is $411.91; ytdPfl = $411.81 → only $0.10 remaining.
    // Using toBeCloseTo because 411.91 - 411.81 has an IEEE-754 artifact.
    const r = calculateTaxes(inputs({ gross: 198, pflCovered: true, ytdPflBefore: 411.81 }), rates2026)
    expect(r.pfl).toBeCloseTo(0.10, 5)
  })

  it('collects zero once cap is exhausted', () => {
    const r = calculateTaxes(inputs({ gross: 198, pflCovered: true, ytdPflBefore: 411.91 }), rates2026)
    expect(r.pfl).toBe(0)
  })
})

describe('calculateTaxes — FUTA wage base crossover', () => {
  it('taxes only the room under $7,000 when YTD is $6,900', () => {
    // YTD = $6,900, gross = $198 → only $100 taxable → FUTA = $0.60
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 6900 }), rates2026)
    expect(r.futa).toBe(0.60)
  })

  it('FUTA = $0 once YTD has already crossed the wage base', () => {
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 7100 }), rates2026)
    expect(r.futa).toBe(0)
  })
})

describe('calculateTaxes — SUTA wage base crossover ($13,000)', () => {
  it('taxes only room under $13,000 when YTD is $12,900', () => {
    // YTD = $12,900, gross = $198 → only $100 taxable → SUTA = $100 × 0.041 = $4.10
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 12900 }), rates2026)
    expect(r.suta).toBe(4.10)
  })

  it('SUTA = $0 once YTD exceeds wage base', () => {
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 13100 }), rates2026)
    expect(r.suta).toBe(0)
  })
})

describe('calculateTaxes — SS wage base crossover ($184,500)', () => {
  it('taxes only room under SS wage base', () => {
    // YTD = $184,400, gross = $198 → only $100 subject to SS → SS = $100 × 6.2% = $6.20
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 184400 }), rates2026)
    expect(r.fica_social_security).toBe(6.20)
  })

  it('SS = $0 once YTD exceeds wage base', () => {
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 184600 }), rates2026)
    expect(r.fica_social_security).toBe(0)
  })
})

describe('IEEE-754 rounding (round function)', () => {
  it('round(1.005) === 1.01', () => {
    // Verified through FUTA on a specific gross: 1.005 / 0.006 = 167.5 gross
    // Direct test via a calc that triggers the rounding edge case:
    // gross = 167.5, FUTA rate = 0.006 → naive round gives $1.00, correct is $1.01
    const r = calculateTaxes(inputs({ gross: 167.5, ytdGrossBefore: 0 }), rates2026)
    // 167.5 × 0.006 = 1.005 → should round to 1.01
    expect(r.futa).toBe(1.01)
  })
})
