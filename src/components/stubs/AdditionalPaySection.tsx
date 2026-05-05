'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Plus, X } from 'lucide-react'
import {
  LINE_TYPES,
  getLineTypeDef,
  type LineType,
  type LineItemDraft,
  type LineTypeDef,
} from '@/lib/line-items'

interface Props {
  items: LineItemDraft[]
  onChange: (items: LineItemDraft[]) => void
  irsMileageRate: number
}

export function AdditionalPaySection({ items, onChange, irsMileageRate }: Props) {
  const [pendingNonTaxable, setPendingNonTaxable] = useState<{ id: string; def: LineTypeDef } | null>(null)

  function add() {
    const newItem: LineItemDraft = {
      id: crypto.randomUUID(),
      line_type: '',
      label: '',
      amount: 0,
      given_separately: false,
    }
    onChange([...items, newItem])
  }

  function remove(id: string) {
    onChange(items.filter(i => i.id !== id))
  }

  function updateItem(id: string, patch: Partial<LineItemDraft>) {
    onChange(items.map(i => i.id === id ? { ...i, ...patch } : i))
  }

  function changeType(id: string, newType: LineType) {
    const def = getLineTypeDef(newType)
    if (!def) return

    const isNonTaxable = !def.taxable_fed && !def.taxable_fica && !def.taxable_ny && !def.w2_box1

    // Reset to default label and zero amount on type change so the previous
    // value doesn't quietly mis-apply to a different tax treatment. Pre-flip
    // the given_separately toggle for items that are usually handed over
    // outside the Zelle payment (gift cards).
    updateItem(id, {
      line_type: newType,
      label: def.defaultItemLabel,
      amount: 0,
      miles: def.isMileage ? 0 : undefined,
      given_separately: def.defaultGivenSeparately ?? false,
    })

    if (isNonTaxable && def.requiresConfirmation) {
      setPendingNonTaxable({ id, def })
    }
  }

  function confirmNonTaxable() {
    setPendingNonTaxable(null)
  }

  function cancelNonTaxable() {
    if (!pendingNonTaxable) return
    // Clear the type so the admin has to pick again deliberately.
    updateItem(pendingNonTaxable.id, {
      line_type: '',
      label: '',
      amount: 0,
      miles: undefined,
      given_separately: false,
    })
    setPendingNonTaxable(null)
  }

  function setMiles(id: string, miles: number) {
    const amount = Math.round(miles * irsMileageRate * 100) / 100
    const item = items.find(i => i.id === id)
    const def = item ? getLineTypeDef(item.line_type) : null
    const label = def
      ? `${def.defaultItemLabel} — ${miles} mi @ ${(irsMileageRate * 100).toFixed(1)}¢/mi`
      : `${miles} mi`
    updateItem(id, { miles, amount, label })
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm">Additional Pay</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Bonuses, reimbursements, holiday pay — leave empty if none.
          </p>
        )}

        {items.map(item => {
          const def = item.line_type ? getLineTypeDef(item.line_type) : undefined
          const isTaxable = def && (def.taxable_fed || def.taxable_fica || def.taxable_ny || def.w2_box1)

          return (
            <div key={item.id} className="space-y-2 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={item.line_type}
                      onValueChange={v => v && changeType(item.id, v as LineType)}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue>
                          {(value: string | null) => {
                            const matched = value ? LINE_TYPES.find(t => t.value === value) : null
                            return (
                              <span className={matched ? '' : 'text-muted-foreground'}>
                                {matched?.label ?? 'Select type…'}
                              </span>
                            )
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]">
                        {LINE_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {def && (
                    <>
                      <div>
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={item.label}
                          onChange={e => updateItem(item.id, { label: e.target.value })}
                          className="h-9"
                        />
                      </div>

                      {def.isMileage ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Miles</Label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={item.miles ?? 0}
                              onChange={e => setMiles(item.id, parseFloat(e.target.value || '0'))}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Amount</Label>
                            <Input
                              type="text"
                              value={`$${item.amount.toFixed(2)}`}
                              readOnly
                              className="h-9 bg-muted"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">Amount ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.amount || ''}
                            onChange={e => updateItem(item.id, { amount: parseFloat(e.target.value || '0') })}
                            className="h-9"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="Remove line item"
                  className="text-muted-foreground hover:text-destructive p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {def && (
                <>
                  <div className="flex items-center gap-2">
                    {def.informational_only ? (
                      <Badge variant="outline">Informational only</Badge>
                    ) : isTaxable ? (
                      <Badge variant="secondary">Taxable</Badge>
                    ) : (
                      <Badge variant="outline">Non-taxable reimbursement</Badge>
                    )}
                    <p className="text-[11px] text-muted-foreground flex-1">{def.hint}</p>
                  </div>

                  {/* Informational-only items don't move money so the toggle is N/A. */}
                  {!def.informational_only && (
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <div className="flex-1 min-w-0">
                        <Label className="text-xs">Given separately (not in Zelle)</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          On if she already received this outside the regular paycheck. Subtracted from &quot;Cash to Zelle.&quot;
                        </p>
                      </div>
                      <Switch
                        checked={item.given_separately}
                        onCheckedChange={(checked) => updateItem(item.id, { given_separately: checked })}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}

        <Button type="button" size="sm" variant="outline" onClick={add} className="w-full">
          <Plus className="h-4 w-4 mr-1" />
          Add line item
        </Button>
      </CardContent>

      {/* Non-taxable confirmation modal */}
      <Dialog open={!!pendingNonTaxable} onOpenChange={(open) => { if (!open) cancelNonTaxable() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm non-taxable item</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <p className="text-muted-foreground">
              You picked: <strong>{pendingNonTaxable?.def.label}</strong>
            </p>
            <p>{pendingNonTaxable?.def.hint}</p>
            <p className="text-muted-foreground text-xs pt-1">
              This amount will not be added to W-2 wages or have FICA withheld. Confirm
              that the IRS substantiation requirement (mileage log, receipts, or OT trigger
              context) is on file.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelNonTaxable}>Cancel</Button>
            <Button onClick={confirmNonTaxable}>I have substantiation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
