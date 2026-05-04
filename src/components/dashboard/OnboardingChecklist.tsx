'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import type { OnboardingItem } from '@/lib/types'
import { CheckSquare, Square } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function OnboardingChecklist({ items }: { items: OnboardingItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  async function toggle(item: OnboardingItem) {
    const supabase = createClient()
    await supabase
      .from('onboarding_checklist')
      .update({ completed: !item.completed })
      .eq('id', item.id)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm">Setup Checklist</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => toggle(item)}
            disabled={pending}
            className="flex items-start gap-2 w-full text-left group"
          >
            {item.completed
              ? <CheckSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
              : <Square className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground group-hover:text-foreground" />
            }
            <div>
              <p className={`text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}
