import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { W2View } from '@/components/w2/W2View'
import type { Profile, W2 } from '@/lib/types'

export default async function W2Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  const isAdmin = profile?.role === 'admin'

  const w2Query = supabase.from('w2s').select('*').order('tax_year', { ascending: false })
  if (!isAdmin) w2Query.eq('employee_id', user.id)

  const { data: w2s } = await w2Query

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold mb-4">W-2 Forms</h1>
      <W2View
        w2s={(w2s ?? []) as W2[]}
        role={profile?.role ?? 'employee'}
        userId={user.id}
      />
    </div>
  )
}
