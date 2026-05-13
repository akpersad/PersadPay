'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CurrencyInputProps {
  id?: string
  value: number
  onChange: (dollars: number) => void
  className?: string
  disabled?: boolean
}

export function CurrencyInput({ id, value, onChange, className, disabled }: CurrencyInputProps) {
  const [cents, setCents] = useState(() => Math.round(value * 100))

  useEffect(() => {
    const incoming = Math.round(value * 100)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (incoming !== cents) setCents(incoming)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function format(c: number): string {
    const [whole, dec] = (c / 100).toFixed(2).split('.')
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault()
    let next = cents
    if (e.key === 'Backspace') {
      next = Math.floor(cents / 10)
    } else if (/^\d$/.test(e.key)) {
      const candidate = cents * 10 + parseInt(e.key, 10)
      next = candidate > 999999999 ? cents : candidate
    } else {
      return
    }
    setCents(next)
    onChange(next / 100)
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        className={cn('pl-6 tabular-nums', className)}
        value={format(cents)}
        onKeyDown={handleKeyDown}
        readOnly
        disabled={disabled}
      />
    </div>
  )
}
