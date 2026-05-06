'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

type TxType = 'deposit_manual' | 'withdrawal_manual' | 'balance_correction'

const TX_TYPE_LABELS: Record<TxType, string> = {
  deposit_manual: 'Deposit',
  withdrawal_manual: 'Withdrawal',
  balance_correction: 'Balance correction',
}

export function AddTransactionDialog({ userId }: { userId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const [txType, setTxType] = useState<TxType>('deposit_manual')
  const [amount, setAmount] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(today)
  const [notes, setNotes] = useState('')

  function reset() {
    setTxType('deposit_manual')
    setAmount('')
    setEffectiveDate(today)
    setNotes('')
  }

  async function save() {
    const raw = parseFloat(amount)
    if (isNaN(raw) || raw === 0) {
      toast.error('Enter a non-zero amount.')
      return
    }
    if (!effectiveDate) {
      toast.error('Enter an effective date.')
      return
    }

    // Enforce sign: deposits positive, withdrawals negative, corrections either
    let signed = Math.abs(raw)
    if (txType === 'withdrawal_manual') signed = -signed
    if (txType === 'balance_correction' && raw < 0) signed = -Math.abs(raw)

    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('hysa_transactions').insert({
      transaction_type: txType,
      amount: signed,
      effective_date: effectiveDate,
      notes: notes || null,
      actor_id: userId,
    })

    if (error) {
      toast.error('Failed to save transaction.')
      setSaving(false)
      return
    }

    toast.success('Transaction recorded.')
    setSaving(false)
    setOpen(false)
    reset()
    startTransition(() => router.refresh())
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add Transaction
      </Button>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Transaction</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={txType} onValueChange={v => setTxType(v as TxType)}>
                <SelectTrigger>
                  <span className="flex-1 text-left text-sm">{TX_TYPE_LABELS[txType]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit_manual">Deposit</SelectItem>
                  <SelectItem value="withdrawal_manual">Withdrawal</SelectItem>
                  <SelectItem value="balance_correction">Balance correction</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">
                Amount{txType === 'balance_correction' ? ' (use – for a negative correction)' : ''}
              </Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Effective date</Label>
              <Input
                id="tx-date"
                type="date"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tx-notes">Notes (optional)</Label>
              <textarea
                id="tx-notes"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px]"
                placeholder="e.g. Bank credited interest, rounding deposit"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
