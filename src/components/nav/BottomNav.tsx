'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, BellRing, FileSpreadsheet, Settings } from 'lucide-react'
import type { Role } from '@/lib/types'

const adminTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stubs', label: 'Pay Stubs', icon: FileText },
  { href: '/reminders', label: 'Reminders', icon: BellRing },
  { href: '/w2', label: 'W-2', icon: FileSpreadsheet },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const employeeTabs = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/stubs', label: 'Pay Stubs', icon: FileText },
  { href: '/w2', label: 'W-2', icon: FileSpreadsheet },
]

interface BottomNavProps {
  role: Role
}

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname()
  const tabs = role === 'admin' ? adminTabs : employeeTabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
      <div className="flex h-16 items-center justify-around px-2 max-w-lg mx-auto">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full text-xs transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
