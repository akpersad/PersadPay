'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import type { OnboardingItem } from '@/lib/types'
import { CheckSquare, Square } from 'lucide-react'

type LinkDef = { href: string; external: boolean }

const ITEM_LINKS: Record<string, LinkDef> = {
  'Apply for Federal EIN at irs.gov': {
    href: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
    external: true,
  },
  'Register with New York State': {
    href: 'https://dol.ny.gov/register-unemployment-insurance-0',
    external: true,
  },
  'Complete USCIS Form I-9 (Employment Eligibility Verification)': {
    href: 'https://www.uscis.gov/i-9',
    external: true,
  },
  'File new hire report with NY': {
    href: 'https://www.nynewhire.com/',
    external: true,
  },
  'Provide signed LS-59 Wage Notice to employee': {
    href: 'https://dol.ny.gov/LS59-doc',
    external: true,
  },
  'Have employee complete Federal W-4': {
    href: 'https://www.irs.gov/forms-pubs/about-form-w-4',
    external: true,
  },
  'Have employee complete NY IT-2104': {
    href: 'https://www.tax.ny.gov/forms/current-forms/it/it2104i.htm',
    external: true,
  },
  'Determine PFL waiver eligibility': {
    href: 'https://paidfamilyleave.ny.gov/pfl-waiver-form',
    external: true,
  },
  'Purchase persadpay.com domain': {
    href: 'https://www.godaddy.com',
    external: true,
  },
  'Add Vercel DNS records to domain registrar': {
    href: 'https://vercel.com/docs/projects/domains',
    external: true,
  },
  'Sign up for Resend and verify persadpay.com': {
    href: 'https://resend.com',
    external: true,
  },
  'Fill out all fields in Persad Pay Settings': {
    href: '/settings',
    external: false,
  },
  'Create Supabase user accounts for all three users': {
    href: 'https://supabase.com/dashboard',
    external: true,
  },
  'Adopt and distribute Sexual Harassment Prevention Policy': {
    href: '/documents/sexual-harassment-policy',
    external: false,
  },
  'Complete annual interactive harassment-prevention training': {
    href: 'https://www.ny.gov/combating-sexual-harassment-workplace/employees',
    external: true,
  },
  'Print and post required workplace posters': {
    href: 'https://dol.ny.gov/posting-requirements',
    external: true,
  },
  'Confirm quarterly reminders are seeded in Reminders tab': {
    href: '/reminders',
    external: false,
  },
  'Print, sign, and file the Sick Leave Policy': {
    href: '/documents/sick-leave-policy',
    external: false,
  },
}

function ItemLabel({ item, link }: { item: OnboardingItem; link: LinkDef | undefined }) {
  const className = `text-sm underline-offset-2 hover:underline ${item.completed ? 'line-through text-muted-foreground' : ''}`

  if (!link) {
    return <p className={`text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`}>{item.label}</p>
  }

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

export function OnboardingChecklist({ items }: { items: OnboardingItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const incomplete = items.filter(i => !i.completed)
  const complete = items.filter(i => i.completed)
  const sorted = [...incomplete, ...complete]

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
              <ItemLabel item={item} link={ITEM_LINKS[item.label]} />
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
