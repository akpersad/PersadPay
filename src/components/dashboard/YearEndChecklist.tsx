'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { CheckSquare, Square } from 'lucide-react'
import type { YearEndItem } from '@/lib/types'

type LinkDef = { href: string; external: boolean }

const ITEM_LINKS: Record<string, LinkDef> = {
  'File NYS-45 Q4': { href: '/reminders', external: false },
  'Generate and send W-2 to employee': { href: '/w2', external: false },
  'File W-3 with SSA': { href: '/w2', external: false },
  'File Schedule H with federal return': { href: '/reminders', external: false },
  'Verify and update tax constants for the new year': { href: '/settings', external: false },
  'Check updated SUTA rate notice from NY DOL': { href: '/settings', external: false },
  'Verify HYSA balance covers all Q4 taxes': { href: '/hysa', external: false },
}

function ItemLabel({ item }: { item: YearEndItem }) {
  const className = `text-sm underline-offset-2 hover:underline ${item.completed ? 'line-through text-muted-foreground' : ''}`
  const plainClass = `text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`

  // Match partial label prefixes for link lookup
  const linkKey = Object.keys(ITEM_LINKS).find(k => item.label.startsWith(k))
  const link = linkKey ? ITEM_LINKS[linkKey] : undefined

  if (!link) return <p className={plainClass}>{item.label}</p>

  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {item.label}
      </a>
    )
  }

  return (
    <Link href={link.href} className={className}>
      {item.label}
    </Link>
  )
}

export function YearEndChecklist({ items, taxYear }: { items: YearEndItem[]; taxYear: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const incomplete = items.filter(i => !i.completed)
  const complete = items.filter(i => i.completed)
  const sorted = [...incomplete, ...complete]

  async function toggle(item: YearEndItem) {
    const supabase = createClient()
    await supabase
      .from('year_end_checklist')
      .update({ completed: !item.completed })
      .eq('id', item.id)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm">Year-End Checklist ({taxYear})</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {sorted.map(item => (
          <div key={item.id} className="flex items-start gap-2">
            <button
              onClick={() => toggle(item)}
              disabled={pending}
              className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {item.completed
                ? <CheckSquare className="h-4 w-4 text-green-600" />
                : <Square className="h-4 w-4" />
              }
            </button>
            <div>
              <ItemLabel item={item} />
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
