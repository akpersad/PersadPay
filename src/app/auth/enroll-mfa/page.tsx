'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShieldCheck, Copy, Check } from 'lucide-react'

export default function EnrollMfaPage() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)

  const startEnrollment = useCallback(async () => {
    setEnrollError(null)
    setQrCode(null)
    setSecret(null)
    setFactorId(null)
    const supabase = createClient()

    // Clean up any stuck unverified factor before enrolling — a prior
    // incomplete enrollment leaves a pending factor that causes 422 on retry.
    const { data: existing } = await supabase.auth.mfa.listFactors()
    const stale = existing?.all.find(f => f.factor_type === 'totp' && f.status === 'unverified')
    if (stale) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id })
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })

    if (error) {
      setEnrollError(`Could not start MFA enrollment: ${error.message}`)
      return
    }

    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startEnrollment()
  }, [startEnrollment])

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

  async function copySecret() {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (enrollError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-6 text-center space-y-3">
            <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-destructive">{enrollError}</p>
            <Button className="w-full" onClick={startEnrollment}>Try Again</Button>
            <Button variant="outline" className="w-full" onClick={async () => {
              await createClient().auth.signOut()
              window.location.href = '/'
            }}>
              Sign out and try again
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1">
          <div className="flex justify-center mb-3">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Set up two-factor auth</h1>
          <p className="text-sm text-muted-foreground">
            Scan the QR code with Google Authenticator, Authy, or any TOTP app.
          </p>
        </div>

        {/* Mobile tip — can't scan a QR code on the same screen */}
        <div className="md:hidden rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2.5 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">Setting up on your phone?</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
            Copy the setup key below, open your authenticator app, choose <strong>Enter a setup key</strong>, and paste it. The QR code is for scanning from a second device.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">1. Add to authenticator app</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* On mobile: key first (more useful), QR second. On desktop: QR first. */}
            <div className="flex flex-col-reverse md:flex-col gap-3">
              {secret && (
                <div className="space-y-1.5">
                  <CardDescription className="text-xs">
                    <span className="md:hidden">Setup key. Copy it into your authenticator app:</span>
                    <span className="hidden md:inline">Can&apos;t scan? Enter this key manually:</span>
                  </CardDescription>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-1.5 text-xs font-mono break-all">{secret}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={copySecret}
                      aria-label="Copy secret"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <CardDescription className="text-xs mb-2 md:hidden">Or scan from a second device:</CardDescription>
                {qrCode ? (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCode} alt="TOTP QR code" className="h-44 w-44 rounded border bg-white p-1" />
                  </div>
                ) : (
                  <div className="h-44 w-44 mx-auto rounded border bg-muted animate-pulse" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">2. Enter the 6-digit code</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="totp-code">Authentication code</Label>
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
                  autoComplete="one-time-code"
                  className="font-mono tracking-widest text-center text-lg"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading || !factorId || code.replace(/\s/g, '').length < 6}>
                {loading ? 'Verifying…' : 'Verify & Enable'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground px-2">
          Save your authenticator backup codes in a password manager in case you lose access to your device.
        </p>
      </div>
    </main>
  )
}
