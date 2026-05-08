import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft } from 'lucide-react'
import { formatDate } from '@/lib/dates'
import type { Profile, AuditLogEntry } from '@/lib/types'

const HIDDEN_FIELDS = new Set(['updated_at', 'id'])

export default async function SettingsHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: entries } = await supabase
    .from('audit_log')
    .select('*')
    .eq('table_name', 'settings')
    .order('created_at', { ascending: false })
    .limit(50)

  // Look up actor names in one round trip
  const actorIds = Array.from(
    new Set((entries ?? []).map(e => e.actor_id).filter(Boolean) as string[])
  )
  const { data: actors } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', actorIds)
    : { data: [] }
  const actorMap = new Map((actors ?? []).map(a => [a.id, a.full_name]))

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg md:max-w-3xl mx-auto space-y-4">
      <Link href="/settings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Settings
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Settings change history</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Forensic record of every settings update. Captured by Postgres trigger.
        </p>
      </div>

      {!entries?.length ? (
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(entries as AuditLogEntry[]).map(entry => {
            const diff = computeDiff(entry.before_data, entry.after_data)
            const actorName = entry.actor_id ? actorMap.get(entry.actor_id) ?? 'Unknown' : 'System'
            return (
              <Card key={entry.id}>
                <CardContent className="py-3 px-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {formatTimestamp(entry.created_at)} · {actorName}
                    </span>
                    <span className="text-muted-foreground uppercase tracking-wide text-[10px]">
                      {entry.action}
                    </span>
                  </div>
                  {entry.action === 'INSERT' && (
                    <p className="text-xs text-muted-foreground">Settings row created.</p>
                  )}
                  {entry.action === 'UPDATE' && diff.length === 0 && (
                    <p className="text-xs text-muted-foreground">No field changes recorded (timestamp-only update).</p>
                  )}
                  {entry.action === 'UPDATE' && diff.length > 0 && (
                    <div className="space-y-1">
                      {diff.map(d => (
                        <div key={d.field} className="text-xs">
                          <span className="font-medium">{d.field}</span>
                          <span className="text-muted-foreground"> changed: </span>
                          <span className="line-through text-muted-foreground">{d.before}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span>{d.after}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface DiffEntry { field: string; before: string; after: string }

function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffEntry[] {
  if (!before || !after) return []
  const out: DiffEntry[] = []
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)])
  for (const k of keys) {
    if (HIDDEN_FIELDS.has(k)) continue
    const b = JSON.stringify(before[k] ?? null)
    const a = JSON.stringify(after[k] ?? null)
    if (b !== a) {
      out.push({ field: k, before: b, after: a })
    }
  }
  return out
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const datePart = formatDate(d.toISOString().slice(0, 10))
  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })
  return `${datePart} ${time}`
}
