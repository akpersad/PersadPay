'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, BellRing, FileSpreadsheet, Folder,
  Settings, PiggyBank, MoreHorizontal, CalendarDays, ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { Role } from '@/lib/types'

const adminPrimary = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stubs', label: 'Stubs', icon: FileText },
  { href: '/reminders', label: 'Reminders', icon: BellRing },
  { href: '/hysa', label: 'HYSA', icon: PiggyBank },
]

const adminOverflow = [
  { href: '/w2', label: 'W-2', icon: FileSpreadsheet },
  { href: '/filings', label: 'Filings', icon: ScrollText },
  { href: '/documents', label: 'Documents', icon: Folder },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const employeeTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stubs', label: 'Pay Stubs', icon: FileText },
  { href: '/w2', label: 'W-2', icon: FileSpreadsheet },
]

function isActive(href: string, pathname: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
}

function TabLink({
  href,
  label,
  icon: Icon,
  pathname,
  className,
}: {
  href: string
  label: string
  icon: React.ElementType
  pathname: string
  className?: string
}) {
  const active = isActive(href, pathname)
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-1 h-full text-xs transition-colors',
        active ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
      <span>{label}</span>
    </Link>
  )
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  if (role === 'employee') {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background print:hidden">
        <div className="flex h-16 items-center justify-around px-2 max-w-lg md:max-w-4xl mx-auto">
          {employeeTabs.map(tab => (
            <TabLink key={tab.href} {...tab} pathname={pathname} className="flex-1" />
          ))}
        </div>
      </nav>
    )
  }

  const overflowActive = adminOverflow.some(tab => isActive(tab.href, pathname))

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background print:hidden">
        <div className="flex h-16 items-center justify-around px-2 max-w-lg md:max-w-4xl mx-auto">
          {/* Primary tabs — always visible */}
          {adminPrimary.map(tab => (
            <TabLink key={tab.href} {...tab} pathname={pathname} className="flex-1" />
          ))}

          {/* Overflow tabs — visible on md+ screens only */}
          {adminOverflow.map(tab => (
            <TabLink
              key={tab.href}
              {...tab}
              pathname={pathname}
              className="hidden md:flex flex-1"
            />
          ))}

          {/* More tab — visible on mobile only */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex md:hidden flex-col items-center justify-center gap-1 flex-1 h-full text-xs transition-colors',
              overflowActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={overflowActive ? 2.5 : 1.75} />
            <span>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="pb-8">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-sm font-medium text-left">More</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 max-w-lg mx-auto">
            {adminOverflow.map(({ href, label, icon: Icon }) => {
              const active = isActive(href, pathname)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 p-4 rounded-xl text-xs font-medium transition-colors',
                    active
                      ? 'text-primary bg-accent'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 1.75} />
                  <span>{label}</span>
                </Link>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
