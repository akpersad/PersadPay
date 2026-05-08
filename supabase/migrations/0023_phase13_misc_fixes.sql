-- Phase 13.7 — Fix new-hire report URL (labor.ny.gov/newhire → nynewhire.com)
-- Phase 13.10 — Add FUTA credit-reduction-list note to December "Verify tax rates" reminder

update public.onboarding_checklist
  set detail = 'Report within 20 days of hire at https://www.nynewhire.com/ (NY Tax Law § 171-h). Reference: https://www.tax.ny.gov/bus/newhire/. Submit IT-2104 with the new-hire box checked, OR Form IT-2104.1, OR upload via the online portal.'
  where label ilike '%new hire report%' or label ilike '%file new hire%';

update public.reminders
  set description = concat(
    description,
    E'\n\nAlso re-verify FUTA rate against the DOL credit-reduction list — NY''s status can change year-to-year. '
    'Page: https://oui.doleta.gov/unemploy/futa_credit.asp'
  )
  where title ilike 'Verify 2027 tax rates';
