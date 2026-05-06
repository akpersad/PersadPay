'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatCurrency } from '@/lib/dates'
import type { Settings, WithholdingForm } from '@/lib/types'

interface Props {
  settings: Settings | null
  w4: WithholdingForm | null
  it2104: WithholdingForm | null
  userId: string
}

// Average week — the field is editable so the admin can match what the IRS
// estimator / NYS-50-T table needs (some employees have variable hours).
const DEFAULT_HOURS_PER_WEEK = 9

export function WithholdingFormsView({ settings, w4, it2104, userId }: Props) {
  const currentRate = Number(settings?.employee_hourly_rate ?? 0)
  const expectedGross = Math.round(currentRate * DEFAULT_HOURS_PER_WEEK * 100) / 100

  return (
    <div className="space-y-4">
      <W4Card existing={w4} settings={settings} expectedGross={expectedGross} userId={userId} />
      <IT2104Card existing={it2104} settings={settings} expectedGross={expectedGross} userId={userId} />
    </div>
  )
}

interface CardProps {
  existing: WithholdingForm | null
  settings: Settings | null
  expectedGross: number
  userId: string
}

const W4_FILING_STATUSES = [
  { value: 'single', label: 'Single or married filing separately' },
  { value: 'mfj', label: 'Married filing jointly / qualifying surviving spouse' },
  { value: 'hoh', label: 'Head of household' },
]

interface W4Values {
  filing_status: string
  multiple_jobs: boolean
  dependents_amount: string
  other_income: string
  deductions: string
  additional_withholding: string
}

