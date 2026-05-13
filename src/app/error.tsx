'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          An unexpected error occurred. Try again or return to the dashboard.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={reset}>Try again</Button>
          <Button onClick={() => { window.location.href = '/dashboard' }}>Dashboard</Button>
        </div>
      </div>
    </main>
  )
}
