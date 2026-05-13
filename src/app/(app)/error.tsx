'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'

export default function AppError({
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
    <div className="px-4 pt-16 pb-4 flex flex-col items-center text-center gap-4 max-w-sm mx-auto">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred. Try again or return to the dashboard.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={reset}>Try again</Button>
        <Link href="/dashboard" className={buttonVariants()}>Dashboard</Link>
      </div>
    </div>
  )
}
