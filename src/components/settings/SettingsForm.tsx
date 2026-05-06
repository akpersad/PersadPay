'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { X, Plus, LogOut, History, FileSpreadsheet } from 'lucide-react'
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
  const [employerPhone, setEmployerPhone] = useState(s.employer_phone ?? '')
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
      employer_phone: employerPhone || null,
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
        <Field label="Name" value={employerName} onChange={setEmployerName} onBlur={() => setEmployerName(employerName.trim())} placeholder="Persad Family" />
        <Field label="EIN" value={employerEin} onChange={setEmployerEin} onBlur={() => setEmployerEin(formatEin(employerEin))} placeholder="12-3456789" />
        <Field label="Address" value={employerAddress} onChange={setEmployerAddress} onBlur={() => setEmployerAddress(employerAddress.trim())} placeholder="123 Main St, Franklin Square, NY 11010" />
        <Field label="Phone" value={employerPhone} onChange={setEmployerPhone} onBlur={() => setEmployerPhone(formatPhone(employerPhone))} type="tel" placeholder="(516) 555-0100" />
      </Section>

      <Section title="Employee">
        <Field label="Full Name" value={employeeName} onChange={setEmployeeName} onBlur={() => setEmployeeName(employeeName.trim())} />
        <Field label="Email" value={employeeEmail} onChange={setEmployeeEmail} onBlur={() => setEmployeeEmail(employeeEmail.trim().toLowerCase())} type="email" />
        <Field label="Hourly Rate ($)" value={hourlyRate} onChange={setHourlyRate} onBlur={() => setHourlyRate(formatCurrencyInput(hourlyRate))} inputMode="decimal" placeholder="20.00" />
      </Section>

      <Section title="Withholding">
        <Field label="Federal Withholding per Period ($)" value={federalWithholding} onChange={setFederalWithholding} onBlur={() => setFederalWithholding(formatCurrencyInput(federalWithholding))} inputMode="decimal" placeholder="0.00" />
        <Field label="NY State Withholding per Period ($)" value={stateWithholding} onChange={setStateWithholding} onBlur={() => setStateWithholding(formatCurrencyInput(stateWithholding))} inputMode="decimal" placeholder="0.00" />
        <div className="flex items-center justify-between py-1">
          <div>
            <Label>PFL Waived</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Eligible if employee works &lt;20 hrs/week. Requires signed waiver.</p>
          </div>
          <Switch checked={pflWaived} onCheckedChange={setPflWaived} />
        </div>
        <div className="space-y-1.5">
          <Label>SUTA Rate</Label>
          <Input
            value={sutaRate}
            onChange={e => setSutaRate(e.target.value)}
            onBlur={() => setSutaRate(formatRateInput(sutaRate, 4))}
            inputMode="decimal"
          />
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

      <Link href="/settings/withholding-forms" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        W-4 / IT-2104 withholding forms
      </Link>

      <Link href="/settings/history" className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}>
        <History className="h-4 w-4 mr-2" />
        View change history
      </Link>

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

function Field({ label, value, onChange, onBlur, type = 'text', inputMode, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
      />
    </div>
  )
}

function formatCurrencyInput(v: string): string {
  const n = parseFloat(v)
  return isNaN(n) ? v : n.toFixed(2)
}

function formatRateInput(v: string, decimals: number): string {
  const n = parseFloat(v)
  return isNaN(n) ? v : n.toFixed(decimals)
}

function formatEin(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`
  return v
}

function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return v
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
