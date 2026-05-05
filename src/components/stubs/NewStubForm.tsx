'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { calculateTaxes } from '@/lib/tax'
import { addDays, formatCurrency } from '@/lib/dates'
import type { Settings, Paystub, PaystubLineItem } from '@/lib/types'
import type { TaxResult, TaxRates } from '@/lib/tax'
import { toast } from 'sonner'
import { AdditionalPaySection } from './AdditionalPaySection'
import { WageBaseCaps } from './WageBaseCaps'
import {
  getLineTypeDef,
  lineItemContributesToGrossPay,
  lineItemAddsToNetPay,
  type LineItemDraft,
  type LineType,
} from '@/lib/line-items'

interface Props {
  settings: Settings | null
  employeeId: string
  lastPayPeriodEnd: string | null
  nextStubNumber: number
  ytdGrossBefore: number
  ytdPflBefore: number
  taxRates: TaxRates
  createdBy: string
  // Optional — if present, the form runs in edit mode and updates the stub
  // in place rather than inserting a new one. ytdGrossBefore / ytdPflBefore
  // must be calculated by the parent excluding the stub being edited.
  initialStub?: Paystub
  initialLineItems?: PaystubLineItem[]
}

const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const last = new Date(end + 'T12:00:00')
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

export function NewStubForm({ settings, employeeId, lastPayPeriodEnd, nextStubNumber, ytdGrossBefore, ytdPflBefore, taxRates, createdBy, initialStub, initialLineItems }: Props) {
  const router = useRouter()
  const isEdit = !!initialStub

  const suggestedStart = lastPayPeriodEnd ? addDays(lastPayPeriodEnd, 1) : ''
  const suggestedEnd = suggestedStart ? addDays(suggestedStart, 6) : ''

  const [hoursMode, setHoursMode] = useState<'total' | 'daily'>('total')
  const [hours, setHours] = useState(initialStub ? String(initialStub.hours_worked) : '')
  const [dailyHours, setDailyHours] = useState<Record<string, string>>({})
  const [rate, setRate] = useState(
    initialStub ? String(initialStub.hourly_rate) : settings?.employee_hourly_rate?.toString() ?? '',
  )
  const [periodStart, setPeriodStart] = useState(initialStub?.pay_period_start ?? suggestedStart)
  const [periodEnd, setPeriodEnd] = useState(initialStub?.pay_period_end ?? suggestedEnd)
  const [payDate, setPayDate] = useState(initialStub?.pay_date ?? suggestedEnd)
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    initialLineItems
      ? initialLineItems.map(i => ({
          id: i.id,
          line_type: i.line_type as LineType,
          label: i.label,
          amount: Number(i.amount),
          given_separately: i.given_separately,
        }))
      : [],
  )
  const [preview, setPreview] = useState<TaxResult | null>(null)
  const [saving, setSaving] = useState(false)

  const stubNumber = initialStub?.stub_number ?? nextStubNumber

  const datesInRange = useMemo(
    () => (periodStart && periodEnd ? getDatesInRange(periodStart, periodEnd) : []),
    [periodStart, periodEnd],
  )

  const dailyTotal = useMemo(
    () => datesInRange.reduce((sum, d) => sum + parseFloat(dailyHours[d] || '0'), 0),
    [datesInRange, dailyHours],
  )

  const effectiveHours = hoursMode === 'daily' ? String(dailyTotal) : hours
  const baseWages = parseFloat(effectiveHours || '0') * parseFloat(rate || '0')

  // Line items partition: taxable additions roll into the wage base; non-
  // taxable reimbursements skip taxes but still go into the employee's hand;
  // informational-only items (third-party tips) don't move money at all.
  const taxableAdditionsTotal = useMemo(
    () => lineItems.reduce((sum, item) => {
      const def = getLineTypeDef(item.line_type)
      if (!def) return sum
      const contributes = lineItemContributesToGrossPay({
        taxable_fed: def.taxable_fed,
        taxable_fica: def.taxable_fica,
        taxable_ny: def.taxable_ny,
        w2_box1: def.w2_box1,
        informational_only: def.informational_only,
      })
      return contributes ? sum + (Number(item.amount) || 0) : sum
    }, 0),
    [lineItems],
  )

  const nonTaxableAdditionsTotal = useMemo(
    () => lineItems.reduce((sum, item) => {
      const def = getLineTypeDef(item.line_type)
      if (!def) return sum
      const contributes = lineItemContributesToGrossPay({
        taxable_fed: def.taxable_fed,
        taxable_fica: def.taxable_fica,
        taxable_ny: def.taxable_ny,
        w2_box1: def.w2_box1,
        informational_only: def.informational_only,
      })
      const addsToNet = lineItemAddsToNetPay({ informational_only: def.informational_only })
      return !contributes && addsToNet ? sum + (Number(item.amount) || 0) : sum
    }, 0),
    [lineItems],
  )

  const gross = baseWages + taxableAdditionsTotal

  function updateDailyHours(date: string, value: string) {
    setDailyHours(prev => ({ ...prev, [date]: value }))
    setPreview(null)
  }

  function handlePeriodStartChange(val: string) {
    setPeriodStart(val)
    setDailyHours({})
    setPreview(null)
  }

  function handlePeriodEndChange(val: string) {
    setPeriodEnd(val)
    setDailyHours({})
    setPreview(null)
  }

  function updateLineItems(items: LineItemDraft[]) {
    setLineItems(items)
    setPreview(null)
  }

  function toggleMode() {
    if (hoursMode === 'total') {
      setHoursMode('daily')
      setHours('')
    } else {
      setHoursMode('total')
      setHours(dailyTotal > 0 ? String(dailyTotal) : '')
      setDailyHours({})
    }
    setPreview(null)
  }

  function generatePreview() {
    if (!settings) return
    const calc = calculateTaxes({
      gross,
      ytdGrossBefore,
      ytdPflBefore,
      federalWithholding: Number(settings.federal_withholding_per_period),
      stateWithholding: Number(settings.state_withholding_per_period),
      pflWaived: settings.pfl_waived,
      sutaRate: Number(settings.suta_rate),
    }, taxRates)
    setPreview(calc)
  }

  async function saveStub() {
    if (!preview || !employeeId) return
    setSaving(true)

    const supabase = createClient()
    const finalNetPay = Math.round((preview.net_pay + nonTaxableAdditionsTotal) * 100) / 100

    const stubFields = {
      pay_period_start: periodStart,
      pay_period_end: periodEnd,
      pay_date: payDate,
      hours_worked: parseFloat(effectiveHours || '0'),
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
      net_pay: finalNetPay,
    }

    let stubId: string

    if (isEdit && initialStub) {
      const { error } = await supabase
        .from('paystubs')
        .update(stubFields)
        .eq('id', initialStub.id)
      if (error) {
        toast.error('Failed to update stub. Please try again.')
        setSaving(false)
        return
      }
      stubId = initialStub.id

      // Replace line items wholesale — DELETE old, INSERT new. Each operation
      // emits a row in audit_log for the forensic record.
      const { error: delError } = await supabase
        .from('paystub_line_items')
        .delete()
        .eq('paystub_id', stubId)
      if (delError) {
        toast.error('Stub updated but line item replace failed.')
        setSaving(false)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('paystubs')
        .insert({
          ...stubFields,
          stub_number: nextStubNumber,
          employee_id: employeeId,
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
      stubId = data.id
    }

    // Drop any line items the admin started but didn't finish picking a type for.
    const completedLineItems = lineItems.filter(i => i.line_type && getLineTypeDef(i.line_type))

    if (completedLineItems.length > 0) {
      const rows = completedLineItems.map((item, index) => {
        const def = getLineTypeDef(item.line_type)!
        return {
          paystub_id: stubId,
          line_type: item.line_type,
          label: item.label,
          amount: item.amount,
          taxable_fed: def.taxable_fed,
          taxable_fica: def.taxable_fica,
          taxable_ny: def.taxable_ny,
          w2_box1: def.w2_box1,
          informational_only: def.informational_only,
          // Informational items are tracked but never affect any money flow.
          given_separately: def.informational_only ? false : item.given_separately,
          sort_order: index,
        }
      })
      const { error: lineError } = await supabase.from('paystub_line_items').insert(rows)
      if (lineError) {
        toast.error('Stub saved, but line items failed. Edit the stub to retry.')
        router.push(`/stubs/${stubId}`)
        return
      }
    }

    router.push(`/stubs/${stubId}`)
  }

  const canSwitchToDailyMode = !!periodStart && !!periodEnd
  const canPreview = hoursMode === 'daily'
    ? (!!rate && !!periodStart && !!periodEnd && !!payDate)
    : (!!hours && !!rate && !!periodStart && !!periodEnd && !!payDate)
  const pflLabel = settings?.pfl_waived ? null : 'NY PFL'

  return (
    <div className="space-y-5">
      <WageBaseCaps ytdGrossBefore={ytdGrossBefore} taxRates={taxRates} />

      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Hours Worked */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="hours">Hours Worked</Label>
              {canSwitchToDailyMode && (
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  {hoursMode === 'daily' ? 'Enter total instead' : 'Enter by day'}
                </button>
              )}
            </div>

            {hoursMode === 'total' ? (
              <Input
                id="hours"
                type="number"
                min="0"
                step="0.25"
                value={hours}
                onChange={e => { setHours(e.target.value); setPreview(null) }}
                placeholder="40"
              />
            ) : (
              <div className="rounded-md border p-3 space-y-2">
                {datesInRange.map(dateStr => {
                  const d = new Date(dateStr + 'T12:00:00')
                  return (
                    <div key={dateStr} className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground w-16 flex-shrink-0">
                        {DAY_ABBRS[d.getDay()]} {d.getMonth() + 1}/{d.getDate()}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max="24"
                        step="0.25"
                        value={dailyHours[dateStr] ?? ''}
                        onChange={e => updateDailyHours(dateStr, e.target.value)}
                        placeholder="0"
                        className="h-8 w-20 text-right"
                      />
                      <span className="text-xs text-muted-foreground">hrs</span>
                    </div>
                  )
                })}
                <Separator />
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium w-16 flex-shrink-0">Total</span>
                  <span className="text-sm font-medium">{dailyTotal} hrs</span>
                </div>
              </div>
            )}
          </div>

          {/* Hourly Rate */}
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

          {/* Dates */}
          <div className="space-y-1.5">
            <Label htmlFor="period-start">Pay Period Start</Label>
            <Input
              id="period-start"
              type="date"
              value={periodStart}
              onChange={e => handlePeriodStartChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="period-end">Pay Period End</Label>
            <Input
              id="period-end"
              type="date"
              value={periodEnd}
              onChange={e => handlePeriodEndChange(e.target.value)}
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

      <AdditionalPaySection
        items={lineItems}
        onChange={updateLineItems}
        irsMileageRate={Number(taxRates.irs_mileage_rate)}
      />

      <Button
        className="w-full"
        variant="secondary"
        disabled={!canPreview}
        onClick={generatePreview}
      >
        Preview Stub
      </Button>

      {preview && (() => {
        const taxableLineItems = lineItems.filter(i => {
          const def = getLineTypeDef(i.line_type)
          return def && lineItemContributesToGrossPay(def)
        })
        const nonTaxableLineItems = lineItems.filter(i => {
          const def = getLineTypeDef(i.line_type)
          if (!def) return false
          return !lineItemContributesToGrossPay(def) && lineItemAddsToNetPay(def)
        })
        const informationalLineItems = lineItems.filter(i => {
          const def = getLineTypeDef(i.line_type)
          return def?.informational_only
        })
        const givenSeparatelyItems = lineItems.filter(i => {
          const def = getLineTypeDef(i.line_type)
          return def && !def.informational_only && i.given_separately
        })
        const givenSeparatelyTotal = givenSeparatelyItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)
        const finalNet = preview.net_pay + nonTaxableAdditionsTotal
        const cashToZelle = Math.round((finalNet - givenSeparatelyTotal) * 100) / 100

        return (
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm">Stub #{stubNumber} {isEdit ? 'Updated' : 'Preview'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              <p className="text-xs text-muted-foreground font-medium">Earnings</p>
              <div className="flex justify-between text-sm">
                <span>
                  {parseFloat(effectiveHours) === 0
                    ? 'No Hours — Week Off'
                    : `${effectiveHours} hrs × ${formatCurrency(parseFloat(rate))}`}
                </span>
                <span>{formatCurrency(baseWages)}</span>
              </div>
              {taxableLineItems.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>{item.label}</span>
                  <span>{formatCurrency(item.amount)}</span>
                </div>
              ))}
              {taxableLineItems.length > 0 && (
                <div className="flex justify-between text-sm font-medium pt-1 border-t">
                  <span>Gross taxable wages</span>
                  <span>{formatCurrency(preview.gross_pay)}</span>
                </div>
              )}
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

              {nonTaxableLineItems.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground font-medium">Non-taxable Reimbursements</p>
                  {nonTaxableLineItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.label}</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </>
              )}

              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>Net Pay</span>
                <span>{formatCurrency(finalNet)}</span>
              </div>

              {givenSeparatelyItems.length > 0 && (
                <>
                  <p className="text-[11px] text-muted-foreground">Already given (not in Zelle)</p>
                  {givenSeparatelyItems.map(item => (
                    <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.label}</span>
                      <span>−{formatCurrency(Number(item.amount))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                    <span>Cash to Zelle</span>
                    <span>{formatCurrency(cashToZelle)}</span>
                  </div>
                </>
              )}

              {informationalLineItems.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground font-medium">Informational (not paid)</p>
                  {informationalLineItems.map(item => (
                    <div key={item.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.label}</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </>
              )}

              <Separator />
              <p className="text-xs text-muted-foreground font-medium">Employer Taxes (not withheld)</p>
              <Row label="Employer FICA – SS" value={preview.employer_fica_ss} />
              <Row label="Employer FICA – Medicare" value={preview.employer_fica_medicare} />
              <Row label="FUTA" value={preview.futa} />
              <Row label="SUTA" value={preview.suta} />
            </CardContent>
          </Card>
        )
      })()}

      {preview && (
        <Button className="w-full" disabled={saving} onClick={saveStub}>
          {saving ? 'Saving…' : isEdit ? 'Update Stub' : 'Save Stub'}
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
