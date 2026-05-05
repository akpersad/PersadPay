// Tax constants — verified 2026-05-05 against primary sources.
// Re-verify every January. Source URLs noted per constant.
//
// IRS Topic 751 — Social Security and Medicare Withholding Rates
//   https://www.irs.gov/taxtopics/tc751
// IRS Pub 926 — Household Employer's Tax Guide
//   https://www.irs.gov/publications/p926
// NY DOL UI rate information
//   https://dol.ny.gov/unemployment-insurance-rate-information
// NY DFS 2026 PFL rate decision
//   https://www.dfs.ny.gov/apps-and-licensing/health-insurers/pfl-rate-decision-2026-page
// IRS Notice 2026-10 — 2026 standard mileage rates
//   https://www.irs.gov/pub/irs-drop/n-26-10.pdf

export const FICA_SS_RATE = 0.062            // 6.2% — employee + employer each (2026, IRS Topic 751)
export const FICA_MEDICARE_RATE = 0.0145     // 1.45% — employee + employer each (2026, IRS Topic 751)
export const SS_WAGE_BASE = 184500           // 2026 Social Security wage base (IRS Topic 751)
export const FUTA_RATE = 0.006               // 0.6% after full NY state credit; no 2026 NY credit reduction (IRS Pub 926)
export const FUTA_WAGE_BASE = 7000           // unchanged since 1983 (IRS Pub 926)
export const SUTA_WAGE_BASE = 13000          // NY 2026 — corrected from $17,600. Indexed to 18% of state AWW. (NY DOL)
export const SDI_RATE = 0.005                // 0.5% (2026, NY DFS / WCB)
export const SDI_WEEKLY_CAP = 0.60           // hard weekly cap, annual max $31.20 (2026, NY DFS / WCB)
export const PFL_RATE = 0.00432              // 0.432% (2026, NY DFS rate decision)
export const PFL_ANNUAL_CAP = 411.91         // 2026 max employee PFL contribution (NY DFS rate decision)
export const IRS_MILEAGE_RATE = 0.725        // 72.5¢/mi business use (2026, IRS Notice 2026-10)

export interface TaxInputs {
  gross: number
  ytdGrossBefore: number   // sum of gross for prior stubs in same calendar year
  ytdPflBefore: number     // sum of PFL withheld YTD before this stub — needed for annual cap
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

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculateTaxes(inputs: TaxInputs): TaxResult {
  const { gross, ytdGrossBefore, ytdPflBefore, federalWithholding, stateWithholding, pflWaived, sutaRate } = inputs

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

  // FICA SS is capped at the SS wage base ($184,500 in 2026). Won't bind at babysitter wages
  // but kept for parity with FUTA/SUTA cap logic.
  const ssTaxable = taxableWagePortion(ytdGrossBefore, gross, SS_WAGE_BASE)
  const fica_ss = round(ssTaxable * FICA_SS_RATE)

  // Medicare has no wage base.
  const fica_med = round(gross * FICA_MEDICARE_RATE)

  const sdi = Math.min(round(gross * SDI_RATE), SDI_WEEKLY_CAP)

  // PFL: capped at $411.91/year (2026). Stop withholding once YTD reaches the cap.
  let pfl = 0
  if (!pflWaived) {
    const remainingCap = Math.max(0, PFL_ANNUAL_CAP - ytdPflBefore)
    pfl = Math.min(round(gross * PFL_RATE), remainingCap)
    pfl = round(pfl)
  }

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
    employer_fica_ss: fica_ss,           // employer matches the (capped) employee FICA SS
    employer_fica_medicare: fica_med,
    futa,
    suta,
    net_pay,
  }
}
