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
}

export interface TaxInputs {
  gross: number
  ytdGrossBefore: number
  ytdPflBefore: number
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

export function calculateTaxes(inputs: TaxInputs, rates: TaxRates): TaxResult {
  const { gross, ytdGrossBefore, ytdPflBefore, federalWithholding, stateWithholding, pflWaived, sutaRate } = inputs

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

  const ssTaxable = taxableWagePortion(ytdGrossBefore, gross, Number(rates.ss_wage_base))
  const fica_ss = round(ssTaxable * Number(rates.fica_ss_rate))
  const fica_med = round(gross * Number(rates.fica_medicare_rate))

  const sdi = Math.min(round(gross * Number(rates.sdi_rate)), Number(rates.sdi_weekly_cap))

  let pfl = 0
  if (!pflWaived) {
    const remainingCap = Math.max(0, Number(rates.pfl_annual_cap) - ytdPflBefore)
    pfl = Math.min(round(gross * Number(rates.pfl_rate)), remainingCap)
    pfl = round(pfl)
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
    employer_fica_ss: fica_ss,
    employer_fica_medicare: fica_med,
    futa,
    suta,
    net_pay,
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
