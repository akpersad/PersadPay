import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ADMIN_ONLY_PATHS = ['/stubs/new', '/reminders', '/filings', '/hysa', '/calendar', '/documents']
// Sub-paths under ADMIN_ONLY_PATHS that employees are permitted to access
const EMPLOYEE_ACCESSIBLE_PATHS = ['/documents/sick-leave-summary']
const PUBLIC_PATHS = ['/', '/manifest.webmanifest', '/sw.js', '/auth/reset-password', '/auth/confirm']
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

  if (!user && !PUBLIC_PATHS.includes(pathname)) {
    const loginUrl = new URL('/', request.url)
    loginUrl.searchParams.set('returnTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated users hitting / are intentionally NOT redirected here.
  // The login form handles the post-login redirect explicitly.
  // Doing it in the proxy creates a redirect loop when getUser() behaves
  // inconsistently between the proxy and the layout.

  // MFA enforcement — skip for public paths, API routes, and the MFA pages themselves
  if (user && !MFA_PATHS.includes(pathname) && !PUBLIC_PATHS.includes(pathname) && !pathname.startsWith('/api/')) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aalData) {
      if (aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal2') {
        // Factor enrolled but not yet verified for this session
        return NextResponse.redirect(new URL('/auth/verify-mfa', request.url))
      }
      if (aalData.currentLevel === 'aal1' && aalData.nextLevel === 'aal1') {
        // No factor enrolled — force enrollment
        return NextResponse.redirect(new URL('/auth/enroll-mfa', request.url))
      }
      // currentLevel === 'aal2' → fully authenticated, proceed
    }
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
