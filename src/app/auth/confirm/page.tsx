'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const validTypes = ['invite', 'magiclink', 'signup'] as const
type ValidType = (typeof validTypes)[number]

function ConfirmContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [otpError, setOtpError] = useState<string | null>(null)
  const called = useRef(false)

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const isRecovery = type === 'recovery' && !!tokenHash
  const isValid = Boolean(tokenHash && validTypes.includes(type as ValidType))

  useEffect(() => {
    // Recovery links are handled by /auth/reset-password directly
    if (isRecovery) {
      router.replace(`/auth/reset-password?token_hash=${tokenHash}&type=recovery`)
      return
    }
    // StrictMode guard — prevent double-invocation of verifyOtp in development
    if (!isValid || called.current) return
    called.current = true

    const supabase = createClient()
    supabase.auth
      .verifyOtp({ type: type as ValidType, token_hash: tokenHash! })
      .then(({ error }) => {
        if (error) {
          const msg = type === 'invite'
            ? 'This invitation link is invalid or has expired. Ask an admin to re-send your invite.'
            : 'This link is invalid or has expired. Please request a new one.'
          setOtpError(msg)
        } else if (type === 'invite') {
          router.push('/auth/set-password')
        } else {
          router.push('/dashboard')
        }
      })
  }, [isRecovery, isValid, tokenHash, type, router])

  const error = (!isValid && !isRecovery) ? 'Invalid or unsupported link.' : otpError

  if (error) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <p className="text-sm text-center text-muted-foreground">
      {type === 'invite' ? 'Verifying invitation…' : 'Verifying…'}
    </p>
  )

}

export default function ConfirmPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Persad Pay</h1>
          <p className="text-sm text-muted-foreground">Setting up your account…</p>
        </div>
        <Suspense fallback={<p className="text-sm text-center text-muted-foreground">Loading…</p>}>
          <ConfirmContent />
        </Suspense>
      </div>
    </div>
  )
}
