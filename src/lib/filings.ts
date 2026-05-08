import type { Paystub } from './types'
import type { TaxRates } from './tax'

export type Quarter = 1 | 2 | 3 | 4

// NY State + federal use the same calendar quarters. NYS-45 due dates:
// Q1 → Apr 30, Q2 → Jul 31, Q3 → Oct 31, Q4 → Jan 31 of the next year.
export function getQuarterDateRange(year: number, quarter: Quarter): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = quarter * 3
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function getQuarterDueDate(year: number, quarter: Quarter): string {
  if (quarter === 1) return `${year}-04-30`
  if (quarter === 2) return `${year}-07-31`
  if (quarter === 3) return `${year}-10-31`
  return `${year + 1}-01-31`
}

// Schedule H is filed with the federal Form 1040 for the prior year, due Apr 15.
export function getScheduleHDueDate(taxYear: number): string {
  return `${taxYear + 1}-04-15`
}

// Form 1040-ES quarterly estimated payment due dates (IRS calendar):
//   Q1 → Apr 15 of tax year
//   Q2 → Jun 15 of tax year
//   Q3 → Sep 15 of tax year
//   Q4 → Jan 15 of the following year
// Note these are different from NYS-45's Apr 30 / Jul 31 / Oct 31 / Jan 31.
export function getFederalEstimatedTaxDueDate(year: number, quarter: Quarter): string {
  if (quarter === 1) return `${year}-04-15`
  if (quarter === 2) return `${year}-06-15`
  if (quarter === 3) return `${year}-09-15`
  return `${year + 1}-01-15`
}

// IRS Form 1040-ES "fiscal periods" are NOT calendar quarters. They run
// 3 / 2 / 3 / 4 months (totaling 12) so the IRS can collect estimated
// taxes earlier in the year than actual quarter-ends would imply. From
// IRS Pub 505:
//   Q1 covers Jan 1 – Mar 31  (3 months) → due Apr 15
//   Q2 covers Apr 1 – May 31  (2 months) → due Jun 15
//   Q3 covers Jun 1 – Aug 31  (3 months) → due Sep 15
//   Q4 covers Sep 1 – Dec 31  (4 months) → due Jan 15 of next year
// Distinct from getQuarterDateRange() (calendar quarters), which is the
// correct period for NYS-45.
export function getFederalEstimatedTaxPeriod(year: number, quarter: Quarter): { start: string; end: string } {
  if (quarter === 1) return { start: `${year}-01-01`, end: `${year}-03-31` }
  if (quarter === 2) return { start: `${year}-04-01`, end: `${year}-05-31` }
  if (quarter === 3) return { start: `${year}-06-01`, end: `${year}-08-31` }
  return { start: `${year}-09-01`, end: `${year}-12-31` }
}

