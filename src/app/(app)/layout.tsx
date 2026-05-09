import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/nav/BottomNav'
import { EmployeeHeader } from '@/components/nav/EmployeeHeader'
import type { Profile } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile) redirect('/api/auth/sign-out')

  return (
    <div className="flex flex-col min-h-screen">
      {profile.role === 'employee' && (
        <EmployeeHeader name={profile.full_name} />
      )}
      <main className="flex-1 pb-20">
        {children}
      </main>
      <BottomNav role={profile.role} />
    </div>
  )
}
