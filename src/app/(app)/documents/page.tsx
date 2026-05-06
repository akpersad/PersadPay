import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, ChevronRight } from 'lucide-react'
import type { Profile } from '@/lib/types'

interface DocLink {
  href: string
  title: string
  description: string
}

const docs: DocLink[] = [
  {
    href: '/documents/sick-leave-policy',
    title: 'Sick Leave Policy',
    description: 'Unlimited unpaid sick leave — exceeds NY § 196-b small-employer floor. Print, sign, and retain.',
  },
  {
    href: '/documents/sick-leave-summary',
    title: 'Sick Leave Summary',
    description: 'On-demand year summary required by NY Labor Law § 196-b(4) within 3 business days of an employee request.',
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

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-lg font-semibold">Documents</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Policies and forms to print, sign, and retain in your records.
        </p>
      </div>

      <div className="space-y-2">
        {docs.map(doc => (
          <Link key={doc.href} href={doc.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
