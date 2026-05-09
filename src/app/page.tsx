import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/auth/LoginForm'

export default async function LoginPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single()
    if (!profile) redirect('/api/auth/sign-out')
    redirect('/dashboard')
  }
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Image
              src="/icon-192.png"
              alt="Persad Pay"
              width={72}
              height={72}
              className="rounded-2xl"
              priority
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Persad Pay</h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  )
}
