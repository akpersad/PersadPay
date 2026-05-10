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

// Number of months in each IRS 1040-ES fiscal period (for annualization).
export function getFederalEstimatedTaxPeriodMonths(quarter: Quarter): number {
  if (quarter === 2) return 2
  if (quarter === 4) return 4
  return 3
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
  ui_gross_wages: number       // Line 2 — total quarterly remuneration
  ui_excess_wages: number      // Line 3 — amount over the UI wage base
  ui_taxable_wages: number     // Line 4 — subject to UI tax
  ui_tax_due: number           // Line 5 — UI contribution (taxable × UI rate)
  rsf: number                  // Line 6 — Re-employment Service Fund (taxable × rsf_rate)
  // Part A employee-count boxes (NYS-45 Part A, boxes 10a/10b/10c)
  // Count of covered employees employed on the 12th of each month in the quarter.
  employee_counts_by_month: [number, number, number]
  // Part B (Withholding)
  ny_state_tax_withheld: number // Box 12
  total_tax_withheld: number    // Box 15 — same as Box 12 in Nassau (no NYC/Yonkers)
  // Useful but not on NYS-45 itself — for federal Form 941 / quarterly estimates
  fed_income_tax_withheld: number
}

// Compute UI taxable wages stub-by-stub so we correctly cap at the wage base
// across the year. ytdGrossBeforeQuarter is the sum of gross paid in earlier
// quarters of the same year.
// allYearStubs is used solely for the employee-count-by-12th check.
export function calculateNYS45(
  stubsInQuarter: Paystub[],
  ytdGrossBeforeQuarter: number,
  rates: TaxRates,
  sutaRate: number,
  year: number,
  quarter: Quarter,
  allYearStubs: Paystub[] = [],
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
  const rsf = round(uiTaxable * Number(rates.rsf_rate ?? 0.00075))

  const nyWithheld = sorted.reduce((sum, s) => sum + Number(s.state_withholding), 0)
  const fedWithheld = sorted.reduce((sum, s) => sum + Number(s.federal_withholding), 0)

  // Employee count by 12th of each month: 1 if any stub's pay period covers
  // the 12th of that month (proxy for "employed on the 12th"), else 0.
  const startMonth = (quarter - 1) * 3 + 1
  const allStubs = allYearStubs.length > 0 ? allYearStubs : sorted
  const employee_counts_by_month: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const month = startMonth + i
    const twelfth = `${year}-${String(month).padStart(2, '0')}-12`
    const covered = allStubs.some(
      s => s.pay_period_start <= twelfth && s.pay_period_end >= twelfth,
    )
    employee_counts_by_month[i] = covered ? 1 : 0
  }

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
    rsf,
    employee_counts_by_month,
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
  // Line 1/2 — Social Security (combined employee + employer)
  ss_wages: number
  ss_tax: number
  // Line 3/4 — Medicare (combined)
  medicare_wages: number
  medicare_tax: number
  // Line 5/6 — Additional Medicare Tax (wages > $200K threshold; $0 for household employees)
  additional_medicare_tax_wages: number
  additional_medicare_tax: number
  // Line 7 — federal income tax withheld
  fed_income_tax_withheld: number
  // Line 8 — total social security, Medicare, and income taxes (lines 2+4+6+7)
  line_8_total: number
  // Lines 13/14 — state unemployment (shown for completeness; not in federal total)
  suta_wages: number
  suta_paid: number
  // Line 15/16 — Federal Unemployment Tax (FUTA)
  futa_wages: number
  futa_tax: number
  // Line 26 — total household employment taxes (line 8 + line 16)
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
  ss_combined: number          // employee + employer FICA SS for quarter (Schedule H Line 2 slice)
  medicare_combined: number    // employee + employer FICA Medicare for quarter (Line 4 slice)
  fed_income_tax_withheld: number  // Line 7 slice
  futa: number                 // Line 16 slice
  total_due: number            // sum — what to send via Form 1040-ES this quarter
  // Annualized projection: total_due / period_months × 12
  annualized_projection: number
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

  const periodMonths = getFederalEstimatedTaxPeriodMonths(quarter)
  const annualized_projection = total_due > 0 ? round(total_due / periodMonths * 12) : 0

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
    annualized_projection,
  }
}

