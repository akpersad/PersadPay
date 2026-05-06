-- Reorder onboarding_checklist into a logical / priority order:
--   Group 1 (1–2):  Get registered as an employer (legal prerequisite)
--   Group 2 (3–8):  At-hire compliance (must be done at or before first day)
--   Group 3 (9–11): Get the Persad Pay app usable
--   Group 4 (12–15): Email infrastructure (lowest priority)

-- Group 1
update public.onboarding_checklist set sort_order = 1  where label = 'Apply for Federal EIN at irs.gov';
update public.onboarding_checklist set sort_order = 2  where label = 'Register with New York State';

-- Group 2 — at-hire (LS-59 → W-4 → IT-2104 → PFL waiver → sick policy → new-hire report)
update public.onboarding_checklist set sort_order = 3  where label = 'Provide signed LS-59 Wage Notice to employee';
update public.onboarding_checklist set sort_order = 4  where label = 'Have employee complete Federal W-4';
update public.onboarding_checklist set sort_order = 5  where label = 'Have employee complete NY IT-2104';
update public.onboarding_checklist set sort_order = 6  where label = 'Obtain signed PFL-Waiver form (employee <20 hrs/week)';
update public.onboarding_checklist set sort_order = 7  where label = 'Print, sign, and file the Sick Leave Policy';
update public.onboarding_checklist set sort_order = 8  where label = 'File new hire report with NY';

-- Group 3 — app setup
update public.onboarding_checklist set sort_order = 9  where label = 'Create Supabase user accounts for all three users';
update public.onboarding_checklist set sort_order = 10 where label = 'Fill out all fields in Persad Pay Settings';
update public.onboarding_checklist set sort_order = 11 where label = 'Confirm quarterly reminders are seeded in Reminders tab';

-- Group 4 — email infrastructure
update public.onboarding_checklist set sort_order = 12 where label = 'Purchase persadpay.com domain';
update public.onboarding_checklist set sort_order = 13 where label = 'Add Vercel DNS records to domain registrar';
update public.onboarding_checklist set sort_order = 14 where label = 'Sign up for Resend and verify persadpay.com';
update public.onboarding_checklist set sort_order = 15 where label = 'Switch email FROM to payroll@persadpay.com';
