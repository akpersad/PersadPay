'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react'
import type { Factor } from '@supabase/supabase-js'

export function MfaSecurityCard() {
  const [factor, setFactor] = useState<Factor | null>(null)
  const [loadingFactors, setLoadingFactors] = useState(true)
  const [showUnenroll, setShowUnenroll] = useState(false)
  const [unenrollCode, setUnenrollCode] = useState('')
  const [unenrollError, setUnenrollError] = useState<string | null>(null)
  const [unenrolling, setUnenrolling] = useState(false)

  useEffect(() => {
    async function loadFactors() {
      const supabase = createClient()
      const { data } = await supabase.auth.mfa.listFactors()
      const verified = data?.totp?.find(f => f.status === 'verified') ?? null
      setFactor(verified)
      setLoadingFactors(false)
    }
    loadFactors()
  }, [])

  async function handleUnenroll(e: React.FormEvent) {
    e.preventDefault()
    if (!factor) return

    setUnenrollError(null)
    setUnenrolling(true)

    const supabase = createClient()

    // Verify the TOTP code before unenrolling
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: unenrollCode.replace(/\s/g, ''),
    })

    if (verifyError) {
      setUnenrollError('Invalid code. Please try again.')
      setUnenrolling(false)
      return
    }

    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })

    if (unenrollError) {
      setUnenrollError(`Could not unenroll: ${unenrollError.message}`)
      setUnenrolling(false)
      return
    }

    // Unenroll succeeded — middleware will redirect to /auth/enroll-mfa on next navigation
    window.location.href = '/auth/enroll-mfa'
  }

  if (loadingFactors) {
    return (
      <Card>
        <CardContent className="py-4 px-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading security status…</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-base flex items-center gap-2">
          {factor ? (
            <ShieldCheck className="h-4 w-4 text-green-600" />
          ) : (
            <ShieldOff className="h-4 w-4 text-yellow-500" />
          )}
          Two-Factor Authentication
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {factor ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">Authenticator app enrolled</p>
                <p className="text-xs text-muted-foreground">
                  Enrolled {new Date(factor.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowUnenroll(v => !v); setUnenrollError(null); setUnenrollCode('') }}
              >
                {showUnenroll ? 'Cancel' : 'Remove'}
              </Button>
            </div>

            {showUnenroll && (
              <form onSubmit={handleUnenroll} className="space-y-3 pt-1 border-t">
                <p className="text-xs text-muted-foreground">
                  Enter your current authenticator code to confirm removal. You will be redirected to re-enroll immediately.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="unenroll-code">Authenticator code</Label>
                  <Input
                    id="unenroll-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9 ]*"
                    maxLength={7}
                    value={unenrollCode}
                    onChange={e => setUnenrollCode(e.target.value)}
                    placeholder="000 000"
                    autoComplete="one-time-code"
                    className="font-mono tracking-widest text-center"
                  />
                </div>
                {unenrollError && <p className="text-sm text-destructive">{unenrollError}</p>}
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={unenrolling || unenrollCode.replace(/\s/g, '').length < 6}
                >
                  {unenrolling ? 'Removing…' : 'Remove Authenticator'}
                </Button>
              </form>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No authenticator app enrolled. Set one up to secure your account.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => { window.location.href = '/auth/enroll-mfa' }}
            >
              Set Up Authenticator
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
