-- 0046 — settings.suta_rate default must exclude the RSF surcharge
--
-- The column defaulted to 0.041, which is the COMBINED rate from the NY UI rate
-- notice (4.025% UI + 0.075% RSF). But the app computes RSF separately from
-- tax_rates.rsf_rate on the NYS-45, so a settings.suta_rate of 0.041 would
-- double-count RSF and assess 4.175% overall.
--
-- No data fix is needed: settings is a singleton whose live row is already
-- correct at 0.04025 (set 2026-07-18, and migration 0040 backfilled the stubs
-- generated at the old rate). This only closes the latent path where a rebuild
-- from schema.sql, or any future INSERT that omits the column, silently picks up
-- the wrong rate.

alter table public.settings
  alter column suta_rate set default 0.04025;

comment on column public.settings.suta_rate is
  'Base UI contribution rate from the annual NY UI rate notice, EXCLUDING the 0.075% Re-employment Service Fund surcharge. RSF is computed separately from tax_rates.rsf_rate. Update each year when the rate notice arrives (NY DOL mails these in March).';
