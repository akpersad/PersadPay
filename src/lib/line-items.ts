// Predefined Additional Pay line types and their default tax treatment.
// Sources: IRS Publication 926 (Household Employer's Tax Guide) and
// IRS Publication 15-B (Fringe Benefits Guide). See /docs/ROADMAP.md for
// the per-type verdict table that drove these defaults.
//
// Defaults are conservative — anything cash-like or unsubstantiated is
// taxable. The non-taxable options (mileage at IRS rate, accountable
// reimbursements, OT meal money) require deliberate selection and trigger
// a confirmation modal in the UI explaining the substantiation requirement.

export type LineType =
  | 'bonus'
  | 'holiday_pay'
  | 'sick_pto'
  | 'mileage_irs_rate'
  | 'mileage_excess'
  | 'reimbursement_accountable'
  | 'flat_allowance'
  | 'cash_gift'
  | 'gift_card'
  | 'meal_money_ot'
  | 'third_party_tip'

export interface LineTypeDef {
  value: LineType
  label: string         // dropdown label
  defaultItemLabel: string  // pre-fill for the editable per-item label
  taxable_fed: boolean
  taxable_fica: boolean
  taxable_ny: boolean
  w2_box1: boolean
  informational_only: boolean
  hint: string
  isMileage?: boolean   // triggers miles × IRS rate auto-calc UI
  requiresConfirmation?: boolean  // non-taxable items need explicit substantiation acknowledgement
  // Default value of given_separately when the admin first picks this type.
  // Gift cards and physical cash gifts are typically handed over outside
  // the Zelle payment, so they pre-flip the toggle on. Admin can override.
  defaultGivenSeparately?: boolean
}

// Short labels for the dropdown chip; longer descriptions go in the `hint`.
export const LINE_TYPES: LineTypeDef[] = [
  {
    value: 'bonus',
    label: 'Bonus',
    defaultItemLabel: 'Bonus',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'Cash bonus or thank-you (holiday, discretionary). All cash bonuses are wages, fully taxable. (Pub 926)',
  },
  {
    value: 'holiday_pay',
    label: 'Holiday pay',
    defaultItemLabel: 'Holiday pay',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'Paid time off for a holiday. Treated as regular wages.',
  },
  {
    value: 'sick_pto',
    label: 'Sick / PTO',
    defaultItemLabel: 'Sick / PTO pay',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'Paid sick or PTO time. Note: the family\'s policy is unpaid sick leave. Only set this if you elect to pay anyway.',
  },
  {
    value: 'mileage_irs_rate',
    label: 'Mileage at IRS rate',
    defaultItemLabel: 'Mileage reimbursement',
    taxable_fed: false, taxable_fica: false, taxable_ny: false, w2_box1: false,
    informational_only: false,
    hint: 'Non-taxable accountable plan. Requires a mileage log. Amount auto-calculates from miles × current IRS rate.',
    isMileage: true,
    requiresConfirmation: true,
  },
  {
    value: 'mileage_excess',
    label: 'Mileage excess',
    defaultItemLabel: 'Mileage excess (taxable portion)',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'Only the portion paid above the IRS rate. Add a separate IRS-rate line for the non-taxable part.',
  },
  {
    value: 'reimbursement_accountable',
    label: 'Expense reimbursement (receipted)',
    defaultItemLabel: 'Expense reimbursement',
    taxable_fed: false, taxable_fica: false, taxable_ny: false, w2_box1: false,
    informational_only: false,
    hint: 'Receipts must be on file (accountable plan). If not receipted, use "Flat allowance" instead.',
    requiresConfirmation: true,
  },
  {
    value: 'flat_allowance',
    label: 'Flat allowance',
    defaultItemLabel: 'Flat allowance',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'No receipts. Non-accountable plan = wages, fully taxable.',
  },
  {
    value: 'cash_gift',
    label: 'Cash gift',
    defaultItemLabel: 'Cash gift',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'Cash from employer to employee is never de minimis. Always taxable. (Pub 15-B)',
  },
  {
    value: 'gift_card',
    label: 'Gift card',
    defaultItemLabel: 'Gift card',
    taxable_fed: true, taxable_fica: true, taxable_ny: true, w2_box1: true,
    informational_only: false,
    hint: 'Gift cards are cash-equivalent: always taxable, regardless of amount. (Pub 15-B)',
    defaultGivenSeparately: true,
  },
  {
    value: 'meal_money_ot',
    label: 'OT meal money',
    defaultItemLabel: 'Overtime meal money',
    taxable_fed: false, taxable_fica: false, taxable_ny: false, w2_box1: false,
    informational_only: false,
    hint: 'Non-taxable only when caused by overtime work. Routine meal money is wages.',
    requiresConfirmation: true,
  },
  {
    value: 'third_party_tip',
    label: 'Third-party tip',
    defaultItemLabel: 'Third-party tip',
    taxable_fed: false, taxable_fica: false, taxable_ny: false, w2_box1: false,
    informational_only: true,
    hint: 'Informational only. Not employer wages and not on this employer\'s W-2.',
  },
]

export function getLineTypeDef(value: string): LineTypeDef | undefined {
  return LINE_TYPES.find(t => t.value === value)
}

export interface LineItemDraft {
  id: string  // client-side temp id
  // Empty string when the admin hasn't picked a type yet — forces a deliberate
  // selection rather than silently defaulting to "Bonus" + $0.
  line_type: LineType | ''
  label: string
  amount: number
  miles?: number  // only used for mileage_irs_rate
  given_separately: boolean
}

export function lineItemContributesToGrossPay(item: { taxable_fed: boolean; taxable_fica: boolean; taxable_ny: boolean; w2_box1: boolean; informational_only: boolean }): boolean {
  // Anything with at least one tax flag set is included in gross taxable wages.
  // Informational-only items never affect anything.
  if (item.informational_only) return false
  return item.taxable_fed || item.taxable_fica || item.taxable_ny || item.w2_box1
}

export function lineItemAddsToNetPay(item: { informational_only: boolean }): boolean {
  // Reimbursements (non-taxable, not informational) get added to net pay
  // even though they don't affect taxable gross. Informational items never do.
  return !item.informational_only
}
