'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  value: string | number
  label?: string
}

// Inline copy-to-clipboard chip used on filing detail pages so the admin
// can paste exact box values into the official NYS-45 / Schedule H forms.
export function CopyValue({ value, label }: Props) {
  const [copied, setCopied] = useState(false)
  const text = typeof value === 'number' ? value.toFixed(2) : value

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label ?? 'value'}`}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied
        ? <Check className="h-3 w-3 text-green-600" />
        : <Copy className="h-3 w-3" />
      }
    </button>
  )
}
