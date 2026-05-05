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
  updated_at: string
}

export interface Paystub {
  id: string
  stub_number: number
  employee_id: string
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  hours_worked: number
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
