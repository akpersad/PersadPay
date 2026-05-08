'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/dates'
import { toast } from 'sonner'
import { Download, Mail } from 'lucide-react'
import { PdfPreviewDialog } from '@/components/ui/pdf-preview-dialog'
import type { W2, Role } from '@/lib/types'

interface Props {
  w2s: W2[]
  role: Role
  userId: string
}

const CURRENT_YEAR = new Date().getFullYear()
const TAX_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 - i)

export function W2View({ w2s, role, userId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const isAdmin = role === 'admin'

  const [selectedYear, setSelectedYear] = useState<string>('')
  const [preview, setPreview] = useState<W2 | null>(null)
  const [loading, setLoading] = useState(false)
  const [regenerateWarning, setRegenerateWarning] = useState(false)
  const [emailPending, setEmailPending] = useState(false)

  async function generatePreview() {
    if (!selectedYear) return
    setLoading(true)
    const res = await fetch(`/api/w2/calculate?year=${selectedYear}`)
    if (!res.ok) {
      toast.error('Failed to calculate W-2. Check that stubs exist for this year.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setPreview(data)
    setLoading(false)
  }

  function startGenerate() {
    const existing = w2s.find(w => w.tax_year === parseInt(selectedYear))
    if (existing) {
      setRegenerateWarning(true)
    } else {
      generatePreview()
    }
  }

  async function saveAndDownload() {
    if (!preview) return
    setLoading(true)
    const res = await fetch('/api/w2/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...preview, generated_by: userId }),
    })
    if (!res.ok) {
      toast.error('Failed to save W-2.')
      setLoading(false)
      return
    }
    const saved = await res.json()
    toast.success('W-2 saved.')
    startTransition(() => router.refresh())
    window.open(`/api/pdf/w2?id=${saved.id}`, '_blank')
    setLoading(false)
  }

  async function saveAndEmail() {
    if (!preview) return
    setEmailPending(true)
    const saveRes = await fetch('/api/w2/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...preview, generated_by: userId }),
    })
    if (!saveRes.ok) {
      toast.error('Failed to save W-2.')
      setEmailPending(false)
      return
    }
    const saved = await saveRes.json()
    startTransition(() => router.refresh())

    const emailRes = await fetch('/api/email/w2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ w2Id: saved.id }),
    })
    if (!emailRes.ok) {
      toast.error('W-2 saved but email failed. Use the retry button on the record.')
    } else {
      toast.success('W-2 saved and emailed.')
    }
    setEmailPending(false)
  }

  return (
    <div className="space-y-5">
      {/* Existing W-2s */}
      {w2s.length > 0 && (
        <div className="space-y-2">
          {w2s.map(w2 => (
            <Card key={w2.id}>
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">W-2 — Tax Year {w2.tax_year}</p>
                    <p className="text-xs text-muted-foreground">Wages: {formatCurrency(w2.wages_tips)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <PdfPreviewDialog
                      url={`/api/pdf/w2?id=${w2.id}`}
                      title={`W-2 — Tax Year ${w2.tax_year}`}
                      size="sm"
                    />
                    <Button size="sm" variant="outline" onClick={() => window.open(`/api/pdf/w2?id=${w2.id}`, '_blank')}>
                      <Download className="h-4 w-4 mr-1" />
                      W-2
                    </Button>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1.5">
                    <PdfPreviewDialog
                      url={`/api/pdf/w3?id=${w2.id}`}
                      title={`W-3 Transmittal — Tax Year ${w2.tax_year}`}
                      buttonLabel="Preview W-3"
                      className="flex-1"
                      size="sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(`/api/pdf/w3?id=${w2.id}`, '_blank')}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      W-3 (SSA)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!w2s.length && !isAdmin && (
        <p className="text-sm text-muted-foreground">
          No W-2s available yet. Your employer will generate your W-2 in January after year-end.
        </p>
      )}

      {/* Admin: generate new W-2 */}
      {isAdmin && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-medium">Generate W-2</p>
            <Select value={selectedYear} onValueChange={v => { setSelectedYear(v ?? ''); setPreview(null) }}>
              <SelectTrigger>
                <SelectValue placeholder="Select tax year" />
              </SelectTrigger>
              <SelectContent>
                {TAX_YEARS.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!selectedYear || loading}
              onClick={startGenerate}
            >
              {loading ? 'Calculating…' : 'Preview W-2'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {preview && isAdmin && (
        <Card>
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-semibold">W-2 Preview — {preview.tax_year}</p>
            <W2Row label="Box 1 — Wages, Tips" value={preview.wages_tips} />
            <W2Row label="Box 2 — Federal Tax Withheld" value={preview.federal_tax_withheld} />
            <W2Row label="Box 3 — SS Wages" value={preview.ss_wages} />
            <W2Row label="Box 4 — SS Tax Withheld" value={preview.ss_tax_withheld} />
            <W2Row label="Box 5 — Medicare Wages" value={preview.medicare_wages} />
            <W2Row label="Box 6 — Medicare Tax Withheld" value={preview.medicare_tax_withheld} />
            <W2Row label="Box 16 — State Wages" value={preview.state_wages} />
            <W2Row label="Box 17 — State Tax Withheld" value={preview.state_tax_withheld} />
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" disabled={loading} onClick={saveAndDownload}>
                <Download className="h-4 w-4 mr-1" />
                {loading ? 'Saving…' : 'Save & Download'}
              </Button>
              <Button variant="outline" className="flex-1" disabled={emailPending} onClick={saveAndEmail}>
                <Mail className="h-4 w-4 mr-1" />
                {emailPending ? 'Sending…' : 'Save & Email'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regenerate warning */}
      <Dialog open={regenerateWarning} onOpenChange={setRegenerateWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>W-2 already exists for {selectedYear}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Regenerating will replace the existing W-2 record for this year. Are you sure?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegenerateWarning(false)}>Cancel</Button>
            <Button onClick={() => { setRegenerateWarning(false); generatePreview() }}>Regenerate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function W2Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  )
}
