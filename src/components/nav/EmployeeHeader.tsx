'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { LogOut, UserCircle } from 'lucide-react'

export function EmployeeHeader({ name }: { name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <>
      <header className="flex items-center justify-between px-4 pt-5 pb-1 max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto w-full">
        <span className="text-sm font-medium text-muted-foreground">{name}</span>
        <button onClick={() => setOpen(true)} aria-label="Account menu">
          <UserCircle className="h-6 w-6 text-muted-foreground" />
        </button>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">{name}</p>
          <DialogFooter>
            <Button variant="outline" onClick={signOut} className="w-full">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
