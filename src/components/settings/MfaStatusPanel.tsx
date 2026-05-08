import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import type { Profile } from '@/lib/types'

export async function MfaStatusPanel({ profiles }: { profiles: Pick<Profile, 'id' | 'full_name' | 'role'>[] }) {
  const supabase = createAdminClient()
  const { data: rows } = await supabase.rpc('get_verified_mfa_user_ids')
  const enrolledIds = new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-base">MFA Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {profiles.map(p => {
          const enrolled = enrolledIds.has(p.id)
          return (
            <div key={p.id} className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium">{p.full_name}</p>
                <p className="text-xs text-muted-foreground capitalize">{p.role}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {enrolled ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">Enrolled</span>
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-4 w-4 text-yellow-500" />
                    <span className="text-xs text-yellow-700 font-medium">Not enrolled</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
