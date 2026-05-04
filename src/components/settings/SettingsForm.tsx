'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { X, Plus, LogOut } from 'lucide-react'
import type { Settings } from '@/lib/types'

interface Props {
  settings: Settings | null
}

export function SettingsForm({ settings: initial }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)

  const s = initial ?? {} as Partial<Settings>

  const [employerName, setEmployerName] = useState(s.employer_name ?? '')
  const [employerEin, setEmployerEin] = useState(s.employer_ein ?? '')
  const [employerAddress, setEmployerAddress] = useState(s.employer_address ?? '')
  const [employeeName, setEmployeeName] = useState(s.employee_name ?? '')
  const [employeeEmail, setEmployeeEmail] = useState(s.employee_email ?? '')
  const [hourlyRate, setHourlyRate] = useState(s.employee_hourly_rate?.toString() ?? '')
  const [federalWithholding, setFederalWithholding] = useState(s.federal_withholding_per_period?.toString() ?? '0')
  const [stateWithholding, setStateWithholding] = useState(s.state_withholding_per_period?.toString() ?? '0')
  const [pflWaived, setPflWaived] = useState(s.pfl_waived ?? false)
  const [sutaRate, setSutaRate] = useState(s.suta_rate?.toString() ?? '0.041')
  const [additionalEmails, setAdditionalEmails] = useState<string[]>(s.additional_emails ?? [])
  const [replyToEmails, setReplyToEmails] = useState<string[]>(s.reply_to_emails ?? [])
  const [reminderEmails, setReminderEmails] = useState<string[]>(s.reminder_emails ?? ['Persad.household@gmail.com'])
  const [newAdditional, setNewAdditional] = useState('')
  const [newReplyTo, setNewReplyTo] = useState('')
  const [newReminder, setNewReminder] = useState('')

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('settings').update({
      employer_name: employerName || null,
      employer_ein: employerEin || null,
      employer_address: employerAddress || null,
      employee_name: employeeName || null,
      employee_email: employeeEmail || null,
      employee_hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
      federal_withholding_per_period: parseFloat(federalWithholding || '0'),
      state_withholding_per_period: parseFloat(stateWithholding || '0'),
      pfl_waived: pflWaived,
      suta_rate: parseFloat(sutaRate || '0.041'),
      additional_emails: additionalEmails,
      reply_to_emails: replyToEmails,
      reminder_emails: reminderEmails,
      updated_at: new Date().toISOString(),
    }).eq('id', initial?.id ?? '')

    if (error) {
      toast.error('Failed to save settings.')
    } else {
      toast.success('Settings saved.')
      startTransition(() => router.refresh())
    }
    setSaving(false)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <Section title="Employer">
        <Field label="Name" value={employerName} onChange={setEmployerName} placeholder="Persad Family" />
        <Field label="EIN" value={employerEin} onChange={setEmployerEin} placeholder="12-3456789" />
        <Field label="Address" value={employerAddress} onChange={setEmployerAddress} placeholder="123 Main St, Nassau County, NY 11001" />
      </Section>

      <Section title="Employee">
        <Field label="Full Name" value={employeeName} onChange={setEmployeeName} />
        <Field label="Email" value={employeeEmail} onChange={setEmployeeEmail} type="email" />
        <Field label="Hourly Rate ($)" value={hourlyRate} onChange={setHourlyRate} type="number" placeholder="20.00" />
      </Section>

      <Section title="Withholding">
        <Field label="Federal Withholding per Period ($)" value={federalWithholding} onChange={setFederalWithholding} type="number" placeholder="0.00" />
        <Field label="NY State Withholding per Period ($)" value={stateWithholding} onChange={setStateWithholding} type="number" placeholder="0.00" />
        <div className="flex items-center justify-between py-1">
          <div>
            <Label>PFL Waived</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Eligible if employee works &lt;20 hrs/week. Requires signed waiver.</p>
          </div>
          <Switch checked={pflWaived} onCheckedChange={setPflWaived} />
        </div>
        <div className="space-y-1.5">
          <Label>SUTA Rate</Label>
          <Input value={sutaRate} onChange={e => setSutaRate(e.target.value)} type="number" step="0.0001" />
          <p className="text-xs text-muted-foreground">Update annually from your NY UI rate notice.</p>
        </div>
      </Section>

      <Section title="Additional Stub Recipients">
        <EmailList emails={additionalEmails} onRemove={e => setAdditionalEmails(additionalEmails.filter(x => x !== e))} />
        <div className="flex gap-2">
          <Input value={newAdditional} onChange={e => setNewAdditional(e.target.value)} type="email" placeholder="email@example.com" className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => { if (newAdditional) { setAdditionalEmails([...additionalEmails, newAdditional]); setNewAdditional('') } }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <Section title="Reply-To Emails">
        <EmailList emails={replyToEmails} onRemove={e => setReplyToEmails(replyToEmails.filter(x => x !== e))} />
        <div className="flex gap-2">
          <Input value={newReplyTo} onChange={e => setNewReplyTo(e.target.value)} type="email" placeholder="email@example.com" className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => { if (newReplyTo) { setReplyToEmails([...replyToEmails, newReplyTo]); setNewReplyTo('') } }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <Section title="Reminder Notification Emails">
        <p className="text-xs text-muted-foreground">These addresses receive filing deadline reminders.</p>
        <EmailList emails={reminderEmails} onRemove={e => setReminderEmails(reminderEmails.filter(x => x !== e))} />
        <div className="flex gap-2">
          <Input value={newReminder} onChange={e => setNewReminder(e.target.value)} type="email" placeholder="email@example.com" className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => { if (newReminder) { setReminderEmails([...reminderEmails, newReminder]); setNewReminder('') } }}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Section>

      <Button className="w-full" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>

      <Separator />

      <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={signOut}>
        <LogOut className="h-4 w-4 mr-2" />
        Sign Out
      </Button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">{children}</CardContent>
    </Card>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder} />
    </div>
  )
}

function EmailList({ emails, onRemove }: { emails: string[]; onRemove: (e: string) => void }) {
  if (!emails.length) return null
  return (
    <div className="space-y-1.5">
      {emails.map(email => (
        <div key={email} className="flex items-center justify-between text-sm">
          <span>{email}</span>
          <button onClick={() => onRemove(email)} className="text-muted-foreground hover:text-destructive">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
