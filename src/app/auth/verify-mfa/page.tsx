'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck } from 'lucide-react'

export default function VerifyMfaPage() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function getFactorId() {
      const supabase = createClient()
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp?.find(f => f.status === 'verified')
      if (verified) setFactorId(verified.id)
    }
    getFactorId()
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return

    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ''),
    })

    if (error) {
      setError('Invalid code. Make sure your device clock is accurate and try again.')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Two-factor verification</h1>
          <p className="text-sm text-muted-foreground">
            Enter the code from your authenticator app.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Authentication code</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="totp-code" className="sr-only">6-digit code</Label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="000 000"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  className="font-mono tracking-widest text-center text-lg"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || !factorId || code.replace(/\s/g, '').length < 6}
              >
                {loading ? 'Verifying…' : 'Verify'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
