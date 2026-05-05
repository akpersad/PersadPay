import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewStubForm } from '@/components/stubs/NewStubForm'
import type { Settings, Paystub, Profile } from '@/lib/types'

export default async function NewStubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [
    { data: settings },
    { data: employee },
    { data: lastStub },
    { data: ytdStubs },
  ] = await Promise.all([
    supabase.from('settings').select('*').single<Settings>(),
    supabase.from('profiles').select('id').eq('role', 'employee').single<Pick<Profile, 'id'>>(),
    supabase
      .from('paystubs')
      .select('stub_number, pay_period_end')
      .order('stub_number', { ascending: false })
      .limit(1)
      .single<Pick<Paystub, 'stub_number' | 'pay_period_end'>>(),
    supabase
      .from('paystubs')
      .select('gross_pay, pfl')
      .gte('pay_date', `${new Date().getFullYear()}-01-01`),
  ])

  const nextStubNumber = lastStub ? lastStub.stub_number + 1 : 1
  const ytdGrossBefore = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.gross_pay), 0)
  const ytdPflBefore = (ytdStubs ?? []).reduce((sum, s) => sum + Number(s.pfl ?? 0), 0)

  const settingsIncomplete = !settings?.employee_email || !settings?.employer_name || !employee?.id

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-lg font-semibold mb-4">New Pay Stub</h1>
      {settingsIncomplete && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Settings are incomplete. Please fill out employer info, employee info, and create the employee account before generating stubs.
        </div>
      )}
      <NewStubForm
        settings={settings}
        employeeId={employee?.id ?? ''}
        lastPayPeriodEnd={lastStub?.pay_period_end ?? null}
        nextStubNumber={nextStubNumber}
        ytdGrossBefore={ytdGrossBefore}
        ytdPflBefore={ytdPflBefore}
        createdBy={user.id}
      />
    </div>
  )
}