// priorYearFutaThresholdMet: true if any calendar quarter of the PRIOR year had
// $1,000+ in cash wages (per IRS Pub 926 — the FUTA $1K threshold checks
// both the current and prior year). Pass false (default) if no prior-year data.
export function calculateScheduleH(
  yearStubs: Paystub[],
  rates: TaxRates,
  taxYear: number,
  priorYearFutaThresholdMet: boolean = false,
): ScheduleHData {
  const totalGross = yearStubs.reduce((sum, s) => sum + Number(s.gross_pay), 0)

  // Thresholds from tax_rates table (IRS Pub 926, Table 1). Verify annually.
  const ficaThreshold = Number(rates.fica_household_threshold)
  const futaQuarterlyThreshold = Number(rates.futa_quarterly_threshold)

  // FICA trigger: cash wages must meet the annual household-employee threshold.
  const ficaThresholdMet = totalGross >= ficaThreshold

  // FUTA trigger: $1,000+ in cash wages in any single calendar quarter of the
  // current OR prior year (IRS Pub 926). priorYearFutaThresholdMet covers the
  // prior-year check; the loop below covers the current year.
  const quarterTotals: Record<Quarter, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const stub of yearStubs) {
    const month = parseInt(stub.pay_date.slice(5, 7), 10)
    const q = Math.ceil(month / 3) as Quarter
    quarterTotals[q] += Number(stub.gross_pay)
  }
  const currentYearFutaThresholdMet = Object.values(quarterTotals).some(t => t >= futaQuarterlyThreshold)
  const futaThresholdMet = priorYearFutaThresholdMet || currentYearFutaThresholdMet

  // SS — capped at the SS wage base; combined rate (employee 6.2% + employer 6.2%)
  const ssWages = ficaThresholdMet ? Math.min(totalGross, Number(rates.ss_wage_base)) : 0
  const ssTax = round(ssWages * Number(rates.fica_ss_rate) * 2)

  // Medicare — uncapped; combined rate (1.45% + 1.45%)
  const medicareWages = ficaThresholdMet ? totalGross : 0
  const medicareTax = round(medicareWages * Number(rates.fica_medicare_rate) * 2)

  // Additional Medicare Tax — 0.9% on wages above $200K threshold. Not
  // applicable for a household employee at these wage levels, but the IRS
  // Schedule H form requires lines 5 and 6 to be present (at $0).
  const additional_medicare_tax_wages = 0
  const additional_medicare_tax = 0

  const fedWithheld = round(yearStubs.reduce((sum, s) => sum + Number(s.federal_withholding), 0))

  const line8 = round(ssTax + medicareTax + additional_medicare_tax + fedWithheld)

  // State unemployment (SUTA) — informational on Schedule H; paid via NYS-45.
  const suta_wages = Math.min(totalGross, Number(rates.suta_wage_base))
  const suta_paid = round(yearStubs.reduce((sum, s) => sum + Number(s.suta), 0))

  // FUTA — capped at the FUTA wage base
  const futaWages = futaThresholdMet ? Math.min(totalGross, Number(rates.futa_wage_base)) : 0
  const futaTax = round(futaWages * Number(rates.futa_rate))

  const total = round(line8 + futaTax)

  return {
    year: taxYear,
    due_date: getScheduleHDueDate(taxYear),
    stub_count: yearStubs.length,
    total_cash_wages: round(totalGross),
    ss_wages: round(ssWages),
    ss_tax: ssTax,
    medicare_wages: round(medicareWages),
    medicare_tax: medicareTax,
    additional_medicare_tax_wages,
    additional_medicare_tax,
    fed_income_tax_withheld: fedWithheld,
    line_8_total: line8,
    suta_wages: round(suta_wages),
    suta_paid,
    futa_wages: round(futaWages),
    futa_tax: futaTax,
    total_household_employment_taxes: total,
    fica_threshold_met: ficaThresholdMet,
    futa_threshold_met: futaThresholdMet,
  }
}
