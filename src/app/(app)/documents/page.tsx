import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FileText, ExternalLink, CheckCircle2, Download } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import { UploadDocumentButton } from '@/components/documents/UploadDocumentButton'
import type { Profile, SignedDocument, SignedDocumentType } from '@/lib/types'

interface DocSpec {
  type: SignedDocumentType
  title: string
  description: string
  inAppHref?: string
  externalHref?: string
  externalLabel?: string
  requiresSignature?: boolean  // false = "Uploaded/Not uploaded" copy instead of "Signed/Unsigned"
}

const DOCS: DocSpec[] = [
  {
    type: 'ein_confirmation',
    title: 'EIN Confirmation Letter',
    description: 'IRS CP575 or 147C letter confirming your Employer Identification Number. Needed for W-2s, NYS-45, and Schedule H.',
    externalHref: 'https://www.irs.gov/businesses/employer-identification-number',
    externalLabel: 'Request 147C replacement',
    requiresSignature: false,
  },
  {
    type: 'i9',
    title: 'USCIS Form I-9 (Employment Eligibility Verification)',
    description: 'Required for every U.S. employee. Section 1: employee fills on/before first day. Section 2: employer fills within 3 business days after examining ID. Do NOT mail — retain in your files. Keep 3 years from hire or 1 year after termination, whichever is later.',
    externalHref: 'https://www.uscis.gov/i-9',
    externalLabel: 'USCIS I-9 page',
  },
  {
    type: 'w4',
    title: 'Federal W-4',
    description: 'Withholding allowance certificate. Required before first paycheck. Retain 4 years.',
    externalHref: 'https://www.irs.gov/pub/irs-pdf/fw4.pdf',
    externalLabel: 'Open IRS form',
  },
  {
    type: 'ls59',
    title: 'LS-59 Wage Notice',
    description: 'NY § 195(1) WTPA notice. Required at hire, in English plus the employee\'s primary language. Retain 6 years.',
    externalHref: 'https://dol.ny.gov/LS59-doc',
    externalLabel: 'Open NY DOL form',
  },
  {
    type: 'it2104',
    title: 'NY IT-2104',
    description: 'NY State withholding allowance certificate. Required before first paycheck.',
    externalHref: 'https://www.tax.ny.gov/pdf/current_forms/it/it2104_fill_in.pdf',
    externalLabel: 'Open NY DTF form',
  },
  {
    type: 'nys_registration',
    title: 'NY State Employer Registration',
    description: 'Confirmation letter from NY DOL acknowledging your NYS-100 registration. Required to file NYS-45 and receive your UI account number.',
    externalHref: 'https://labor.ny.gov/ui/bpta/nys100.shtm',
    externalLabel: 'File NYS-100 online',
    requiresSignature: false,
  },
  {
    type: 'pfl_waiver',
    title: 'PFL-Waiver',
    description: 'For employees working <20 hrs/week AND <175 days/52 weeks. Retain for the duration of employment.',
    externalHref: 'https://paidfamilyleave.ny.gov/pfl-waiver-form',
    externalLabel: 'Open NY PFL form',
  },
  {
    type: 'sexual_harassment_policy',
    title: 'Sexual Harassment Prevention Policy',
    description: 'NY Labor Law § 201-g requires all employers to adopt and distribute a sexual harassment prevention policy at hire and annually. Use the NYS model policy or a compliant equivalent. Do NOT mail — retain signed acknowledgement.',
    externalHref: 'https://www.ny.gov/programs/combating-sexual-harassment-workplace',
    externalLabel: 'NYS model policy',
  },
  {
    type: 'sexual_harassment_training_certificate',
    title: 'Sexual Harassment Prevention Training Certificate',
    description: 'Annual interactive training required by NY Labor Law § 201-g. Free NYS training at ny.gov. Complete at hire and every calendar year. Retain certificate.',
    externalHref: 'https://www.ny.gov/combating-sexual-harassment-workplace/employees',
    externalLabel: 'Free NYS training',
    requiresSignature: false,
  },
  {
    type: 'day_of_rest_acknowledgement',
    title: 'Day of Rest Acknowledgement (§ 161)',
    description: 'NY Labor Law § 161 mandates 24 consecutive hours off per calendar week for domestic workers. If she voluntarily works that day, the entire day is paid at 1.5×. Both parties sign; retain for duration of employment.',
  },
  {
    type: 'posters_bundle',
    title: 'Workplace Posters (required)',
    description: 'NY and federal law require certain posters to be accessible to the employee. Print and post in kitchen/work area: NYS Domestic Workers Bill of Rights, NYS Sexual Harassment Prevention Notice, NYS Minimum Wage, Federal FLSA, Federal EEO/USERRA/Polygraph Protection.',
    externalHref: 'https://dol.ny.gov/posting-requirements',
    externalLabel: 'NY DOL poster page',
    requiresSignature: false,
  },
  {
    type: 'sick_leave_policy',
    title: 'Sick Leave Policy',
    description: 'Unlimited unpaid sick leave — exceeds NY § 196-b small-employer floor. Print, sign, retain.',
    inAppHref: '/documents/sick-leave-policy',
  },
  {
    type: 'sick_leave_summary',
    title: 'Sick Leave Summary',
    description: 'On-demand year summary required by NY Labor Law § 196-b(4) within 3 business days of an employee request.',
    inAppHref: '/documents/sick-leave-summary',
  },
]

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: signedRows } = await supabase.from('signed_documents').select('*')
  const signedByType = new Map<string, SignedDocument>()
  for (const row of (signedRows ?? []) as SignedDocument[]) {
    signedByType.set(row.document_type, row)
  }

  // Pre-generate 1-hour signed URLs for everything that's been uploaded so the
  // download link works without an extra round-trip when the admin clicks.
  const signedUrls = new Map<string, string>()
  for (const row of signedByType.values()) {
    const { data } = await supabase
      .storage
      .from('signed-documents')
      .createSignedUrl(row.file_path, 60 * 60)
    if (data?.signedUrl) signedUrls.set(row.document_type, data.signedUrl)
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Documents</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Reference forms, in-app policies, and signed-copy uploads. Originals belong in your fire-safe — these are a redundancy backup.
        </p>
      </div>

      <div className="space-y-3">
        {DOCS.map(doc => {
          const signed = signedByType.get(doc.type)
          const signedUrl = signedUrls.get(doc.type)
          const needsSig = doc.requiresSignature !== false
          return (
            <Card key={doc.type}>
              <CardContent className="py-3 px-4 space-y-3">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{doc.title}</p>
                      {signed
                        ? (
                          <Badge className="bg-green-600 hover:bg-green-600">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {needsSig ? 'Signed' : 'Uploaded'}
                          </Badge>
                        )
                        : <Badge variant="outline">{needsSig ? 'Unsigned' : 'Not uploaded'}</Badge>
                      }
                    </div>
                    <p className="text-xs text-muted-foreground">{doc.description}</p>
                  </div>
                </div>

                {/* Reference / source links */}
                <div className="flex flex-wrap gap-2">
                  {doc.inAppHref && (
                    <Link
                      href={doc.inAppHref}
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    >
                      View in app
                    </Link>
                  )}
                  {doc.externalHref && (
                    <a
                      href={doc.externalHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      {doc.externalLabel}
                    </a>
                  )}
                </div>

                {/* Upload actions */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                  {signed ? (
                    <>
                      <p className="text-xs text-muted-foreground flex-1 min-w-0">
                        Uploaded {formatDate(signed.uploaded_at.slice(0, 10))}
                        {signed.file_name ? ` · ${signed.file_name}` : ''}
                      </p>
                      {signedUrl && (
                        <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <Download className="h-3.5 w-3.5 mr-1.5" />
                            Download
                          </Button>
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground flex-1">
                      {needsSig ? 'No signed copy uploaded yet.' : 'No copy uploaded yet.'}
                    </p>
                  )}
                  <UploadDocumentButton
                    documentType={doc.type}
                    hasExisting={!!signed}
                    uploaderId={user.id}
                    uploadLabel={needsSig ? 'Upload signed copy' : 'Upload copy'}
                    successLabel={needsSig ? 'Signed copy uploaded.' : 'Copy uploaded.'}
                  />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
