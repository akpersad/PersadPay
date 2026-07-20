'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, todayNY } from '@/lib/dates'
import { toast } from 'sonner'
import { Scale, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { CurrencyInput } from '@/components/ui/currency-input'

interface Props {
  expectedBalance: number
  actualBalance: number | null
  actualBalanceAt: string | null
  userId: string
  collapsible?: boolean
}

export function ReconcileForm({ expectedBalance, actualBalance, actualBalanceAt, userId, collapsible }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(!collapsible)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [correcting, setCorrecting] = useState(false)

  const today = todayNY()
  const [inputBalance, setInputBalance] = useState(actualBalance ?? 0)
  const [inputDate, setInputDate] = useState(actualBalanceAt ? actualBalanceAt.slice(0, 10) : today)

  const discrepancy = actualBalance !== null
    ? Math.round((actualBalance - expectedBalance) * 100) / 100
    : null

  async function saveReconcile() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('settings')
      .update({ hysa_actual_balance: inputBalance, hysa_actual_balance_at: inputDate })
      .eq('id', (await supabase.from('settings').select('id').single()).data?.id)

    if (error) {
      toast.error('Failed to save balance.')
      setSaving(false)
      return
    }
    toast.success('Balance recorded.')
    setSaving(false)
    setEditing(false)
    startTransition(() => router.refresh())
  }

  async function recordCorrection() {
    if (discrepancy === null || discrepancy === 0) return
    setCorrecting(true)
    const supabase = createClient()
    const { error } = await supabase.from('hysa_transactions').insert({
      transaction_type: 'balance_correction',
      amount: discrepancy,
      effective_date: actualBalanceAt ? actualBalanceAt.slice(0, 10) : today,
      notes: `Reconciliation correction: actual balance ${formatCurrency(actualBalance!)} vs expected ${formatCurrency(expectedBalance)}`,
      actor_id: userId,
    })
    if (error) {
      toast.error('Failed to record correction.')
      setCorrecting(false)
      return
    }
    toast.success('Balance correction recorded.')
    setCorrecting(false)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle
          className={`text-sm flex items-center justify-between gap-2 ${collapsible ? 'cursor-pointer select-none' : ''}`}
          onClick={collapsible ? () => setOpen(v => !v) : undefined}
        >
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Reconciliation
          </span>
          {collapsible && (
            open
              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="pb-4 space-y-3">
          {discrepancy !== null && !editing && (
            <div className={`rounded-md px-3 py-2 text-sm flex items-start gap-2 ${
              discrepancy === 0
                ? 'bg-green-50 border border-green-200 text-green-900'
                : 'bg-yellow-50 border border-yellow-200 text-yellow-900'
            }`}>
              {discrepancy === 0
                ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              }
              <div>
                {discrepancy === 0 ? (
                  <p className="font-medium">Balanced: actual matches expected</p>
                ) : (
                  <>
                    <p className="font-medium">
                      Discrepancy of {formatCurrency(Math.abs(discrepancy))}{' '}
                      ({discrepancy > 0 ? 'bank shows more' : 'bank shows less'})
                    </p>
                    <p className="text-xs mt-0.5">
                      Likely cause: accrued interest, bank fee, or unrecorded transaction.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-xs"
                      disabled={correcting}
                      onClick={recordCorrection}
                    >
                      {correcting ? 'Recording…' : `Record correction of ${formatCurrency(discrepancy)}`}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {!editing && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {actualBalance !== null
                  ? `Actual: ${formatCurrency(actualBalance)} as of ${actualBalanceAt ? formatDate(actualBalanceAt.slice(0, 10)) : '—'}`
                  : 'No balance entered yet'}
              </span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
                {actualBalance !== null ? 'Update' : 'Enter balance'}
              </Button>
            </div>
          )}

          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="actual-balance">Actual HYSA balance</Label>
                <CurrencyInput id="actual-balance" value={inputBalance} onChange={setInputBalance} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="balance-date">As of</Label>
                <Input
                  id="balance-date"
                  type="date"
                  value={inputDate}
                  onChange={e => setInputDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                <Button className="flex-1" disabled={saving} onClick={saveReconcile}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Ledger balance: <span className="font-mono font-medium text-foreground">{formatCurrency(expectedBalance)}</span>
            {' '}(computed from all ledger entries)
          </div>

          {discrepancy === null && (
            <Badge variant="outline" className="text-xs">Not yet reconciled</Badge>
          )}
        </CardContent>
      )}
    </Card>
  )
}
