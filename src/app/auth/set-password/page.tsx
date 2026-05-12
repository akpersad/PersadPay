'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound } from 'lucide-react'

export default function SetPasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace('/')
    })
  }, [router])

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
      setError(
        error.message.toLowerCase().includes('auth session missing')
          ? 'Your session has expired. Please use the invitation link again or contact your employer.'
          : error.message
      )
      setLoading(false)
      return
    }

    setLoading(false)
    router.push('/auth/enroll-mfa')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-3">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Create your password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a strong password to secure your account.
          </p>
        </div>
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Password</Label>
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
            <Label htmlFor="confirm-password">Confirm password</Label>
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
            {loading ? 'Saving…' : 'Set password & continue'}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Next: set up two-factor authentication
        </p>
      </div>
    </div>
  )
}
