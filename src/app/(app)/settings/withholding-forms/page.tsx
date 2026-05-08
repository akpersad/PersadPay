import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft } from 'lucide-react'
import { WithholdingFormsView } from './WithholdingFormsView'
import type { Profile, Settings, WithholdingForm } from '@/lib/types'

export default async function WithholdingFormsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: settings }, { data: forms }] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    supabase.from('withholding_forms').select('*'),
  ])

  const formMap = new Map<string, WithholdingForm>()
  for (const f of (forms ?? []) as WithholdingForm[]) {
    formMap.set(f.form_type, f)
  }

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg md:max-w-3xl mx-auto space-y-4">
      <Link href="/settings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Settings
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Withholding Forms</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Capture the values from her signed W-4 and IT-2104, then use the canonical
          calculators to derive the per-period dollar amount the tax engine should withhold.
        </p>
      </div>

      <WithholdingFormsView
        settings={settings}
        w4={formMap.get('W-4') ?? null}
        it2104={formMap.get('IT-2104') ?? null}
        userId={user.id}
      />

      <Link
        href="/settings/history"
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
      >
        View change history
      </Link>
    </div>
  )
}
