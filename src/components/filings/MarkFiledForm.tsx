'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, MinusCircle, Pencil } from 'lucide-react'
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

type StatusChoice = 'filed' | 'na'

export function MarkFiledForm({ existing, filingType, taxYear, quarter, createdBy, computedAmount }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const today = new Date().toISOString().slice(0, 10)
  // Initial mode: display if the row already has a resolved status (filed or N/A),
  // otherwise edit so the admin can pick one.
  const hasResolvedStatus = !!(existing?.filed_on || existing?.not_applicable)
  const [editing, setEditing] = useState(!hasResolvedStatus)
  const [statusChoice, setStatusChoice] = useState<StatusChoice>(
    existing?.not_applicable ? 'na' : 'filed',
  )

  const [filedOn, setFiledOn] = useState(existing?.filed_on ?? today)
  const [confirmation, setConfirmation] = useState(existing?.confirmation ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [naReason, setNaReason] = useState(existing?.not_applicable_reason ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()

    // Mutually exclusive payloads — DB constraint filings_status_exclusivity
    // enforces this server-side. Single typed shape so the two branches stay
    // structurally identical for Supabase's strict insert/update inference.
    const payload: {
      filing_type: typeof filingType
      tax_year: number
      quarter: number | null
      filed_on: string | null
      confirmation: string | null
      notes: string | null
      not_applicable: boolean
      not_applicable_reason: string | null
      created_by: string
    } =
      statusChoice === 'filed'
        ? {
            filing_type: filingType,
            tax_year: taxYear,
            quarter,
            filed_on: filedOn || null,
            confirmation: confirmation || null,
            notes: notes || null,
            not_applicable: false,
            not_applicable_reason: null,
            created_by: createdBy,
          }
        : {
            filing_type: filingType,
            tax_year: taxYear,
            quarter,
            filed_on: null,
            confirmation: null,
            notes: null,
            not_applicable: true,
            not_applicable_reason: naReason || null,
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

    // HYSA withdrawal mirrors only the Filed state. Switching to N/A or back
    // to Pending deletes any prior withdrawal so the ledger stays consistent.
    if (computedAmount !== undefined && filingId) {
      if (statusChoice === 'filed' && filedOn) {
        await upsertHysaWithdrawalForFiling(supabase, filingId, computedAmount, filedOn, createdBy)
      } else {
        await deleteHysaWithdrawalForFiling(supabase, filingId)
      }
    }

    toast.success(
      statusChoice === 'na'
        ? 'Marked not applicable.'
        : existing?.filed_on
          ? 'Filing updated.'
          : 'Filing recorded.',
    )
    setEditing(false)
    setSaving(false)
    startTransition(() => router.refresh())
  }

  // ── Display mode ────────────────────────────────────────────────────────
  if (existing && !editing && existing.not_applicable) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <MinusCircle className="h-4 w-4 text-muted-foreground" />
              Not applicable
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-1.5 text-sm">
          {existing.not_applicable_reason ? (
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Reason</p>
              <p className="text-sm whitespace-pre-wrap">{existing.not_applicable_reason}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Marked not applicable. No filing required.</p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (existing && !editing && existing.filed_on) {
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

  // ── Edit mode ───────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          {existing && hasResolvedStatus ? (
            <Badge variant="secondary">Editing status</Badge>
          ) : (
            <span>Set status</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">
        {/* Status toggle — Filed vs Not applicable */}
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Filing status">
          <Button
            type="button"
            variant={statusChoice === 'filed' ? 'default' : 'outline'}
            onClick={() => setStatusChoice('filed')}
            className="justify-center"
            role="tab"
            aria-selected={statusChoice === 'filed'}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Filed
          </Button>
          <Button
            type="button"
            variant={statusChoice === 'na' ? 'default' : 'outline'}
            onClick={() => setStatusChoice('na')}
            className="justify-center"
            role="tab"
            aria-selected={statusChoice === 'na'}
          >
            <MinusCircle className="h-3.5 w-3.5 mr-1.5" />
            Not applicable
          </Button>
        </div>

        {statusChoice === 'filed' ? (
          <>
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
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="na-reason">Reason (optional)</Label>
            <textarea
              id="na-reason"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px]"
              value={naReason}
              onChange={e => setNaReason(e.target.value)}
              placeholder="e.g. babysitter started May 11; no wages paid in Q1"
            />
            <p className="text-xs text-muted-foreground">
              Marks this filing as permanently not applicable. Suppresses the Overdue badge on the
              filings list and dashboard.
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {existing && hasResolvedStatus && (
            <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
          <Button className="flex-1" disabled={saving} onClick={save}>
            {saving
              ? 'Saving…'
              : statusChoice === 'na'
                ? 'Mark not applicable'
                : existing?.filed_on
                  ? 'Update'
                  : 'Mark filed'}
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
