'use client'

import { useEffect, useState } from 'react'
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
  { href: '/settings', label: 'Settings', icon: Settings },
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
  onNavigate,
}: {
  href: string
  label: string
  icon: React.ElementType
  pathname: string
  className?: string
  onNavigate?: (href: string) => void
}) {
  const active = isActive(href, pathname)
  return (
    <Link
      href={href}
      onClick={() => { if (!active) onNavigate?.(href) }}
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
  const [transitioningTo, setTransitioningTo] = useState<string | null>(null)
  const transitioning = transitioningTo !== null && transitioningTo !== pathname

  // Clear the progress bar if navigation hasn't completed within 5 seconds
  // (covers network failures where pathname never changes)
  useEffect(() => {
    if (!transitioningTo) return
    const t = setTimeout(() => setTransitioningTo(null), 5000)
    return () => clearTimeout(t)
  }, [transitioningTo])

  // Clear progress bar once we arrive at the destination
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTransitioningTo(null)
  }, [pathname])

  const progressBar = transitioning ? (
    <div className="fixed top-0 inset-x-0 h-0.5 z-[100] overflow-hidden pointer-events-none">
      <div className="h-full bg-primary animate-nav-progress" />
    </div>
  ) : null

  if (role === 'employee') {
    return (
      <>
        {progressBar}
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background print:hidden">
          <div className="flex h-16 items-center justify-around px-2 max-w-lg md:max-w-4xl mx-auto">
            {employeeTabs.map(tab => (
              <TabLink key={tab.href} {...tab} pathname={pathname} className="flex-1" onNavigate={(href) => setTransitioningTo(href)} />
            ))}
          </div>
        </nav>
      </>
    )
  }

  const overflowActive = adminOverflow.some(tab => isActive(tab.href, pathname))

  return (
    <>
      {progressBar}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background print:hidden">
        <div className="flex h-16 items-center justify-around px-2 max-w-lg md:max-w-4xl mx-auto">
          {/* Primary tabs — always visible */}
          {adminPrimary.map(tab => (
            <TabLink key={tab.href} {...tab} pathname={pathname} className="flex-1" onNavigate={(href) => setTransitioningTo(href)} />
          ))}

          {/* Overflow tabs — visible on md+ screens only */}
          {adminOverflow.map(tab => (
            <TabLink
              key={tab.href}
              {...tab}
              pathname={pathname}
              className="hidden md:flex flex-1"
              onNavigate={(href) => setTransitioningTo(href)}
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
                  onClick={() => { setMoreOpen(false); if (!active) setTransitioningTo(href) }}
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
