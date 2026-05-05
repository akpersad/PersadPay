-- Onboarding reminder: switch the Resend FROM address from the sandbox
-- sender (onboarding@resend.dev) back to payroll@persadpay.com once the
-- domain is purchased and verified in Resend.
-- Source: lib/email.ts (FROM constant)

insert into public.onboarding_checklist (label, detail, completed, sort_order)
select
  'Switch email FROM to payroll@persadpay.com',
  'Currently using Resend''s sandbox sender (onboarding@resend.dev) which only delivers to addresses verified on the Resend account. Once persadpay.com is purchased AND verified in Resend (SPF/DKIM DNS records), update the FROM constant in src/lib/email.ts to ''Persad Pay <payroll@persadpay.com>''.',
  false,
  coalesce((select max(sort_order) from public.onboarding_checklist), 0) + 1;
