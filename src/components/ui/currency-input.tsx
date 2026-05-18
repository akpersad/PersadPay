'use client'

import { useEffect, useRef, useState } from 'react'
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
  // Prevents onBeforeInput from double-applying when onKeyDown already handled the event
  const handledRef = useRef(false)

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

  function applyBackspace(input: HTMLInputElement) {
    const allSelected =
      input.selectionStart === 0 && input.selectionEnd === input.value.length
    const next = allSelected ? 0 : Math.floor(cents / 10)
    setCents(next)
    onChange(next / 100)
  }

  function applyDigit(digit: string) {
    const candidate = cents * 10 + parseInt(digit, 10)
    const next = candidate > 999999999 ? cents : candidate
    setCents(next)
    onChange(next / 100)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    handledRef.current = false
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      applyBackspace(e.currentTarget)
      handledRef.current = true
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault()
      applyDigit(e.key)
      handledRef.current = true
    }
    // Tab, arrows, etc. pass through naturally
  }

  // onBeforeInput handles mobile virtual keyboards, which don't reliably fire onKeyDown.
  // The handledRef guard prevents double-applying when onKeyDown already acted.
  function handleBeforeInput(e: React.FormEvent<HTMLInputElement>) {
    if (handledRef.current) return
    e.preventDefault()
    const native = e.nativeEvent as InputEvent
    if (
      native.inputType === 'deleteContentBackward' ||
      native.inputType === 'deleteContentForward'
    ) {
      applyBackspace(e.currentTarget as HTMLInputElement)
    } else if (native.data && /^\d$/.test(native.data)) {
      applyDigit(native.data)
    }
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
        onChange={() => {/* controlled; all input handled by onKeyDown + onBeforeInput */}}
        onKeyDown={handleKeyDown}
        onBeforeInput={handleBeforeInput}
        disabled={disabled}
      />
    </div>
  )
}
