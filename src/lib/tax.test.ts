import { describe, it, expect } from 'vitest'
import { calculateTaxes, roundToCents, hysaAmountForStub } from './tax'
import type { TaxRates, TaxInputs } from './tax'

// 2026 rates — must match the tax_rates DB row for effective_year = 2026
const rates2026: TaxRates = {
  effective_year: 2026,
  fica_ss_rate: 0.062,
  fica_medicare_rate: 0.0145,
  ss_wage_base: 184500,
  futa_rate: 0.006,
  futa_wage_base: 7000,
  suta_wage_base: 17600,  // NY 2026: 18% of state average annual wage (updated from $13,000)
  sdi_rate: 0.005,
  sdi_weekly_cap: 0.60,
  pfl_rate: 0.00432,
  pfl_annual_cap: 411.91,
  irs_mileage_rate: 0.725,
  fica_household_threshold: 3000,
  futa_quarterly_threshold: 1000,
  rsf_rate: 0.00075,
}

// Base inputs: first stub of the year (YTD=0). FICA applies from the first
// dollar — the $3,000 household threshold gates Schedule H *reporting*, not
// per-stub withholding. See the rationale block in src/lib/tax.ts.
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

describe('calculateTaxes — happy path (9 hrs × $22 = $198, first stub of year)', () => {
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

  it('employer FICA equals employee FICA (rates symmetric; computed independently)', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.employer_fica_ss).toBe(r.fica_social_security)
    expect(r.employer_fica_medicare).toBe(r.fica_medicare)
  })

  it('FUTA: 0.6% of gross when YTD < $7,000 cap', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.futa).toBe(1.19)
  })

  it('SUTA: 4.1% of gross when YTD < wage base', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.suta).toBe(8.12)
  })

  it('net pay = gross − FICA SS − FICA Medicare (no other deductions)', () => {
    const r = calculateTaxes(inputs(), rates2026)
    expect(r.net_pay).toBe(182.85)
  })
})

describe('calculateTaxes — FICA withholds from $1 (Pub 926 / Topic 756)', () => {
  // Once a household employee earns ≥ $3,000 in a year, FICA is owed on ALL
  // wages paid that year, including wages before the threshold was met.
  // For a household certain to cross (annualized 9 hrs/wk × $22 ≈ $10K),
  // withholding from week 1 is correct. Schedule H year-end (lib/filings.ts)
  // is what reconciles the threshold for actual liability.
  it('FICA SS applies on the very first stub (YTD=0)', () => {
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 0 }), rates2026)
    expect(r.fica_social_security).toBe(12.28)
    expect(r.fica_medicare).toBe(2.87)
    expect(r.employer_fica_ss).toBe(12.28)
    expect(r.employer_fica_medicare).toBe(2.87)
  })

  it('FICA applies on full gross at every YTD level below the SS wage base', () => {
    // YTD=$2,900 → no special threshold-crossing math; full $198 is FICA-eligible.
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 2900 }), rates2026)
    expect(r.fica_social_security).toBe(12.28)
    expect(r.fica_medicare).toBe(2.87)
  })
})

describe('calculateTaxes — verified rate-table for Persad household (regression)', () => {
  // Locks in the numbers presented to the babysitter. If any of these break,
  // either rates changed (update tax_rates DB row first) or the calc drifted.
  it.each([
    ['$22.00/hr', 22.00, { fica_ss: 12.28, fica_med: 2.87, futa: 1.19, suta: 8.12, net: 182.85 }],
    ['$22.50/hr', 22.50, { fica_ss: 12.56, fica_med: 2.94, futa: 1.22, suta: 8.30, net: 187.00 }],
    ['$23.00/hr', 23.00, { fica_ss: 12.83, fica_med: 3.00, futa: 1.24, suta: 8.49, net: 191.17 }],
  ])('9 hrs @ %s', (_label, hourlyRate, expected) => {
    const gross = Math.round(9 * hourlyRate * 100) / 100
    const r = calculateTaxes(inputs({ gross }), rates2026)
    expect(r.gross_pay).toBe(gross)
    expect(r.fica_social_security).toBe(expected.fica_ss)
    expect(r.fica_medicare).toBe(expected.fica_med)
    expect(r.futa).toBe(expected.futa)
    expect(r.suta).toBe(expected.suta)
    expect(r.net_pay).toBe(expected.net)
    // Employer FICA mirrors employee FICA at symmetric rates
    expect(r.employer_fica_ss).toBe(expected.fica_ss)
    expect(r.employer_fica_medicare).toBe(expected.fica_med)
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

describe('calculateTaxes — SUTA wage base crossover ($17,600 NY 2026)', () => {
  it('taxes only room under $17,600 when YTD is $17,500', () => {
    // YTD = $17,500, gross = $198 → only $100 taxable → SUTA = $100 × 0.041 = $4.10
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 17500 }), rates2026)
    expect(r.suta).toBe(4.10)
  })

  it('SUTA = $0 once YTD exceeds wage base', () => {
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 17700 }), rates2026)
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

  it('rounds literal .xx5 ties half-up regardless of float representation', () => {
    // These literals sit just below their decimal value in IEEE-754
    // (1.005 is stored as 1.00499999999999989...), so a naive
    // Math.round(n * 100) rounds them down.
    expect(roundToCents(1.005)).toBe(1.01)
    expect(roundToCents(2.675)).toBe(2.68)
    expect(roundToCents(8.575)).toBe(8.58)
    expect(roundToCents(1234.565)).toBe(1234.57)
    expect(roundToCents(0.005)).toBe(0.01)
  })

  it('rounds negative ties away from zero (half-up on the magnitude)', () => {
    expect(roundToCents(-1.005)).toBe(-1.01)
    expect(roundToCents(-2.675)).toBe(-2.68)
  })

  it('leaves exact cents untouched', () => {
    expect(roundToCents(19.73)).toBe(19.73)
    expect(roundToCents(0)).toBe(0)
    expect(roundToCents(-52.76)).toBe(-52.76)
  })
})

