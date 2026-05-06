import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { TaxRatesPanel } from '@/components/settings/TaxRatesPanel'
import { PushNotificationsToggle } from '@/components/settings/PushNotificationsToggle'
import { getTaxRatesForYear } from '@/lib/tax'
import type { Settings, Profile } from '@/lib/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const currentYear = new Date().getFullYear()

  const [{ data: settings }, taxRates] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    getTaxRatesForYear(supabase, currentYear),
  ])

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <SettingsForm settings={settings} />
      <PushNotificationsToggle />
      <TaxRatesPanel rates={taxRates} requestedYear={currentYear} />
    </div>
  )
}
