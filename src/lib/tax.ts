import type { SupabaseClient } from '@supabase/supabase-js'

// Statutory tax rates are stored in the public.tax_rates table keyed on
// effective_year. calculateTaxes is pure and takes a TaxRates row as input.
// Server-side callers load the row via getTaxRatesForYear(); client-side
// callers receive it as a prop (loaded by the parent server component).
//
// New rates are added each December via the "Verify YYYY tax rates" reminder.
// All values must be verified against primary sources (IRS, NY DOL, NY DFS).
// See /docs/ROADMAP.md for the audit history and source URLs.

export interface TaxRates {
  effective_year: number
  fica_ss_rate: number
  fica_medicare_rate: number
  ss_wage_base: number
  futa_rate: number
  futa_wage_base: number
  suta_wage_base: number
  sdi_rate: number
  sdi_weekly_cap: number
  pfl_rate: number
  pfl_annual_cap: number
  irs_mileage_rate: number
  // Household employer FICA/FUTA cash-wage thresholds (IRS Pub 926, Table 1)
  fica_household_threshold: number
  futa_quarterly_threshold: number
}

export interface TaxInputs {
  gross: number
  ytdGrossBefore: number
  ytdPflBefore: number
  federalWithholding: number
  stateWithholding: number
  // dblCovered: NY DBL covers domestic workers at 20+ hrs/wk. Default false.
  dblCovered: boolean
  // pflCovered: NY PFL covers domestic workers at 20+ hrs/wk OR 175+ days/52 wks. Default false.
  pflCovered: boolean
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

// IEEE-754 safe rounding: adding EPSILON prevents 1.005 → 1.00 (banker's rounding artifact)
function round(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100
}

export function calculateTaxes(inputs: TaxInputs, rates: TaxRates): TaxResult {
  const { gross, ytdGrossBefore, ytdPflBefore, federalWithholding, stateWithholding, dblCovered, pflCovered, sutaRate } = inputs

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

  // FICA on full gross from the first dollar. IRS Pub 926 / Topic 756: once
  // cumulative annual cash wages cross the household threshold ($3,000 in 2026),
  // FICA is owed on ALL wages paid that year — including wages paid before the
  // threshold was met. For a single-household app where annual wages will
  // demonstrably exceed the threshold (9 hrs/wk × $22+ × ~33 weeks ≫ $3,000),
  // withholding from $1 is the correct approach: the alternative is doubling-up
  // withholding mid-year or paying the employee's share from the employer's own
  // pocket (which itself becomes taxable wages). Schedule H year-end calc
  // (lib/filings.ts) keeps the threshold check — if for some reason the
  // employee leaves before crossing $3,000, no FICA is reported on the form
  // and the employer can refund the employee's withheld amounts directly.
  const ssTaxable = taxableWagePortion(ytdGrossBefore, gross, Number(rates.ss_wage_base))
  const fica_ss = round(ssTaxable * Number(rates.fica_ss_rate))
  const fica_med = round(gross * Number(rates.fica_medicare_rate))

  // Employer FICA uses the same taxable base. Computed independently rather than
  // aliased to employee values — any future rate asymmetry will be explicit.
  const employer_fica_ss = round(ssTaxable * Number(rates.fica_ss_rate))
  const employer_fica_medicare = round(gross * Number(rates.fica_medicare_rate))

  // NY SDI: only applies when employee is covered (20+ hrs/wk). Default off.
  const sdi = dblCovered ? Math.min(round(gross * Number(rates.sdi_rate)), Number(rates.sdi_weekly_cap)) : 0

  // NY PFL: only applies when employee is covered (20+ hrs/wk or 175+ days/52 wks). Default off.
  let pfl = 0
  if (pflCovered) {
    // Round remainingCap to avoid IEEE-754 artifact: 411.91 - 411.81 = 0.0999... not 0.10
    const remainingCap = round(Math.max(0, Number(rates.pfl_annual_cap) - ytdPflBefore))
    pfl = Math.min(round(gross * Number(rates.pfl_rate)), remainingCap)
  }

  const futaTaxable = taxableWagePortion(ytdGrossBefore, gross, Number(rates.futa_wage_base))
  const sutaTaxable = taxableWagePortion(ytdGrossBefore, gross, Number(rates.suta_wage_base))

  const futa = round(futaTaxable * Number(rates.futa_rate))
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
    employer_fica_ss,
    employer_fica_medicare,
    futa,
    suta,
    net_pay,
  }
}

// HYSA transfer breakdown — every dollar the admin needs to set aside for
// taxes per stub. Sum of:
//   employee-side withholdings (federal, FICA SS, FICA Medicare, NY state,
//                               NY SDI, NY PFL)
//   employer-side taxes        (employer FICA SS, employer FICA Medicare,
//                               FUTA, NY SUTA)
// All values come straight off the paystub row (computed at generation time
// and stored). Returning the breakdown alongside the total so the UI can
// show the split.
export interface HysaBreakdown {
  employee_withholdings_total: number
  employer_taxes_total: number
  total: number
}

export function hysaAmountForStub(stub: {
  federal_withholding: number | string
  fica_social_security: number | string
  fica_medicare: number | string
  state_withholding: number | string
  sdi: number | string
  pfl: number | string
  employer_fica_ss: number | string
  employer_fica_medicare: number | string
  futa: number | string
  suta: number | string
}): HysaBreakdown {
  const employee =
    Number(stub.federal_withholding) +
    Number(stub.fica_social_security) +
    Number(stub.fica_medicare) +
    Number(stub.state_withholding) +
    Number(stub.sdi) +
    Number(stub.pfl)
  const employer =
    Number(stub.employer_fica_ss) +
    Number(stub.employer_fica_medicare) +
    Number(stub.futa) +
    Number(stub.suta)
  return {
    employee_withholdings_total: Math.round(employee * 100) / 100,
    employer_taxes_total: Math.round(employer * 100) / 100,
    total: Math.round((employee + employer) * 100) / 100,
  }
}

// Loads the tax_rates row that applies to a given year. If no exact match
// exists (e.g., a stub dated in 2027 but only 2026 rates are seeded), falls
// back to the most recent populated year and logs a warning. Returns null
// only if the table is empty.
export async function getTaxRatesForYear(
  supabase: SupabaseClient,
  year: number,
): Promise<TaxRates | null> {
  const { data } = await supabase
    .from('tax_rates')
    .select('*')
    .lte('effective_year', year)
    .order('effective_year', { ascending: false })
    .limit(1)
    .maybeSingle<TaxRates>()

  if (!data) return null

  if (data.effective_year !== year) {
    console.warn(
      `[tax] No tax_rates row for ${year}; using ${data.effective_year} as fallback. ` +
      `Add the new year via the "Verify ${year} tax rates" reminder workflow.`,
    )
  }

  return data
}