function W4Card({ existing, settings, expectedGross, userId }: CardProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const initial = (existing?.form_values ?? {}) as Partial<W4Values>
  const [filingStatus, setFilingStatus] = useState(initial.filing_status ?? 'single')
  const [multipleJobs, setMultipleJobs] = useState(initial.multiple_jobs ?? false)
  const [dependents, setDependents] = useState(initial.dependents_amount ?? '0')
  const [otherIncome, setOtherIncome] = useState(initial.other_income ?? '0')
  const [deductions, setDeductions] = useState(initial.deductions ?? '0')
  const [additional, setAdditional] = useState(initial.additional_withholding ?? '0')
  const [computedAmount, setComputedAmount] = useState(String(existing?.computed_amount ?? settings?.federal_withholding_per_period ?? 0))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const grossAtCompute = Number(existing?.computed_against_gross ?? 0)
  const grossDrifted = !!existing?.computed_at && Math.abs(grossAtCompute - expectedGross) > 0.01

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const formValues: W4Values = {
      filing_status: filingStatus,
      multiple_jobs: multipleJobs,
      dependents_amount: dependents,
      other_income: otherIncome,
      deductions,
      additional_withholding: additional,
    }
    const amount = parseFloat(computedAmount || '0')

    const { error: formErr } = await supabase
      .from('withholding_forms')
      .upsert(
        {
          form_type: 'W-4',
          form_values: formValues,
          computed_amount: amount,
          computed_against_gross: expectedGross,
          computed_at: new Date().toISOString(),
          updated_by: userId,
          updated_at: new Date().toISOString(),
          notes: notes || null,
        },
        { onConflict: 'form_type' },
      )

    if (formErr) {
      toast.error(`Save failed: ${formErr.message}`)
      setSaving(false)
      return
    }

    if (settings?.id) {
      const { error: setErr } = await supabase
        .from('settings')
        .update({
          federal_withholding_per_period: amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id)
      if (setErr) {
        toast.error(`Form saved but settings sync failed: ${setErr.message}`)
        setSaving(false)
        return
      }
    }

    toast.success('W-4 saved.')
    setSaving(false)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Federal W-4</span>
          {existing
            ? <Badge variant="outline" className="font-normal">Last saved {formatDate(existing.updated_at.slice(0, 10))}</Badge>
            : <Badge variant="outline" className="font-normal">Not yet captured</Badge>
          }
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {/* Form values */}
        <div className="space-y-1.5">
          <Label htmlFor="w4-filing-status">Filing status (Step 1c)</Label>
          <Select value={filingStatus} onValueChange={v => v && setFilingStatus(v)}>
            <SelectTrigger id="w4-filing-status" className="w-full">
              <SelectValue>{(value: string | null) => W4_FILING_STATUSES.find(s => s.value === value)?.label ?? 'Pick…'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {W4_FILING_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label>Step 2(c) — Multiple jobs</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              On if she has more than one job AND box 2(c) is checked on her W-4.
            </p>
          </div>
          <Switch checked={multipleJobs} onCheckedChange={setMultipleJobs} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="w4-dependents">Step 3 dependents ($)</Label>
            <Input id="w4-dependents" type="number" step="1" min="0" value={dependents} onChange={e => setDependents(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w4-other-income">Step 4a other income ($)</Label>
            <Input id="w4-other-income" type="number" step="1" min="0" value={otherIncome} onChange={e => setOtherIncome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w4-deductions">Step 4b deductions ($)</Label>
            <Input id="w4-deductions" type="number" step="1" min="0" value={deductions} onChange={e => setDeductions(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w4-extra">Step 4c extra/period ($)</Label>
            <Input id="w4-extra" type="number" step="0.01" min="0" value={additional} onChange={e => setAdditional(e.target.value)} />
          </div>
        </div>

        <Separator />

        {/* External calc */}
        <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Open the IRS withholding estimator with these values + an expected weekly gross of <strong>{formatCurrency(expectedGross)}</strong>. Paste the per-period amount it gives you below.
          </p>
          <a
            href="https://www.irs.gov/individuals/tax-withholding-estimator"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open IRS estimator
          </a>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="w4-computed">Per-period federal withholding ($)</Label>
          <Input id="w4-computed" type="number" step="0.01" min="0" value={computedAmount} onChange={e => setComputedAmount(e.target.value)} placeholder="0.00" />
          <p className="text-[11px] text-muted-foreground">
            Saving this updates settings.federal_withholding_per_period; the tax engine picks it up on the next stub.
          </p>
        </div>

        {grossDrifted && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Last computed against {formatCurrency(grossAtCompute)}/wk; current expected gross is {formatCurrency(expectedGross)}/wk.
              Re-run the estimator and update.
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="w4-notes">Notes (optional)</Label>
          <textarea
            id="w4-notes"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[50px]"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything to remember about this W-4 (date received, who signed, etc.)"
          />
        </div>

        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save W-4 + sync to settings'}
        </Button>
      </CardContent>
    </Card>
  )
}

interface IT2104Values {
  total_allowances: string
  filing_status: 'single_or_hoh' | 'mfj'
  additional_withholding: string
}

const IT2104_FILING_STATUSES = [
  { value: 'single_or_hoh', label: 'Single or head of household' },
  { value: 'mfj', label: 'Married filing jointly' },
]

function IT2104Card({ existing, settings, expectedGross, userId }: CardProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const initial = (existing?.form_values ?? {}) as Partial<IT2104Values>
  const [allowances, setAllowances] = useState(initial.total_allowances ?? '0')
  const [filingStatus, setFilingStatus] = useState<IT2104Values['filing_status']>(initial.filing_status ?? 'single_or_hoh')
  const [additional, setAdditional] = useState(initial.additional_withholding ?? '0')
  const [computedAmount, setComputedAmount] = useState(String(existing?.computed_amount ?? settings?.state_withholding_per_period ?? 0))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const grossAtCompute = Number(existing?.computed_against_gross ?? 0)
  const grossDrifted = !!existing?.computed_at && Math.abs(grossAtCompute - expectedGross) > 0.01

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const formValues: IT2104Values = {
      total_allowances: allowances,
      filing_status: filingStatus,
      additional_withholding: additional,
    }
    const amount = parseFloat(computedAmount || '0')

    const { error: formErr } = await supabase
      .from('withholding_forms')
      .upsert(
        {
          form_type: 'IT-2104',
          form_values: formValues,
          computed_amount: amount,
          computed_against_gross: expectedGross,
          computed_at: new Date().toISOString(),
          updated_by: userId,
          updated_at: new Date().toISOString(),
          notes: notes || null,
        },
        { onConflict: 'form_type' },
      )

    if (formErr) {
      toast.error(`Save failed: ${formErr.message}`)
      setSaving(false)
      return
    }

    if (settings?.id) {
      const { error: setErr } = await supabase
        .from('settings')
        .update({
          state_withholding_per_period: amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id)
      if (setErr) {
        toast.error(`Form saved but settings sync failed: ${setErr.message}`)
        setSaving(false)
        return
      }
    }

    toast.success('IT-2104 saved.')
    setSaving(false)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>NY IT-2104</span>
          {existing
            ? <Badge variant="outline" className="font-normal">Last saved {formatDate(existing.updated_at.slice(0, 10))}</Badge>
            : <Badge variant="outline" className="font-normal">Not yet captured</Badge>
          }
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="it-status">Filing status</Label>
          <Select value={filingStatus} onValueChange={v => v && setFilingStatus(v as IT2104Values['filing_status'])}>
            <SelectTrigger id="it-status" className="w-full">
              <SelectValue>{(value: string | null) => IT2104_FILING_STATUSES.find(s => s.value === value)?.label ?? 'Pick…'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {IT2104_FILING_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="it-allowances">Total allowances</Label>
            <Input id="it-allowances" type="number" step="1" min="0" value={allowances} onChange={e => setAllowances(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-extra">Additional/period ($)</Label>
            <Input id="it-extra" type="number" step="0.01" min="0" value={additional} onChange={e => setAdditional(e.target.value)} />
          </div>
        </div>

        <Separator />

        <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Look up her row in Pub NYS-50-T (Method I or Method II): pay frequency <strong>weekly</strong>, status <strong>{IT2104_FILING_STATUSES.find(s => s.value === filingStatus)?.label}</strong>, allowances <strong>{allowances}</strong>, gross <strong>{formatCurrency(expectedGross)}</strong>. Paste the per-period amount below.
          </p>
          <a
            href="https://www.tax.ny.gov/forms/income_cur_forms.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open NY DTF current forms (find Pub NYS-50-T)
          </a>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="it-computed">Per-period NY state withholding ($)</Label>
          <Input id="it-computed" type="number" step="0.01" min="0" value={computedAmount} onChange={e => setComputedAmount(e.target.value)} placeholder="0.00" />
          <p className="text-[11px] text-muted-foreground">
            Saving this updates settings.state_withholding_per_period; the tax engine picks it up on the next stub.
          </p>
        </div>

        {grossDrifted && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Last computed against {formatCurrency(grossAtCompute)}/wk; current expected gross is {formatCurrency(expectedGross)}/wk.
              Re-look-up Pub NYS-50-T and update.
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="it-notes">Notes (optional)</Label>
          <textarea
            id="it-notes"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[50px]"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything to remember about this IT-2104"
          />
        </div>

        <Button className="w-full" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save IT-2104 + sync to settings'}
        </Button>
      </CardContent>
    </Card>
  )
}