describe('calculateTaxes — gross rounded to cents before storage', () => {
  it('rounds a half-cent gross so gross − deductions = net holds', () => {
    // 33.25 hrs × $22.33 = $742.4725 — a half-cent gross that used to be
    // stored raw and break the stub identity by $0.01.
    const r = calculateTaxes(inputs({ gross: 33.25 * 22.33, ytdGrossBefore: 0 }), rates2026)
    expect(r.gross_pay).toBe(742.47)
    const deductions = r.federal_withholding + r.fica_social_security + r.fica_medicare
      + r.state_withholding + r.sdi + r.pfl
    expect(roundToCents(r.gross_pay - deductions)).toBe(r.net_pay)
  })
})

describe('calculateTaxes — NY Re-employment Service Fund (RSF)', () => {
  it('accrues RSF on the same taxable base as SUTA', () => {
    // Live case: $198 gross x 0.075% = 0.1485 -> 0.15, alongside SUTA at the
    // live UI-only rate of 4.025% (198 x 0.04025 = 7.9695 -> 7.97).
    const r = calculateTaxes(
      inputs({ gross: 198, ytdGrossBefore: 0, sutaRate: 0.04025 }),
      rates2026,
    )
    expect(r.rsf).toBe(0.15)
    expect(r.suta).toBe(7.97)
  })

  it('does not withhold RSF from the employee', () => {
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 0 }), rates2026)
    const employeeDeductions = r.federal_withholding + r.fica_social_security
      + r.fica_medicare + r.state_withholding + r.sdi + r.pfl
    expect(roundToCents(r.gross_pay - employeeDeductions)).toBe(r.net_pay)
    // RSF is employer-side, so net pay is untouched by it.
    expect(r.net_pay).toBe(182.85)
  })

  it('stops RSF at the SUTA wage base', () => {
    // YTD already at the base: no room left, so both SUTA and RSF are zero.
    const r = calculateTaxes(inputs({ gross: 198, ytdGrossBefore: 17600 }), rates2026)
    expect(r.suta).toBe(0)
    expect(r.rsf).toBe(0)
  })

  it('is zero on a zero-hour stub', () => {
    const r = calculateTaxes(inputs({ gross: 0, ytdGrossBefore: 1000 }), rates2026)
    expect(r.rsf).toBe(0)
  })
})

describe('hysaAmountForStub — reserve covers the full NY liability', () => {
  const liveStub = {
    federal_withholding: 0, fica_social_security: 12.28, fica_medicare: 2.87,
    state_withholding: 0, sdi: 0, pfl: 0,
    employer_fica_ss: 12.28, employer_fica_medicare: 2.87,
    futa: 1.19, suta: 7.97, rsf: 0.15,
  }

  it('includes RSF in the employer total', () => {
    const b = hysaAmountForStub(liveStub)
    // 12.28 + 2.87 + 1.19 + 7.97 + 0.15
    expect(b.employer_taxes_total).toBe(24.46)
    expect(b.employee_withholdings_total).toBe(15.15)
    expect(b.total).toBe(39.61)
  })

  it('treats a pre-migration stub with no rsf as zero rather than NaN', () => {
    const legacy: Omit<typeof liveStub, 'rsf'> & { rsf?: number } = { ...liveStub }
    delete legacy.rsf
    const b = hysaAmountForStub(legacy)
    expect(b.total).toBe(39.46)
    expect(Number.isNaN(b.total)).toBe(false)
  })
})

describe('roundToCents — mileage reimbursement half-cent cases', () => {
  // The naive Math.round(x*100)/100 rounds these a cent low because scaling by
  // 100 lands one ULP under the .5 boundary.
  it.each([
    [3, 2.18],
    [13, 9.43],
    [47, 34.08],
    [53, 38.43],
  ])('%i miles at 72.5c rounds half-up to %d', (miles, expected) => {
    expect(roundToCents(miles * 0.725)).toBe(expected)
  })

  it('agrees with the naive form where there is no tie', () => {
    for (const miles of [1, 5, 7, 10, 100]) {
      expect(roundToCents(miles * 0.725)).toBe(Math.round(miles * 0.725 * 100) / 100)
    }
  })
})
