import type { SupabaseClient } from '@supabase/supabase-js'
import { getTaxRatesForYear } from './tax'
import type { Paystub, PaystubLineItem } from './types'

// Shared W-2 box derivation, used by BOTH /api/w2/calculate (preview) and
// /api/w2/save (persist). The save route deliberately re-derives rather than
// trusting the values the client posts back: the W-2 is a filed IRS document
// and a tampered or stale client payload would be written verbatim otherwise.

export interface W2Boxes {
  employee_id: string
  tax_year: number
  wages_tips: number          // Box 1
  federal_tax_withheld: number // Box 2
  ss_wages: number            // Box 3 (capped at the SS wage base)
  ss_tax_withheld: number     // Box 4
  medicare_wages: number      // Box 5 (uncapped)
  medicare_tax_withheld: number // Box 6
  state_wages: number         // Box 16
  state_tax_withheld: number  // Box 17
}

export type W2ComputeError =
  | { kind: 'no_employee' }
  | { kind: 'no_stubs' }
  | { kind: 'no_rates'; year: number }

export type W2ComputeResult =
  | { ok: true; boxes: W2Boxes }
  | { ok: false; error: W2ComputeError }

/**
 * Resolves the real employee profile. The DB may hold a permanent test-employee
 * profile alongside the real one (migration 0026); ordering by is_test puts the
 * real employee first, and .single() would error on two rows.
 */
export async function resolveEmployeeId(adminClient: SupabaseClient): Promise<string | null> {
  const { data } = await adminClient
    .from('profiles')
    .select('id')
    .eq('role', 'employee')
    .order('is_test', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>()

  return data?.id ?? null
}

export async function computeW2Boxes(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  year: number,
): Promise<W2ComputeResult> {
  const employeeId = await resolveEmployeeId(adminClient)
  if (!employeeId) return { ok: false, error: { kind: 'no_employee' } }

  const [{ data: stubs }, rates] = await Promise.all([
    supabase
      .from('paystubs')
      .select('*')
      .eq('employee_id', employeeId)
      // Tax year is determined by pay_date (IRS constructive receipt).
      .gte('pay_date', `${year}-01-01`)
      .lte('pay_date', `${year}-12-31`),
    getTaxRatesForYear(supabase, year),
  ])

  if (!stubs?.length) return { ok: false, error: { kind: 'no_stubs' } }
  if (!rates) return { ok: false, error: { kind: 'no_rates', year } }

  const typedStubs = stubs as Paystub[]
  const stubIds = typedStubs.map(s => s.id)

  // Line items are fetched so boxes can be aggregated per taxability flag —
  // a non-taxable accountable-plan item (mileage at the IRS rate, receipted
  // reimbursements) must stay out of Boxes 1/3/5/16.
  type LineItemSlice = Pick<PaystubLineItem, 'paystub_id' | 'amount' | 'w2_box1' | 'taxable_fica' | 'taxable_ny'>
  const { data: lineItemRows } = stubIds.length > 0
    ? await supabase
        .from('paystub_line_items')
        .select('paystub_id, amount, w2_box1, taxable_fica, taxable_ny')
        .in('paystub_id', stubIds)
    : { data: [] as LineItemSlice[] }

  const lineItems = (lineItemRows ?? []) as LineItemSlice[]

  // gross_pay already includes taxable line items. To get per-flag wages,
  // strip all taxable line items back out to reach base wages, then re-add
  // only the items carrying the flag being computed.
  const totalTaxableLineItems = lineItems.reduce((acc, li) => {
    const contributes = li.w2_box1 || li.taxable_fica || li.taxable_ny
    return acc + (contributes ? Number(li.amount) : 0)
  }, 0)

  const totalGross = typedStubs.reduce((acc, s) => acc + Number(s.gross_pay), 0)
  const totalBaseWages = totalGross - totalTaxableLineItems

  const sumLineItems = (flag: 'w2_box1' | 'taxable_fica' | 'taxable_ny') =>
    lineItems.reduce((acc, li) => acc + (li[flag] ? Number(li.amount) : 0), 0)

  const sumStubs = (key: keyof Paystub) =>
    typedStubs.reduce((acc, s) => acc + Number(s[key] ?? 0), 0)

  const wages_tips = totalBaseWages + sumLineItems('w2_box1')
  const ficaWages = totalBaseWages + sumLineItems('taxable_fica')
  const nyWages = totalBaseWages + sumLineItems('taxable_ny')
  // Cap once on the year-cumulative total, not per stub.
  const ssWages = Math.min(ficaWages, Number(rates.ss_wage_base))

  return {
    ok: true,
    boxes: {
      employee_id: employeeId,
      tax_year: year,
      wages_tips,
      federal_tax_withheld: sumStubs('federal_withholding'),
      ss_wages: ssWages,
      ss_tax_withheld: sumStubs('fica_social_security'),
      medicare_wages: ficaWages,
      medicare_tax_withheld: sumStubs('fica_medicare'),
      state_wages: nyWages,
      state_tax_withheld: sumStubs('state_withholding'),
    },
  }
}

/** Maps a compute error to an HTTP response shape, so both routes agree. */
export function w2ErrorResponse(error: W2ComputeError): { error: string; status: number } {
  switch (error.kind) {
    case 'no_employee':
      return { error: 'No employee profile found', status: 500 }
    case 'no_stubs':
      return { error: 'No stubs found for this year', status: 404 }
    case 'no_rates':
      return { error: `No tax rates seeded for ${error.year}`, status: 500 }
  }
}
