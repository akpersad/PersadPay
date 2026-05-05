import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RemindersView } from '@/components/reminders/RemindersView'
import type { Reminder, Profile } from '@/lib/types'

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

  const { data: reminders } = await supabase
    .from('reminders')
    .select('*')
    .order('due_date', { ascending: true })

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold mb-4">Reminders</h1>
      <RemindersView reminders={(reminders ?? []) as Reminder[]} />
    </div>
  )
}
