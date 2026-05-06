'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/dates'
import { upsertHysaWithdrawalForFiling, deleteHysaWithdrawalForFiling } from '@/lib/hysa'
import type { Filing } from '@/lib/types'

interface Props {
  existing: Filing | null
  filingType: 'NYS-45' | 'Schedule H' | 'Federal Estimated Tax'
  taxYear: number
  quarter: number | null
  createdBy: string
  // When provided, a withdrawal_filing HYSA transaction is automatically
  // created/updated/deleted in sync with the filed_on state.
  computedAmount?: number
}

export function MarkFiledForm({ existing, filingType, taxYear, quarter, createdBy, computedAmount }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  const [editing, setEditing] = useState(!existing)
  const [filedOn, setFiledOn] = useState(existing?.filed_on ?? today)
  const [confirmation, setConfirmation] = useState(existing?.confirmation ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()

    const payload = {
      filing_type: filingType,
      tax_year: taxYear,
      quarter,
      filed_on: filedOn || null,
      confirmation: confirmation || null,
      notes: notes || null,
      created_by: createdBy,
    }

    let filingId = existing?.id
    if (existing) {
      const { error } = await supabase.from('filings').update(payload).eq('id', existing.id)
      if (error) {
        toast.error('Failed to save filing.')
        setSaving(false)
        return
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('filings')
        .insert(payload)
        .select('id')
        .single()
      if (error) {
        toast.error('Failed to save filing.')
        setSaving(false)
        return
      }
      filingId = inserted?.id
    }

    // Sync the HYSA withdrawal transaction when an amount is provided
    if (computedAmount !== undefined && filingId) {
      if (filedOn) {
        await upsertHysaWithdrawalForFiling(supabase, filingId, computedAmount, filedOn, createdBy)
      } else {
        await deleteHysaWithdrawalForFiling(supabase, filingId)
      }
    }

    toast.success(existing ? 'Filing updated.' : 'Filing recorded.')
    setEditing(false)
    setSaving(false)
    startTransition(() => router.refresh())
  }

  if (existing && !editing) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Filed
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-1.5 text-sm">
          <Row label="Filed on" value={existing.filed_on ? formatDate(existing.filed_on) : '—'} />
          {existing.confirmation && <Row label="Confirmation #" value={existing.confirmation} />}
          {existing.notes && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{existing.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          {existing ? (
            <>
              <Badge variant="secondary">Editing filed record</Badge>
            </>
          ) : (
            <span>Mark as filed</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="filed-on">Filed on</Label>
          <Input
            id="filed-on"
            type="date"
            value={filedOn}
            onChange={e => setFiledOn(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmation">Confirmation # (optional)</Label>
          <Input
            id="confirmation"
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            placeholder="e.g. NYS-45 confirmation, e-file ID"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <textarea
            id="notes"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px]"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Anything to remember about this filing"
          />
        </div>
        <div className="flex gap-2 pt-1">
          {existing && (
            <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
          <Button className="flex-1" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : existing ? 'Update' : 'Mark filed'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
