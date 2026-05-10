import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { PrintButton } from './PrintButton'
import { formatDate } from '@/lib/dates'
import type { Profile, Settings } from '@/lib/types'

export default async function SexualHarassmentPolicyPage() {
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
  const employerAddress = settings?.employer_address ?? ''
  const employerPhone = settings?.employer_phone ?? ''
  const employee = settings?.employee_name ?? 'Employee'

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
          <h1 className="text-xl font-bold uppercase tracking-wide">Sexual Harassment Prevention Policy</h1>
          <p className="text-sm">{employer}</p>
          {employerAddress && <p className="text-xs text-muted-foreground">{employerAddress}</p>}
          {employerPhone && <p className="text-xs text-muted-foreground">{employerPhone}</p>}
          <p className="text-xs text-muted-foreground pt-1">Effective {formatDate(today)}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">1. Policy Statement</h2>
          <p className="text-sm">
            {employer} is committed to maintaining a work environment free from sexual harassment. Sexual
            harassment is a form of unlawful employment discrimination and will not be tolerated. This policy
            applies to <strong>{employee}</strong> in her capacity as a domestic employee of {employer}, as well as
            to any guests, visitors, contractors, or other individuals who interact with her in the course of
            her employment.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">2. What Is Sexual Harassment</h2>
          <p className="text-sm">
            Sexual harassment is unwelcome conduct of a sexual nature that is either: (a) made an explicit
            or implicit condition of employment; (b) used as the basis for an employment decision; or (c)
            severe or pervasive enough to create an intimidating, hostile, or offensive working environment.
            Sexual harassment includes harassment based on sex, sexual orientation, self-identified or
            perceived sex, gender expression, gender identity, or the status of being transgender.
          </p>
          <p className="text-sm">Examples of prohibited conduct include, but are not limited to:</p>
          <ul className="text-sm list-disc pl-6 space-y-1">
            <li>Unwanted sexual advances, propositions, or requests for sexual favors.</li>
            <li>Touching, groping, or other unwanted physical contact of a sexual nature.</li>
            <li>Displaying or sending sexually explicit images, jokes, or messages.</li>
            <li>Sexually suggestive comments, innuendos, or offensive remarks about a person&apos;s body or appearance.</li>
            <li>Leering, staring, or making obscene gestures.</li>
            <li>Comments about a person&apos;s gender identity, gender expression, or sexual orientation that create a hostile environment.</li>
          </ul>
          <p className="text-sm">
            Sexual harassment does not need to be motivated by sexual desire. Conduct based on gender or
            gender stereotypes that creates a hostile work environment is also prohibited.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">3. Scope</h2>
          <p className="text-sm">
            This policy applies to all work-related settings, including the employer&apos;s home, any location
            where work duties are performed, and work-related communications (phone, text, email, or social
            media). It covers conduct by the employer, any member of the employer&apos;s household, visitors,
            contractors, and any other person {employee} may encounter in connection with her work.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">4. Reporting Procedure</h2>
          <p className="text-sm">
            {employee} is encouraged to report any incident of sexual harassment as soon as possible.
            Because {employer} is a single-employer household, {employee} is not required to report
            harassment to the person who is engaging in the harassing conduct.
          </p>
          <p className="text-sm font-medium mt-1">Internal report:</p>
          <p className="text-sm">
            {employee} may report the conduct directly to either employer at the address or phone number
            listed on this policy. Reports may be made verbally or in writing.
          </p>
          <p className="text-sm font-medium mt-1">External report — NYS Division of Human Rights (NYSDHR):</p>
          <p className="text-sm">
            {employee} may file a complaint with the NYSDHR at any time, regardless of whether an internal
            report is made first. Complaints must generally be filed within three years of the last act of
            harassment. NYSDHR can be reached at <strong>1-888-392-3644</strong> or at{' '}
            <strong>dhr.ny.gov</strong>.
          </p>
          <p className="text-sm font-medium mt-1">External report — U.S. Equal Employment Opportunity Commission (EEOC):</p>
          <p className="text-sm">
            {employee} may also file a charge with the EEOC within 300 days of the last act of harassment.
            The EEOC can be reached at <strong>1-800-669-4000</strong> or at <strong>eeoc.gov</strong>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">5. Investigation</h2>
          <p className="text-sm">
            {employer} will promptly and thoroughly investigate any report of sexual harassment, to the
            extent practicable given the size of the household. The investigation will be conducted
            impartially and with respect for the privacy of all individuals involved. Where the complaint
            involves conduct by the employer, {employee} is encouraged to file directly with the NYSDHR or
            EEOC.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">6. No Retaliation</h2>
          <p className="text-sm">
            Retaliation against any individual who, in good faith, reports sexual harassment, participates
            in an investigation, or exercises any right protected by law is strictly prohibited and is
            itself a violation of this policy and NY Labor Law § 201-g. Retaliation includes termination,
            reduction in pay or hours, threats, or any other adverse employment action.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">7. Remedies and Legal Rights</h2>
          <p className="text-sm">
            Employees who experience sexual harassment have legal rights and remedies under state and
            federal law, including the New York State Human Rights Law (NY Exec. Law § 290 et seq.) and
            Title VII of the Civil Rights Act of 1964. Remedies may include compensatory damages, punitive
            damages, attorneys&apos; fees, and injunctive relief. Filing a complaint with the NYSDHR or EEOC is
            free of charge.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">8. Annual Distribution</h2>
          <p className="text-sm">
            In accordance with NY Labor Law § 201-g, {employer} will provide a copy of this policy to{' '}
            {employee} at the time of hire and annually thereafter. {employee} will be asked to sign an
            acknowledgement of receipt each time the policy is distributed.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">9. Amendments</h2>
          <p className="text-sm">
            {employer} may amend this policy in writing at any time, provided that any amendment complies
            with or exceeds the minimum standards required by NY Labor Law § 201-g and the NYS Division of
            Human Rights.
          </p>
        </section>

        {/* Acknowledgement */}
        <section className="pt-6 border-t space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Employee Acknowledgement of Receipt</h2>
          <p className="text-sm">
            I acknowledge that I have received, read, and understood the Sexual Harassment Prevention Policy
            of {employer}. I understand that sexual harassment is prohibited and that I have the right to
            report harassment without fear of retaliation. I understand that I may file a complaint with the
            NYS Division of Human Rights or the EEOC at any time.
          </p>
        </section>

        {/* Signatures */}
        <section className="pt-4 grid grid-cols-2 gap-8 text-sm">
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
          This policy is adopted pursuant to NY Labor Law § 201-g. For questions contact the NYS Division
          of Human Rights at 1-888-392-3644 or{' '}
          <span className="underline">dhr.ny.gov</span>, or the EEOC at 1-800-669-4000 or{' '}
          <span className="underline">eeoc.gov</span>.
        </footer>
      </article>
    </div>
  )
}
