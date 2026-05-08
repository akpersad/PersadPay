'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const hasValidParams = !!(tokenHash && type === 'recovery')

  // Initialize to 'invalid' immediately if params are missing — avoids synchronous setState in effect
  const [status, setStatus] = useState<'verifying' | 'ready' | 'done' | 'invalid'>(
    hasValidParams ? 'verifying' : 'invalid',
  )
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hasValidParams) return

    const supabase = createClient()
    supabase.auth
      .verifyOtp({ type: 'recovery', token_hash: tokenHash! })
      .then(({ error }) => setStatus(error ? 'invalid' : 'ready'))
  }, [hasValidParams, tokenHash])

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setStatus('done')
    await supabase.auth.signOut()
    setTimeout(() => router.push('/'), 2000)
  }

  return (
    <>
      {status === 'verifying' && (
        <p className="text-sm text-center text-muted-foreground">Verifying reset link…</p>
      )}

      {status === 'invalid' && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-destructive">
            This reset link is invalid or has expired. Please request a new one.
          </p>
          <Button variant="outline" className="w-full" onClick={() => router.push('/')}>
            Back to sign in
          </Button>
        </div>
      )}

      {status === 'ready' && (
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Updating…' : 'Set new password'}
          </Button>
        </form>
      )}

      {status === 'done' && (
        <p className="text-sm text-center text-green-600 dark:text-green-500">
          Password updated. Redirecting to sign in…
        </p>
      )}
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Persad Pay</h1>
          <p className="text-sm text-muted-foreground">Reset your password</p>
        </div>
        <Suspense fallback={<p className="text-sm text-center text-muted-foreground">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
