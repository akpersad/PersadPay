import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_ONLY_PATHS = ['/stubs/new', '/reminders', '/filings', '/hysa', '/calendar', '/documents']
// Sub-paths under ADMIN_ONLY_PATHS that employees are permitted to access
const EMPLOYEE_ACCESSIBLE_PATHS = ['/documents/sick-leave-summary']
const PUBLIC_PATHS = ['/', '/manifest.webmanifest', '/sw.js', '/auth/reset-password', '/auth/confirm']
// Vercel Cron calls arrive with `Authorization: Bearer CRON_SECRET` and no
// user session. They must bypass the login redirect below or they bounce to
// the login page before reaching the handler. The route enforces its own
// auth and fails closed: 401 on a wrong/missing secret, 500 when unset.
const CRON_PATHS = ['/api/reminders/send-emails']
// MFA pages need authenticated session but are accessible before AAL2 is satisfied
const MFA_PATHS = ['/auth/enroll-mfa', '/auth/verify-mfa', '/auth/set-password']

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && !PUBLIC_PATHS.includes(pathname) && !CRON_PATHS.includes(pathname)) {
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated users hitting / are intentionally NOT redirected here.
  // The login form handles the post-login redirect explicitly.
  // Doing it in the proxy creates a redirect loop when getUser() behaves
  // inconsistently between the proxy and the layout.

  // MFA enforcement — skip for public paths and the MFA pages themselves.
  // API routes are enforced too (they serve the same payroll data as pages);
  // exceptions: sign-out must work at aal1 so a stuck user can escape, and
  // the cron route authenticates via CRON_SECRET with no user session (so the
  // `user &&` gate already skips it).
  const isApi = pathname.startsWith('/api/')
  const MFA_EXEMPT_API_PATHS = ['/api/auth/sign-out']
  if (
    user &&
    !MFA_PATHS.includes(pathname) &&
    !PUBLIC_PATHS.includes(pathname) &&
    !MFA_EXEMPT_API_PATHS.includes(pathname)
  ) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aalData && aalData.currentLevel === 'aal1') {
      if (isApi) {
        // No redirects for APIs — fail closed with a machine-readable error
        return NextResponse.json(
          { error: 'Multi-factor authentication required' },
          { status: 401 },
        )
      }
      if (aalData.nextLevel === 'aal2') {
        // Factor enrolled but not yet verified for this session
        return NextResponse.redirect(new URL('/auth/verify-mfa', request.url))
      }
      // No factor enrolled — force enrollment
      return NextResponse.redirect(new URL('/auth/enroll-mfa', request.url))
    }
    // currentLevel === 'aal2' → fully authenticated, proceed
  }

  // Role-based guard for admin-only paths
  const isEmployeeAccessible = EMPLOYEE_ACCESSIBLE_PATHS.some(p => pathname.startsWith(p))
  if (user && !isEmployeeAccessible && ADMIN_ONLY_PATHS.some(p => pathname.startsWith(p))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
