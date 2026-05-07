import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate, formatDateRange } from '@/lib/dates'
import { AddTransactionDialog } from '@/components/hysa/AddTransactionDialog'
import { ReconcileForm } from '@/components/hysa/ReconcileForm'
import { TrendingUp, TrendingDown, PiggyBank } from 'lucide-react'
import type { Profile, Settings, HysaTransactionWithRefs } from '@/lib/types'

const TYPE_LABELS: Record<string, string> = {
  deposit_paystub:   'Stub deposit',
  deposit_manual:    'Manual deposit',
  withdrawal_filing: 'Filing payment',
  withdrawal_manual: 'Manual withdrawal',
  balance_correction:'Correction',
}

const TYPE_BADGE: Record<string, string> = {
  deposit_paystub:   'bg-green-100 text-green-800',
  deposit_manual:    'bg-blue-100 text-blue-800',
  withdrawal_filing: 'bg-red-100 text-red-800',
  withdrawal_manual: 'bg-orange-100 text-orange-800',
  balance_correction:'bg-gray-100 text-gray-800',
}

function filingLabel(tx: HysaTransactionWithRefs): string {
  if (!tx.filings) return 'Filing'
  const { filing_type, tax_year, quarter } = tx.filings
  if (filing_type === 'Schedule H') return `Schedule H ${tax_year}`
  if (quarter) return `${filing_type} Q${quarter} ${tax_year}`
  return `${filing_type} ${tax_year}`
}

function filingHref(tx: HysaTransactionWithRefs): string {
  if (!tx.filings) return '/filings'
  const { filing_type, tax_year, quarter } = tx.filings
  if (filing_type === 'Schedule H') return `/filings/schedule-h/${tax_year}`
  if (filing_type === 'Federal Estimated Tax') return `/filings/federal-estimated-tax/${tax_year}/${quarter}`
  return `/filings/nys-45/${tax_year}/${quarter}`
}

export default async function HYSAPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single<Pick<Profile, 'role'>>()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const [{ data: rawTxs }, { data: settings }] = await Promise.all([
    supabase
      .from('hysa_transactions')
      .select(`
        *,
        paystubs(stub_number, pay_period_start, pay_period_end),
        filings(filing_type, tax_year, quarter)
      `)
      .order('effective_date', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('settings').select('hysa_actual_balance, hysa_actual_balance_at').single<Pick<Settings, 'hysa_actual_balance' | 'hysa_actual_balance_at'>>(),
  ])

  const txs = (rawTxs ?? []) as HysaTransactionWithRefs[]

  // Compute running balance (ascending) using an immutable reduce
  const withBalance = txs.reduce<Array<HysaTransactionWithRefs & { runningBalance: number }>>(
    (acc, tx) => {
      const prev = acc[acc.length - 1]?.runningBalance ?? 0
      return [...acc, { ...tx, runningBalance: Math.round((prev + Number(tx.amount)) * 100) / 100 }]
    },
    [],
  )
  const expectedBalance = withBalance[withBalance.length - 1]?.runningBalance ?? 0

  // YTD stats
  const currentYear = new Date().getFullYear()
  const ytdTxs = txs.filter(tx => tx.effective_date.startsWith(String(currentYear)))
  const ytdDeposits = ytdTxs.filter(tx => Number(tx.amount) > 0).reduce((s, tx) => s + Number(tx.amount), 0)
  const ytdWithdrawals = ytdTxs.filter(tx => Number(tx.amount) < 0).reduce((s, tx) => s + Number(tx.amount), 0)

  // Reverse for display (most recent first)
  const displayTxs = [...withBalance].reverse()

  const actualBalance = settings?.hysa_actual_balance ?? null
  const actualBalanceAt = settings?.hysa_actual_balance_at ?? null
  const discrepancy = actualBalance !== null
    ? Math.round((actualBalance - expectedBalance) * 100) / 100
    : null

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <PiggyBank className="h-5 w-5" />
          HYSA Ledger
        </h1>
        <AddTransactionDialog userId={user.id} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">Expected Balance</p>
            <p className={`text-lg font-semibold mt-0.5 ${expectedBalance < 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(expectedBalance)}
            </p>
            {discrepancy !== null && discrepancy !== 0 && (
              <p className="text-[10px] text-yellow-600 mt-0.5">
                {Math.abs(discrepancy) < 0.01 ? '~$0 discrepancy' : `${formatCurrency(Math.abs(discrepancy))} discrepancy`}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground">
              {actualBalance !== null ? 'Actual Balance' : 'Last Reconciled'}
            </p>
            {actualBalance !== null ? (
              <p className="text-lg font-semibold mt-0.5">{formatCurrency(actualBalance)}</p>
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">Never</p>
            )}
            {actualBalanceAt && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {formatDate(actualBalanceAt.slice(0, 10))}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {currentYear} Deposits
            </p>
            <p className="text-lg font-semibold mt-0.5 text-green-700">{formatCurrency(ytdDeposits)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              {currentYear} Withdrawals
            </p>
            <p className="text-lg font-semibold mt-0.5 text-red-700">{formatCurrency(Math.abs(ytdWithdrawals))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation */}
      <ReconcileForm
        expectedBalance={expectedBalance}
        actualBalance={actualBalance}
        actualBalanceAt={actualBalanceAt}
        userId={user.id}
      />

      {/* Transaction ledger */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">All Transactions</h2>

        {displayTxs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet. Mark a stub HYSA-funded or add a manual entry above.</p>
        ) : (
          <div className="space-y-2">
            {displayTxs.map(tx => (
              <Card key={tx.id}>
                <CardContent className="py-3 px-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE[tx.transaction_type] ?? 'bg-gray-100 text-gray-800'}`}>
                      {TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}
                    </span>
                    <span className={`font-mono text-sm font-semibold ${Number(tx.amount) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {Number(tx.amount) >= 0 ? '+' : ''}{formatCurrency(Number(tx.amount))}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm text-muted-foreground min-w-0">
                      {tx.transaction_type === 'deposit_paystub' && tx.paystubs ? (
                        <Link href={`/stubs/${tx.paystub_id}`} className="hover:text-foreground hover:underline">
                          Stub #{tx.paystubs.stub_number} · {formatDateRange(tx.paystubs.pay_period_start, tx.paystubs.pay_period_end)}
                        </Link>
                      ) : tx.transaction_type === 'withdrawal_filing' && tx.filings ? (
                        <Link href={filingHref(tx)} className="hover:text-foreground hover:underline">
                          {filingLabel(tx)}
                        </Link>
                      ) : (
                        <span>{tx.notes ?? TYPE_LABELS[tx.transaction_type]}</span>
                      )}
                      {tx.notes && tx.transaction_type === 'deposit_paystub' && (
                        <p className="text-xs mt-0.5">{tx.notes}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-muted-foreground">{formatDate(tx.effective_date)}</p>
                      <p className="text-xs text-muted-foreground font-mono">bal {formatCurrency(tx.runningBalance)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
