-- Phase 10: year-end task checklist
-- Surfaces on admin dashboard in December and January only.
-- Items are seeded per tax_year on first render by the server component.

CREATE TABLE public.year_end_checklist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tax_year integer NOT NULL,
  label text NOT NULL,
  detail text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Unique items per year
CREATE UNIQUE INDEX year_end_checklist_year_sort ON public.year_end_checklist (tax_year, sort_order);

-- RLS
ALTER TABLE public.year_end_checklist ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins can manage year_end_checklist"
  ON public.year_end_checklist
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.year_end_checklist TO authenticated;
