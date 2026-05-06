export type Role = 'admin' | 'employee'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  created_at: string
}

export interface Settings {
  id: string
  employer_name: string | null
  employer_ein: string | null
  employer_address: string | null
  employer_phone: string | null
  employee_name: string | null
  employee_email: string | null
  employee_hourly_rate: number | null
  federal_withholding_per_period: number
  state_withholding_per_period: number
  pfl_waived: boolean
  suta_rate: number
  additional_emails: string[]
  reply_to_emails: string[]
  reminder_emails: string[]
  hysa_actual_balance: number | null
  hysa_actual_balance_at: string | null
  updated_at: string
}

export type StubReason = 'week_off' | 'sick_unpaid' | 'vacation_unpaid' | 'holiday_unpaid' | 'other'

export interface Paystub {
  id: string
  stub_number: number
  employee_id: string
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  hours_worked: number
  overtime_hours: number
  sick_hours: number
  reason: StubReason | null
  // Per-day hours breakdown keyed by YYYY-MM-DD. Only present on stubs
  // created with daily-entry mode; null for total-hours stubs.
  daily_hours: Record<string, number> | null
  hourly_rate: number
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
  payment_sent: boolean
  zelle_transaction_id: string | null
  stub_sent: boolean
  hysa_transferred: boolean
  hysa_transferred_at: string | null
  hysa_notes: string | null
  created_at: string
  created_by: string
}

export interface Reminder {
  id: string
  title: string
  due_date: string
  description: string
  dismissed: boolean
  email_sent: boolean
  created_at: string
}

export interface OnboardingItem {
  id: string
  label: string
  detail: string
  completed: boolean
  sort_order: number
}

export interface W2 {
  id: string
  employee_id: string
  tax_year: number
  wages_tips: number
  federal_tax_withheld: number
  ss_wages: number
  ss_tax_withheld: number
  medicare_wages: number
  medicare_tax_withheld: number
  state_wages: number
  state_tax_withheld: number
  generated_at: string
  generated_by: string
}

// Paystub with pre-calculated YTD values — passed to PDF renderer
export interface PaystubWithYTD extends Paystub {
  ytd_gross: number
  // Regular wages YTD = sum(hours_worked × hourly_rate) across the year. Distinct
  // from ytd_gross (which includes taxable additional pay like bonuses + gift cards)
  // so the "Regular" row on the stub shows the right per-line YTD.
  ytd_regular_wages: number
  ytd_federal_withholding: number
  ytd_fica_social_security: number
  ytd_fica_medicare: number
  ytd_state_withholding: number
  ytd_sdi: number
  ytd_pfl: number
  ytd_employer_fica_ss: number
  ytd_employer_fica_medicare: number
  ytd_futa: number
  ytd_suta: number
  ytd_net_pay: number
  ytd_total_employee_taxes: number
  total_employee_taxes: number
}

export interface PaystubLineItem {
  id: string
  paystub_id: string
  line_type: string
  label: string
  amount: number
  taxable_fed: boolean
  taxable_fica: boolean
  taxable_ny: boolean
  w2_box1: boolean
  informational_only: boolean
  given_separately: boolean
  sort_order: number
  created_at: string
}

export type SignedDocumentType =
  | 'sick_leave_policy'
  | 'sick_leave_summary'
  | 'ls59'
  | 'pfl_waiver'
  | 'w4'
  | 'it2104'
  | 'ein_confirmation'
  | 'nys_registration'

export interface SignedDocument {
  id: string
  document_type: SignedDocumentType
  file_path: string
  file_name: string | null
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_at: string
  uploaded_by: string | null
  notes: string | null
}

export type WithholdingFormType = 'W-4' | 'IT-2104'

export interface WithholdingForm {
  id: string
  form_type: WithholdingFormType
  form_values: Record<string, unknown>
  computed_amount: number
  computed_against_gross: number | null
  computed_at: string | null
  updated_by: string | null
  updated_at: string
  notes: string | null
}

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh_key: string
  auth_key: string
  user_agent: string | null
  created_at: string
  last_used_at: string | null
}

export interface AuditLogEntry {
  id: string
  table_name: string
  record_id: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
}

export interface Filing {
  id: string
  filing_type: 'NYS-45' | 'Schedule H' | 'Federal Estimated Tax'
  tax_year: number
  quarter: number | null
  filed_on: string | null
  confirmation: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

export type HysaTransactionType =
  | 'deposit_paystub'
  | 'deposit_manual'
  | 'withdrawal_filing'
  | 'withdrawal_manual'
  | 'balance_correction'

export interface HysaTransaction {
  id: string
  transaction_type: HysaTransactionType
  amount: number
  paystub_id: string | null
  filing_id: string | null
  effective_date: string
  notes: string | null
  actor_id: string | null
  created_at: string
}

// HysaTransaction enriched with related stub/filing data for ledger display
export interface HysaTransactionWithRefs extends HysaTransaction {
  paystubs: { stub_number: number; pay_period_start: string; pay_period_end: string } | null
  filings: { filing_type: string; tax_year: number; quarter: number | null } | null
}

export interface W2Data {
  employee_name: string
  employer_name: string
  employer_ein: string
  employer_address: string
  tax_year: number
  wages_tips: number
  federal_tax_withheld: number
  ss_wages: number
  ss_tax_withheld: number
  medicare_wages: number
  medicare_tax_withheld: number
  state_wages: number
  state_tax_withheld: number
}
