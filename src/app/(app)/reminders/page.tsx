import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RemindersView, type ReminderAmount } from '@/components/reminders/RemindersView'
import { anyQuarterMeetsFutaThreshold, calculateNYS45, calculateFederalEstimatedTax, calculateScheduleH, getFederalEstimatedTaxPeriod, type Quarter } from '@/lib/filings'
import { getTaxRatesForYear } from '@/lib/tax'
import type { Reminder, Profile, Settings, Paystub } from '@/lib/types'

export default async function RemindersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: reminders }, { data: settings }, { data: allStubs }] = await Promise.all([
    supabase.from('reminders').select('*').order('due_date', { ascending: true }),
    supabase.from('settings').select('suta_rate').single<Pick<Settings, 'suta_rate'>>(),
    supabase.from('paystubs').select('*'),
  ])

  // Compute the live "$X due" amount for each reminder by parsing the title and
  // running the same math the /filings detail views run. Reminders without a
  // matching parse (e.g., "Verify 2027 tax rates") get no amount.
  const sutaRate = Number(settings?.suta_rate ?? 0)
  const stubs = (allStubs ?? []) as Paystub[]
  const amounts: Record<string, ReminderAmount> = {}

  for (const r of (reminders ?? []) as Reminder[]) {
    const nys45 = r.title.match(/NYS-45\s+Q([1-4])\s+(\d{4})/i)
    const fed = r.title.match(/Federal Estimated Tax\s+Q([1-4])\s+(\d{4})/i)
    const schedH = r.title.match(/Schedule H\s+(\d{4})/i)

    if (nys45) {
      const q = parseInt(nys45[1]) as Quarter
      const year = parseInt(nys45[2])
      const yearStart = `${year}-01-01`
      const startMonth = (q - 1) * 3 + 1
      const endMonth = q * 3
      const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
      const qStart = `${year}-${String(startMonth).padStart(2, '0')}-01`
      const qEnd = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const yearStubs = stubs.filter(s => s.pay_date >= yearStart && s.pay_date <= qEnd)
      const inQuarter = yearStubs.filter(s => s.pay_date >= qStart)
      const ytdGrossBefore = yearStubs
        .filter(s => s.pay_date < qStart)
        .reduce((sum, s) => sum + Number(s.gross_pay), 0)
      const rates = await getTaxRatesForYear(supabase, year)
      if (rates) {
        const data = calculateNYS45(inQuarter, ytdGrossBefore, rates, sutaRate, year, q)
        amounts[r.id] = {
          amount: data.total_ui_due + data.total_tax_withheld,
          agency: 'NY State Tax & Finance',
        }
      }
    } else if (fed) {
      const q = parseInt(fed[1]) as Quarter
      const year = parseInt(fed[2])
      // Federal 1040-ES uses IRS fiscal periods (3/2/3/4 months), not
      // calendar quarters — see getFederalEstimatedTaxPeriod.
      const period = getFederalEstimatedTaxPeriod(year, q)
      const inPeriod = stubs.filter(s => s.pay_date >= period.start && s.pay_date <= period.end)
      const data = calculateFederalEstimatedTax(inPeriod, year, q)
      amounts[r.id] = {
        amount: data.total_due,
        agency: 'IRS (Form 1040-ES)',
      }
    } else if (schedH) {
      const year = parseInt(schedH[1])
      const yearStubs = stubs.filter(s => s.pay_date.startsWith(`${year}-`))
      const rates = await getTaxRatesForYear(supabase, year)
      if (rates) {
        // Pub 926: the FUTA trigger checks prior-year wages too.
        const priorYearFutaThresholdMet = anyQuarterMeetsFutaThreshold(
          stubs.filter(s => s.pay_date.startsWith(`${year - 1}-`)),
          Number(rates.futa_quarterly_threshold),
        )
        const data = calculateScheduleH(yearStubs, rates, year, priorYearFutaThresholdMet)
        amounts[r.id] = {
          amount: data.total_household_employment_taxes,
          agency: 'IRS (Form 1040 + Schedule H)',
        }
      }
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold mb-4">Reminders</h1>
      <RemindersView reminders={(reminders ?? []) as Reminder[]} amounts={amounts} />
    </div>
  )
}
