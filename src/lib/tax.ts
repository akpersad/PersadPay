// Tax constants — verify all values at the start of each calendar year
export const FICA_SS_RATE = 0.062         // 6.2% — employee + employer each (2026)
export const FICA_MEDICARE_RATE = 0.0145  // 1.45% — employee + employer each (2026)
export const FUTA_RATE = 0.006            // 0.6% after NY state credit (2026)
export const FUTA_WAGE_BASE = 7000        // Resets January 1 each year (2026)
export const SUTA_WAGE_BASE = 17600       // NY 2026 — resets January 1
export const SDI_RATE = 0.005             // 0.5% (2026)
export const SDI_WEEKLY_CAP = 0.60        // Hard weekly cap (2026)
export const PFL_RATE = 0.00432           // 0.432% (2026)

export interface TaxInputs {
  gross: number
  ytdGrossBefore: number  // sum of gross for prior stubs in same calendar year
  federalWithholding: number
  stateWithholding: number
  pflWaived: boolean
  sutaRate: number
}

export interface TaxResult {
  gross_pay: number
  federal_withholding: number
  fica_social_security: number
  fica_medicare: number
  state_withholding: number
  sdi: number
  pfl: number
  employer_fica_ss: number
  employer_fica_medicare: number
  futa: number
  suta: number
  net_pay: number
}

function taxableWagePortion(ytdBefore: number, current: number, cap: number): number {
  if (ytdBefore >= cap) return 0
  return Math.min(current, cap - ytdBefore)
}

export function calculateTaxes(inputs: TaxInputs): TaxResult {
  const { gross, ytdGrossBefore, federalWithholding, stateWithholding, pflWaived, sutaRate } = inputs

  // Zero-hour stub: all taxes are $0
  if (gross === 0) {
    return {
      gross_pay: 0,
      federal_withholding: 0,
      fica_social_security: 0,
      fica_medicare: 0,
      state_withholding: 0,
      sdi: 0,
      pfl: 0,
      employer_fica_ss: 0,
      employer_fica_medicare: 0,
      futa: 0,
      suta: 0,
      net_pay: 0,
    }
  }

  const fica_ss = round(gross * FICA_SS_RATE)
  const fica_med = round(gross * FICA_MEDICARE_RATE)
  const sdi = Math.min(round(gross * SDI_RATE), SDI_WEEKLY_CAP)
  const pfl = pflWaived ? 0 : round(gross * PFL_RATE)

  const futaTaxable = taxableWagePortion(ytdGrossBefore, gross, FUTA_WAGE_BASE)
  const sutaTaxable = taxableWagePortion(ytdGrossBefore, gross, SUTA_WAGE_BASE)

  const futa = round(futaTaxable * FUTA_RATE)
  const suta = round(sutaTaxable * sutaRate)

  const totalDeductions = federalWithholding + fica_ss + fica_med + stateWithholding + sdi + pfl
  const net_pay = round(gross - totalDeductions)

  return {
    gross_pay: gross,
    federal_withholding: federalWithholding,
    fica_social_security: fica_ss,
    fica_medicare: fica_med,
    state_withholding: stateWithholding,
    sdi,
    pfl,
    employer_fica_ss: round(gross * FICA_SS_RATE),
    employer_fica_medicare: round(gross * FICA_MEDICARE_RATE),
    futa,
    suta,
    net_pay,
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
