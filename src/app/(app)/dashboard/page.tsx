import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminDashboard } from '@/components/dashboard/AdminDashboard'
import { EmployeeDashboard } from '@/components/dashboard/EmployeeDashboard'
import type { Profile } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile) redirect('/api/auth/sign-out')

  return profile.role === 'admin' ? <AdminDashboard /> : <EmployeeDashboard />
}
