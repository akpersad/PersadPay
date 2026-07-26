import type { SupabaseClient } from '@supabase/supabase-js'
import { hysaAmountForStub } from './tax'
import { todayNY } from './dates'
import type { Paystub } from './types'

export async function insertHysaDeposit(
  supabase: SupabaseClient,
  stub: Paystub,
  actorId: string,
) {
  const { total } = hysaAmountForStub(stub)
  return supabase.from('hysa_transactions').insert({
    transaction_type: 'deposit_paystub',
    amount: total,
    paystub_id: stub.id,
    effective_date: todayNY(),
    actor_id: actorId,
  })
}

export async function deleteHysaDepositForStub(
  supabase: SupabaseClient,
  stubId: string,
) {
  return supabase
    .from('hysa_transactions')
    .delete()
    .eq('paystub_id', stubId)
    .eq('transaction_type', 'deposit_paystub')
}

// Replaces any existing withdrawal_filing for this filing and inserts a fresh
// one. Called when the admin marks a filing as paid. Pass amount as a positive
// number; this function negates it.
export async function upsertHysaWithdrawalForFiling(
  supabase: SupabaseClient,
  filingId: string,
  amount: number,
  effectiveDate: string,
  actorId: string,
) {
  await supabase
    .from('hysa_transactions')
    .delete()
    .eq('filing_id', filingId)
    .eq('transaction_type', 'withdrawal_filing')

  if (amount === 0) return
  return supabase.from('hysa_transactions').insert({
    transaction_type: 'withdrawal_filing',
    amount: -Math.abs(amount),
    filing_id: filingId,
    effective_date: effectiveDate,
    actor_id: actorId,
  })
}

export async function deleteHysaWithdrawalForFiling(
  supabase: SupabaseClient,
  filingId: string,
) {
  return supabase
    .from('hysa_transactions')
    .delete()
    .eq('filing_id', filingId)
    .eq('transaction_type', 'withdrawal_filing')
}
