import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { PrintButton } from './PrintButton'
import { formatDate } from '@/lib/dates'
import type { Profile, Settings } from '@/lib/types'

export default async function SickLeavePolicyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: settings } = await supabase.from('settings').select('*').single<Settings>()

  const today = new Date().toISOString().slice(0, 10)
  const employer = settings?.employer_name ?? 'Employer'
  const employee = settings?.employee_name ?? 'Employee'
  const employerAddress = settings?.employer_address ?? ''

  return (
    <div className="px-4 pt-4 pb-4 max-w-2xl mx-auto print:max-w-none print:px-0 print:pt-0">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link href="/documents">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <PrintButton />
      </div>

      {/* Policy document — print-friendly */}
      <article className="bg-white text-black space-y-5 print:text-[11pt] leading-relaxed">
        <header className="text-center space-y-1 border-b pb-4">
          <h1 className="text-xl font-bold uppercase tracking-wide">Sick Leave Policy</h1>
          <p className="text-sm">{employer}</p>
          {employerAddress && <p className="text-xs text-muted-foreground">{employerAddress}</p>}
          <p className="text-xs text-muted-foreground pt-1">Effective {formatDate(today)}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">1. Scope</h2>
          <p className="text-sm">
            This policy applies to <strong>{employee}</strong> in her capacity as a domestic employee of {employer}.
            It is offered in compliance with the New York State Sick Leave Law (NY Labor Law § 196-b)
            and supersedes any prior practice on this subject.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">2. Statutory Floor</h2>
          <p className="text-sm">
            Under NY Labor Law § 196-b(1)(a), an employer with four or fewer employees and net income of $1 million
            or less in the previous tax year is required to provide each employee with up to <strong>40 hours of
            unpaid sick leave per calendar year</strong>. {employer} qualifies for and is subject to this small-employer
            tier.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">3. Sick Leave Granted (Exceeds the Floor)</h2>
          <p className="text-sm">
            {employer} grants <strong>unlimited unpaid sick leave</strong>, which exceeds the 40-hour statutory minimum.
            Sick leave is unpaid; the employee will not be paid for hours not worked. The employee may use sick leave
            as needed without forfeiture of employment, subject to the procedures below.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">4. Permitted Uses</h2>
          <p className="text-sm">Sick leave may be used for any of the following, consistent with § 196-b(4):</p>
          <ul className="text-sm list-disc pl-6 space-y-1">
            <li>The employee&apos;s own mental or physical illness, injury, or health condition, including diagnosis, care, or treatment.</li>
            <li>The mental or physical illness, injury, or health condition of a covered family member, including diagnosis, care, or treatment.</li>
            <li>Absence from work when the employee or a family member has been the victim of domestic violence, family offense, sexual offense, stalking, or human trafficking — for purposes including legal proceedings, safety planning, and counseling.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">5. Notice and Documentation</h2>
          <p className="text-sm">
            The employee should notify the employer as far in advance as is reasonably practicable. For absences of
            three or more consecutive workdays, {employer} may request reasonable documentation that the leave was
            taken for a permitted purpose. Documentation will not be required to disclose confidential information
            about the underlying condition.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">6. Records and Summaries</h2>
          <p className="text-sm">
            {employer} will maintain records of sick leave used. Pursuant to § 196-b(4), the employee may request a
            summary of the amount of sick leave used in the current calendar year and the prior calendar year, and
            {' '}{employer} will provide the summary in writing within three business days.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">7. No Retaliation</h2>
          <p className="text-sm">
            {employer} will not retaliate against the employee for requesting or using sick leave under this policy.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">8. Amendments</h2>
          <p className="text-sm">
            {employer} may amend this policy in writing. Any amendment will not reduce the statutory minimum
            entitlement set by § 196-b.
          </p>
        </section>

        {/* Signatures */}
        <section className="pt-8 grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-6">
            <p className="font-semibold">Employer</p>
            <div>
              <div className="border-b border-black h-8" />
              <p className="text-xs text-muted-foreground mt-1">Signature</p>
            </div>
            <div>
              <div className="border-b border-black h-6" />
              <p className="text-xs text-muted-foreground mt-1">Printed name</p>
            </div>
            <div>
              <div className="border-b border-black h-6" />
              <p className="text-xs text-muted-foreground mt-1">Date</p>
            </div>
          </div>
          <div className="space-y-6">
            <p className="font-semibold">Employee</p>
            <div>
              <div className="border-b border-black h-8" />
              <p className="text-xs text-muted-foreground mt-1">Signature</p>
            </div>
            <div>
              <div className="border-b border-black h-6" />
              <p className="text-xs text-muted-foreground mt-1">Printed name</p>
            </div>
            <div>
              <div className="border-b border-black h-6" />
              <p className="text-xs text-muted-foreground mt-1">Date</p>
            </div>
          </div>
        </section>

        <footer className="pt-6 text-xs text-muted-foreground border-t">
          This policy reflects the requirements of NY Labor Law § 196-b as of the effective date.
          For statutory updates, refer to{' '}
          <a href="https://www.ny.gov/programs/new-york-paid-sick-leave" className="underline">ny.gov/programs/new-york-paid-sick-leave</a>.
        </footer>
      </article>
    </div>
  )
}
