import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Route handler — can set cookies, so signOut() fully clears the session.
// Used when a server component detects an authenticated user with no profile
// row (manually deleted from Supabase dashboard), which would cause a
// redirect loop between / and /dashboard.
export async function GET() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
