-- NY UI rates carry 3 decimal places as a percentage (e.g. 4.025%), which is
-- 5 decimal places as a fraction (0.04025). numeric(6,4) silently rounds that
-- to 0.0403, so widen both rate columns. The paystubs_with_tax_year view
-- depends on suta_rate_at_generation and must be dropped and recreated.

drop view public.paystubs_with_tax_year;

alter table public.settings alter column suta_rate type numeric(7,5);
alter table public.paystubs alter column suta_rate_at_generation type numeric(7,5);

create view public.paystubs_with_tax_year as
select
  id,
  stub_number,
  employee_id,
  pay_period_start,
  pay_period_end,
  pay_date,
  hours_worked,
  hourly_rate,
  gross_pay,
  federal_withholding,
  fica_social_security,
  fica_medicare,
  state_withholding,
  sdi,
  pfl,
  employer_fica_ss,
  employer_fica_medicare,
  futa,
  suta,
  net_pay,
  payment_sent,
  zelle_transaction_id,
  stub_sent,
  created_at,
  created_by,
  overtime_hours,
  sick_hours,
  reason,
  hysa_transferred,
  hysa_transferred_at,
  hysa_notes,
  daily_hours,
  dbl_covered_at_generation,
  pfl_covered_at_generation,
  suta_rate_at_generation,
  extract(year from pay_date)::integer as tax_year
from paystubs;

grant select on public.paystubs_with_tax_year to authenticated, service_role;