export function getCurrentQuarter(date: Date = new Date()): { year: number; quarter: Quarter } {
  const year = date.getFullYear()
  const quarter = Math.ceil((date.getMonth() + 1) / 3) as Quarter
  return { year, quarter }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export interface NYS45Data {
  year: number
  quarter: Quarter
  date_range: { start: string; end: string }
  due_date: string
  stub_count: number
  // Part A (UI)
  ui_gross_wages: number       // Box 2 — total quarterly remuneration
  ui_excess_wages: number      // Box 3 — amount over the UI wage base
  ui_taxable_wages: number     // Box 4 — subject to UI tax
  ui_tax_due: number           // Box 5 — UI tax due
  // Part B (Withholding)
  ny_state_tax_withheld: number // Box 12
  total_tax_withheld: number    // Box 15 — same as Box 12 in Nassau (no NYC/Yonkers)
  // Useful but not on NYS-45 itself — for federal Form 941 / quarterly estimates
  fed_income_tax_withheld: number
}

// Compute UI taxable wages stub-by-stub so we correctly cap at the wage base
// across the year. ytdGrossBeforeQuarter is the sum of gross paid in earlier
// quarters of the same year.
export function calculateNYS45(
  stubsInQuarter: Paystub[],
  ytdGrossBeforeQuarter: number,
  rates: TaxRates,
  sutaRate: number,
  year: number,
  quarter: Quarter,
): NYS45Data {
  const sorted = [...stubsInQuarter].sort((a, b) => a.pay_date.localeCompare(b.pay_date))

  let runningYtd = ytdGrossBeforeQuarter
  let uiTaxable = 0

  for (const stub of sorted) {
    const gross = Number(stub.gross_pay)
    const room = Math.max(0, Number(rates.suta_wage_base) - runningYtd)
    uiTaxable += Math.min(gross, room)
    runningYtd += gross
  }

  const uiGross = sorted.reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const uiExcess = uiGross - uiTaxable
  const uiTaxDue = round(uiTaxable * sutaRate)

  const nyWithheld = sorted.reduce((sum, s) => sum + Number(s.state_withholding), 0)
  const fedWithheld = sorted.reduce((sum, s) => sum + Number(s.federal_withholding), 0)

  return {
    year,
    quarter,
    date_range: getQuarterDateRange(year, quarter),
    due_date: getQuarterDueDate(year, quarter),
    stub_count: sorted.length,
    ui_gross_wages: round(uiGross),
    ui_excess_wages: round(uiExcess),
    ui_taxable_wages: round(uiTaxable),
    ui_tax_due: uiTaxDue,
    ny_state_tax_withheld: round(nyWithheld),
    total_tax_withheld: round(nyWithheld),
    fed_income_tax_withheld: round(fedWithheld),
  }
}

export interface ScheduleHData {
  year: number
  due_date: string
  stub_count: number
  total_cash_wages: number
  // Line 1a/1b — Social Security (combined employee + employer)
  ss_wages: number
  ss_tax: number
  // Line 2a/2b — Medicare (combined)
  medicare_wages: number
  medicare_tax: number
  // Line 5 — federal income tax withheld
  fed_income_tax_withheld: number
  // Line 6 — total social security, Medicare, and income taxes
  line_6_total: number
  // Line 7 — cash wages subject to FUTA (Section A, single state)
  futa_wages: number
  // Line 8 — FUTA tax
  futa_tax: number
  // Line 9 — total household employment taxes
  total_household_employment_taxes: number
  // Threshold flags — informational only, computed against IRS Pub 926
  fica_threshold_met: boolean
  futa_threshold_met: boolean
}

export interface FederalEstimatedTaxData {
  year: number
  quarter: Quarter
  date_range: { start: string; end: string }
  due_date: string
  stub_count: number
  // Per-stub stored values summed across the quarter — these are the quarterly
  // slices of the annual Schedule H lines.
  ss_combined: number          // employee + employer FICA SS for quarter (Schedule H Line 1b slice)
  medicare_combined: number    // employee + employer FICA Medicare for quarter (Line 2b slice)
  fed_income_tax_withheld: number  // Line 5 slice
  futa: number                 // Line 8 slice
  total_due: number            // sum — what to send via Form 1040-ES this quarter
}

// Computes the per-period Schedule H slice paid via Form 1040-ES. Uses IRS
// fiscal periods (3/2/3/4 months — see getFederalEstimatedTaxPeriod), NOT
// calendar quarters. Caller is expected to pass `stubsInPeriod` already
// filtered by getFederalEstimatedTaxPeriod's start/end. Per-stub stored
// values (FUTA correctly wage-base-capped at generation time) are summed.
// Pays IRS via EFTPS / IRS Direct Pay / paper voucher.
export function calculateFederalEstimatedTax(
  stubsInPeriod: Paystub[],
  year: number,
  quarter: Quarter,
): FederalEstimatedTaxData {
  const sum = (key: keyof Paystub) =>
    stubsInPeriod.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)

  const ss_combined  = round(sum('fica_social_security') + sum('employer_fica_ss'))
  const medicare_combined = round(sum('fica_medicare') + sum('employer_fica_medicare'))
  const fed_income_tax_withheld = round(sum('federal_withholding'))
  const futa = round(sum('futa'))
  const total_due = round(ss_combined + medicare_combined + fed_income_tax_withheld + futa)

  return {
    year,
    quarter,
    date_range: getFederalEstimatedTaxPeriod(year, quarter),
    due_date: getFederalEstimatedTaxDueDate(year, quarter),
    stub_count: stubsInPeriod.length,
    ss_combined,
    medicare_combined,
    fed_income_tax_withheld,
    futa,
    total_due,
  }
}

export function calculateScheduleH(
  yearStubs: Paystub[],
  rates: TaxRates,
  taxYear: number,
): ScheduleHData {
  const totalGross = yearStubs.reduce((sum, s) => sum + Number(s.gross_pay), 0)

  // Thresholds from tax_rates table (IRS Pub 926, Table 1). Verify annually.
  const ficaThreshold = Number(rates.fica_household_threshold)
  const futaQuarterlyThreshold = Number(rates.futa_quarterly_threshold)

  // FICA trigger: cash wages must meet the annual household-employee threshold.
  const ficaThresholdMet = totalGross >= ficaThreshold

  // FUTA trigger: $1,000+ in cash wages in any single calendar quarter.
  const quarterTotals: Record<Quarter, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const stub of yearStubs) {
    const month = parseInt(stub.pay_date.slice(5, 7), 10)
    const q = Math.ceil(month / 3) as Quarter
    quarterTotals[q] += Number(stub.gross_pay)
  }
  const futaThresholdMet = Object.values(quarterTotals).some(t => t >= futaQuarterlyThreshold)

  // SS — capped at the SS wage base; combined rate (employee 6.2% + employer 6.2%)
  const ssWages = ficaThresholdMet ? Math.min(totalGross, Number(rates.ss_wage_base)) : 0
  const ssTax = round(ssWages * Number(rates.fica_ss_rate) * 2)

  // Medicare — uncapped; combined rate (1.45% + 1.45%)
  const medicareWages = ficaThresholdMet ? totalGross : 0
  const medicareTax = round(medicareWages * Number(rates.fica_medicare_rate) * 2)

  const fedWithheld = round(yearStubs.reduce((sum, s) => sum + Number(s.federal_withholding), 0))

  const line6 = round(ssTax + medicareTax + fedWithheld)

  // FUTA — capped at the FUTA wage base
  const futaWages = futaThresholdMet ? Math.min(totalGross, Number(rates.futa_wage_base)) : 0
  const futaTax = round(futaWages * Number(rates.futa_rate))

  const total = round(line6 + futaTax)

  return {
    year: taxYear,
    due_date: getScheduleHDueDate(taxYear),
    stub_count: yearStubs.length,
    total_cash_wages: round(totalGross),
    ss_wages: round(ssWages),
    ss_tax: ssTax,
    medicare_wages: round(medicareWages),
    medicare_tax: medicareTax,
    fed_income_tax_withheld: fedWithheld,
    line_6_total: line6,
    futa_wages: round(futaWages),
    futa_tax: futaTax,
    total_household_employment_taxes: total,
    fica_threshold_met: ficaThresholdMet,
    futa_threshold_met: futaThresholdMet,
  }
}
