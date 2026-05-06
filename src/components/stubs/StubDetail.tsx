'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { formatDate, formatDateRange, formatCurrency } from '@/lib/dates'
import { toast } from 'sonner'
import { Download, Mail, Trash2, CheckCircle2, Pencil } from 'lucide-react'
import type { PaystubWithYTD, Settings, Role, PaystubLineItem } from '@/lib/types'

interface Props {
  stub: PaystubWithYTD
  role: Role
  settings: Settings | null
  lineItems?: PaystubLineItem[]
  ytdByLineType?: Record<string, number>
}

export function StubDetail({ stub, role, settings, lineItems = [], ytdByLineType = {} }: Props) {
  const taxableLineItems = lineItems.filter(i =>
    !i.informational_only && (i.taxable_fed || i.taxable_fica || i.taxable_ny || i.w2_box1)
  )
  const reimbursementLineItems = lineItems.filter(i =>
    !i.informational_only && !i.taxable_fed && !i.taxable_fica && !i.taxable_ny && !i.w2_box1
  )
  const informationalLineItems = lineItems.filter(i => i.informational_only)
  const givenSeparatelyItems = lineItems.filter(i => !i.informational_only && i.given_separately)
  const givenSeparatelyTotal = givenSeparatelyItems.reduce((sum, i) => sum + Number(i.amount), 0)
  const cashToZelle = Math.round((Number(stub.net_pay) - givenSeparatelyTotal) * 100) / 100

  const overtimeHours = Number(stub.overtime_hours ?? 0)
  const regularHours = Math.max(0, Number(stub.hours_worked) - overtimeHours)
  const hourlyRate = Number(stub.hourly_rate)
  const regularPay = regularHours * hourlyRate
  const overtimePay = overtimeHours * hourlyRate * 1.5
  const reasonLabels: Record<string, string> = {
    week_off: 'Week off',
    sick_unpaid: 'Sick — unpaid',
    vacation_unpaid: 'Vacation — unpaid',
    holiday_unpaid: 'Holiday — unpaid',
    other: 'Other',
  }
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [paymentDialog, setPaymentDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [zelleId, setZelleId] = useState(stub.zelle_transaction_id ?? '')
  const [emailPending, setEmailPending] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false)
  const [deletePending, setDeletePending] = useState(false)

  const isAdmin = role === 'admin'
  const pflWaived = settings?.pfl_waived ?? false

  async function markPaymentSent() {
    setPaymentPending(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('paystubs')
      .update({ payment_sent: true, zelle_transaction_id: zelleId || null })
      .eq('id', stub.id)

    if (error) {
      toast.error('Failed to update payment status.')
    } else {
      toast.success('Payment marked as sent.')
      setPaymentDialog(false)
      startTransition(() => router.refresh())
    }
    setPaymentPending(false)
  }

  async function emailStub() {
    setEmailPending(true)
    const res = await fetch('/api/email/stub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stubId: stub.id }),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const json = await res.json()
        detail = json?.error ? `: ${json.error}` : ''
      } catch { /* ignore */ }
      toast.error(`Failed to send email${detail}`)
    } else {
      toast.success('Pay stub emailed successfully.')
      startTransition(() => router.refresh())
    }
    setEmailPending(false)
  }

  async function deleteStub() {
    setDeletePending(true)
    const supabase = createClient()
    const { error } = await supabase.from('paystubs').delete().eq('id', stub.id)
    if (error) {
      toast.error('Failed to delete stub.')
      setDeletePending(false)
    } else {
      toast.success('Stub deleted.')
      router.push('/stubs')
    }
  }

  function downloadPDF() {
    const variant = isAdmin ? 'admin' : 'employee'
    window.open(`/api/pdf/stub?id=${stub.id}&variant=${variant}`, '_blank')
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stub #{stub.stub_number}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(stub.pay_period_start, stub.pay_period_end)}
          </p>
          <p className="text-xs text-muted-foreground">Pay date: {formatDate(stub.pay_date)}</p>
        </div>
        {isAdmin && (
          <div className="flex flex-col items-end gap-1">
            <Badge variant={stub.payment_sent ? 'default' : 'secondary'}>
              {stub.payment_sent ? 'Paid' : 'Unpaid'}
            </Badge>
            <Badge variant={stub.stub_sent ? 'default' : 'outline'}>
              {stub.stub_sent ? 'Emailed' : 'Not emailed'}
            </Badge>
          </div>
        )}
      </div>

      {/* Earnings */}
      <Card>
        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Earnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          <div className="grid grid-cols-3 text-xs text-muted-foreground pb-1">
            <span>Description</span><span className="text-right">Current</span><span className="text-right">YTD</span>
          </div>
          {stub.hours_worked === 0 && taxableLineItems.length === 0 ? (
            <>
              <div className="grid grid-cols-3 text-sm">
                <span>No Hours{stub.reason ? ` — ${reasonLabels[stub.reason] ?? stub.reason}` : ''}</span>
                <span className="text-right">{formatCurrency(0)}</span>
                <span className="text-right">{formatCurrency(stub.ytd_gross)}</span>
              </div>
              {Number(stub.sick_hours) > 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  Sick hours used: {Number(stub.sick_hours)}
                </p>
              )}
            </>
          ) : (
            <>
              {regularHours > 0 && (
                <div className="grid grid-cols-3 text-sm">
                  <span>Regular ({regularHours}h @ {formatCurrency(hourlyRate)})</span>
                  <span className="text-right">{formatCurrency(regularPay)}</span>
                  <span className="text-right">{formatCurrency(stub.ytd_regular_wages)}</span>
                </div>
              )}
              {overtimeHours > 0 && (
                <div className="grid grid-cols-3 text-sm">
                  <span>Overtime ({overtimeHours}h @ {formatCurrency(hourlyRate * 1.5)} · 1.5×)</span>
                  <span className="text-right">{formatCurrency(overtimePay)}</span>
                  <span className="text-right">—</span>
                </div>
              )}
              {taxableLineItems.map(item => (
                <div key={item.id} className="grid grid-cols-3 text-sm">
                  <span>{item.label}</span>
                  <span className="text-right">{formatCurrency(Number(item.amount))}</span>
                  <span className="text-right">{formatCurrency(ytdByLineType[item.line_type] ?? Number(item.amount))}</span>
                </div>
              ))}
              {(taxableLineItems.length > 0 || overtimeHours > 0) && (
                <div className="grid grid-cols-3 text-sm font-medium border-t pt-1">
                  <span>Gross taxable wages</span>
                  <span className="text-right">{formatCurrency(Number(stub.gross_pay))}</span>
                  <span className="text-right">{formatCurrency(stub.ytd_gross)}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardHeader className="pb-1 pt-4">
          <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Employee Deductions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          <div className="grid grid-cols-3 text-xs text-muted-foreground pb-1">
            <span>Description</span><span className="text-right">Current</span><span className="text-right">YTD</span>
          </div>
          <TaxRow label="Federal Withholding" current={Number(stub.federal_withholding)} ytd={stub.ytd_federal_withholding} />
          <TaxRow label="FICA – Social Security" current={Number(stub.fica_social_security)} ytd={stub.ytd_fica_social_security} />
          <TaxRow label="FICA – Medicare" current={Number(stub.fica_medicare)} ytd={stub.ytd_fica_medicare} />
          <TaxRow label="NY State Withholding" current={Number(stub.state_withholding)} ytd={stub.ytd_state_withholding} />
          <TaxRow label="NY SDI" current={Number(stub.sdi)} ytd={stub.ytd_sdi} />
          {!pflWaived && <TaxRow label="NY PFL" current={Number(stub.pfl)} ytd={stub.ytd_pfl} />}
          <Separator />
          <div className="grid grid-cols-3 text-sm font-semibold">
            <span>Net Pay</span>
            <span className="text-right">{formatCurrency(Number(stub.net_pay))}</span>
            <span className="text-right">{formatCurrency(stub.ytd_net_pay)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Cash to Zelle — only when something was given outside the regular payment */}
      {givenSeparatelyItems.length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <div className="flex justify-between text-sm">
              <span>Net Pay (total compensation)</span>
              <span>{formatCurrency(Number(stub.net_pay))}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">Already given (not in Zelle)</p>
            {givenSeparatelyItems.map(item => (
              <div key={item.id} className="flex justify-between text-sm text-muted-foreground">
                <span>{item.label}</span>
                <span>−{formatCurrency(Number(item.amount))}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Cash to Zelle</span>
              <span>{formatCurrency(cashToZelle)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-taxable reimbursements */}
      {reimbursementLineItems.length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Non-taxable Reimbursements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <div className="grid grid-cols-3 text-xs text-muted-foreground pb-1">
              <span>Description</span><span className="text-right">Current</span><span className="text-right">YTD</span>
            </div>
            {reimbursementLineItems.map(item => (
              <div key={item.id} className="grid grid-cols-3 text-sm">
                <span>{item.label}</span>
                <span className="text-right">{formatCurrency(Number(item.amount))}</span>
                <span className="text-right">{formatCurrency(ytdByLineType[item.line_type] ?? Number(item.amount))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Informational only — admin only */}
      {isAdmin && informationalLineItems.length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Informational (not paid)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <div className="grid grid-cols-3 text-xs text-muted-foreground pb-1">
              <span>Description</span><span className="text-right">Current</span><span className="text-right">YTD</span>
            </div>
            {informationalLineItems.map(item => (
              <div key={item.id} className="grid grid-cols-3 text-xs text-muted-foreground">
                <span>{item.label}</span>
                <span className="text-right">{formatCurrency(Number(item.amount))}</span>
                <span className="text-right">{formatCurrency(ytdByLineType[item.line_type] ?? Number(item.amount))}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Employer taxes — admin only */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs text-muted-foreground uppercase tracking-wide">Employer Taxes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            <div className="grid grid-cols-3 text-xs text-muted-foreground pb-1">
              <span>Description</span><span className="text-right">Current</span><span className="text-right">YTD</span>
            </div>
            <TaxRow label="Employer FICA – SS" current={Number(stub.employer_fica_ss)} ytd={stub.ytd_employer_fica_ss} />
            <TaxRow label="Employer FICA – Medicare" current={Number(stub.employer_fica_medicare)} ytd={stub.ytd_employer_fica_medicare} />
            <TaxRow label="FUTA" current={Number(stub.futa)} ytd={stub.ytd_futa} />
            <TaxRow label="SUTA" current={Number(stub.suta)} ytd={stub.ytd_suta} />
          </CardContent>
        </Card>
      )}

      {/* Admin: Zelle transaction ID */}
      {isAdmin && stub.zelle_transaction_id && (
        <p className="text-xs text-muted-foreground">Zelle ID: {stub.zelle_transaction_id}</p>
      )}

      {/* Action buttons */}
      <div className="space-y-2 pt-2">
        <Button variant="outline" className="w-full" onClick={downloadPDF}>
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>

        {isAdmin && (
          <>
            {!stub.payment_sent && (
              <>
                <Link
                  href={`/stubs/${stub.id}/edit`}
                  className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Stub
                </Link>
                <Button className="w-full" onClick={() => setPaymentDialog(true)}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark Payment Sent
                </Button>
              </>
            )}

            {stub.payment_sent && !stub.stub_sent && (
              <Button className="w-full" disabled={emailPending} onClick={emailStub}>
                <Mail className="h-4 w-4 mr-2" />
                {emailPending ? 'Sending…' : 'Email Paystub'}
              </Button>
            )}

            {stub.payment_sent && stub.stub_sent && (
              <Button variant="outline" className="w-full" disabled={emailPending} onClick={emailStub}>
                <Mail className="h-4 w-4 mr-2" />
                {emailPending ? 'Sending…' : 'Resend Email'}
              </Button>
            )}

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Stub
            </Button>
          </>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Payment Sent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Enter the Zelle transaction ID after sending payment to confirm.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="zelle-id">Zelle Transaction ID (optional)</Label>
              <Input
                id="zelle-id"
                value={zelleId}
                onChange={e => setZelleId(e.target.value)}
                placeholder="e.g. ZELLE123456"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
            <Button disabled={paymentPending} onClick={markPaymentSent}>
              {paymentPending ? 'Saving…' : 'Confirm Payment Sent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Stub #{stub.stub_number}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This cannot be undone. Stub numbers are never reused.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deletePending} onClick={deleteStub}>
              {deletePending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TaxRow({ label, current, ytd }: { label: string; current: number; ytd: number }) {
  return (
    <div className="grid grid-cols-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{formatCurrency(current)}</span>
      <span className="text-right">{formatCurrency(ytd)}</span>
    </div>
  )
}
