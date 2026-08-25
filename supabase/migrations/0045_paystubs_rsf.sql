-- 0045 — store the Re-employment Service Fund (RSF) accrual per stub
--
-- RSF is a separate NY employer liability: NYS-45 Part A line 5 = line 3
-- (UI taxable wages) x 0.075%. It is assessed every quarter alongside the UI
-- contribution, and NYS-45-I is explicit that it "cannot be used as a credit
-- for the Federal Unemployment Tax Act (FUTA)", so there is no federal recovery.
--
-- calculateNYS45() already computes and displays it correctly, and it has been
-- paid correctly (the $52.76 filed for 2026 Q2 was $51.80 UI + $0.97 RSF).
-- The gap was in the RESERVE: hysaAmountForStub() summed employer FICA + FUTA +
-- SUTA with no RSF term, so the HYSA collected $512.98 against $514.90 owed.
-- Short by $1.92 today, and structurally short by 0.075% of wages forever.
--
-- Same taxable base as SUTA (capped at suta_wage_base), so the backfill below
-- is exact for every existing stub: 2026 YTD gross is $2,574 against a $17,600
-- wage base, so no stub is capped.

alter table public.paystubs
  add column if not exists rsf numeric(10,2) not null default 0;

comment on column public.paystubs.rsf is
  'Employer-side NY Re-employment Service Fund accrual for this stub (NYS-45 Part A line 5). Same taxable base as SUTA. Not withheld from the employee.';

-- Backfill: gross x rsf_rate for the stub''s year, capped at the SUTA wage base
-- on a YTD basis. Written as a per-stub running total so the cap is respected
-- if this is ever re-run on a year that reaches the base.
with ordered as (
  select
    p.id,
    p.gross_pay,
    coalesce(
      sum(p.gross_pay) over (
        partition by date_part('year', p.pay_date)
        order by p.pay_date, p.stub_number
        rows between unbounded preceding and 1 preceding
      ), 0
    ) as ytd_before,
    tr.suta_wage_base,
    tr.rsf_rate
  from public.paystubs p
  join public.tax_rates tr
    on tr.effective_year = date_part('year', p.pay_date)::int
)
update public.paystubs p
set rsf = round(
      greatest(
        0,
        least(o.gross_pay, o.suta_wage_base - o.ytd_before)
      ) * o.rsf_rate,
      2
    )
from ordered o
where p.id = o.id
  and p.rsf = 0;
