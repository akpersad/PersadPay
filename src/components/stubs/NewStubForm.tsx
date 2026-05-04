'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { calculateTaxes } from '@/lib/tax'
import { addDays, formatCurrency } from '@/lib/dates'
import type { Settings } from '@/lib/types'
import type { TaxResult } from '@/lib/tax'
import { toast } from 'sonner'

interface Props {
  settings: Settings | null
  employeeId: string
  lastPayPeriodEnd: string | null
  nextStubNumber: number
  ytdGrossBefore: number
  createdBy: string
}

export function NewStubForm({ settings, employeeId, lastPayPeriodEnd, nextStubNumber, ytdGrossBefore, createdBy }: Props) {
  const router = useRouter()

  const suggestedStart = lastPayPeriodEnd ? addDays(lastPayPeriodEnd, 1) : ''
  const suggestedEnd = suggestedStart ? addDays(suggestedStart, 6) : ''

  const [hours, setHours] = useState('')
  const [rate, setRate] = useState(settings?.employee_hourly_rate?.toString() ?? '')
  const [periodStart, setPeriodStart] = useState(suggestedStart)
  const [periodEnd, setPeriodEnd] = useState(suggestedEnd)
  const [payDate, setPayDate] = useState(suggestedEnd)
  const [preview, setPreview] = useState<TaxResult | null>(null)
  const [saving, setSaving] = useState(false)

  const gross = parseFloat(hours || '0') * parseFloat(rate || '0')

  function generatePreview() {
    if (!settings) return
    const calc = calculateTaxes({
      gross,
      ytdGrossBefore,
      federalWithholding: Number(settings.federal_withholding_per_period),
      stateWithholding: Number(settings.state_withholding_per_period),
      pflWaived: settings.pfl_waived,
      sutaRate: Number(settings.suta_rate),
    })
    setPreview(calc)
  }

  async function saveStub() {
    if (!preview || !employeeId) return
    setSaving(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('paystubs')
      .insert({
        stub_number: nextStubNumber,
        employee_id: employeeId,
        pay_period_start: periodStart,
        pay_period_end: periodEnd,
        pay_date: payDate,
        hours_worked: parseFloat(hours || '0'),
        hourly_rate: parseFloat(rate),
        gross_pay: preview.gross_pay,
        federal_withholding: preview.federal_withholding,
        fica_social_security: preview.fica_social_security,
        fica_medicare: preview.fica_medicare,
        state_withholding: preview.state_withholding,
        sdi: preview.sdi,
        pfl: preview.pfl,
        employer_fica_ss: preview.employer_fica_ss,
        employer_fica_medicare: preview.employer_fica_medicare,
        futa: preview.futa,
        suta: preview.suta,
        net_pay: preview.net_pay,
        payment_sent: false,
        stub_sent: false,
        created_by: createdBy,
      })
      .select('id')
      .single()

    if (error || !data) {
      toast.error('Failed to save stub. Please try again.')
      setSaving(false)
      return
    }

    router.push(`/stubs/${data.id}`)
  }

  const canPreview = !!hours && !!rate && !!periodStart && !!periodEnd && !!payDate
  const pflLabel = settings?.pfl_waived ? null : 'NY PFL'

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="hours">Hours Worked</Label>
              <Input
                id="hours"
                type="number"
                min="0"
                step="0.25"
                value={hours}
                onChange={e => { setHours(e.target.value); setPreview(null) }}
                placeholder="40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">Hourly Rate ($)</Label>
              <Input
                id="rate"
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={e => { setRate(e.target.value); setPreview(null) }}
                placeholder="20.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="period-start">Pay Period Start</Label>
            <Input
              id="period-start"
              type="date"
              value={periodStart}
              onChange={e => { setPeriodStart(e.target.value); setPreview(null) }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="period-end">Pay Period End</Label>
            <Input
              id="period-end"
              type="date"
              value={periodEnd}
              onChange={e => { setPeriodEnd(e.target.value); setPreview(null) }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Pay Date</Label>
            <Input
              id="pay-date"
              type="date"
              value={payDate}
              onChange={e => { setPayDate(e.target.value); setPreview(null) }}
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        variant="secondary"
        disabled={!canPreview}
        onClick={generatePreview}
      >
        Preview Stub
      </Button>

      {preview && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm">Stub #{nextStubNumber} Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            <div className="flex justify-between text-sm">
              <span>
                {parseFloat(hours) === 0
                  ? 'No Hours — Week Off'
                  : `${hours} hrs × ${formatCurrency(parseFloat(rate))}`}
              </span>
              <span className="font-medium">{formatCurrency(preview.gross_pay)}</span>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground font-medium">Employee Deductions</p>
            {preview.federal_withholding > 0 && (
              <Row label="Federal Withholding" value={preview.federal_withholding} />
            )}
            <Row label="FICA – Social Security" value={preview.fica_social_security} />
            <Row label="FICA – Medicare" value={preview.fica_medicare} />
            {preview.state_withholding > 0 && (
              <Row label="NY State Withholding" value={preview.state_withholding} />
            )}
            <Row label="NY SDI" value={preview.sdi} />
            {pflLabel && <Row label={pflLabel} value={preview.pfl} />}
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Net Pay</span>
              <span>{formatCurrency(preview.net_pay)}</span>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground font-medium">Employer Taxes (not withheld)</p>
            <Row label="Employer FICA – SS" value={preview.employer_fica_ss} />
            <Row label="Employer FICA – Medicare" value={preview.employer_fica_medicare} />
            <Row label="FUTA" value={preview.futa} />
            <Row label="SUTA" value={preview.suta} />
          </CardContent>
        </Card>
      )}

      {preview && (
        <Button className="w-full" disabled={saving} onClick={saveStub}>
          {saving ? 'Saving…' : 'Save Stub'}
        </Button>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  )
}
