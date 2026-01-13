-- Create guide_progress table for tracking user guide completions
-- Stores: which guides user started, completed, or skipped + ratings

CREATE TABLE IF NOT EXISTS public.guide_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Guide reference
  tour_id text NOT NULL, -- e.g., "dashboard-overview", "manage-inventory"

  -- Progress tracking
  current_step_index integer DEFAULT 0,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  skipped_at timestamp with time zone,

  -- User feedback
  helpful_rating integer CHECK (helpful_rating >= 1 AND helpful_rating <= 5),

  -- Metadata
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  -- Composite unique key: user can have max 1 progress record per tour
  UNIQUE(user_id, tour_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_guide_progress_user_id
ON public.guide_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_guide_progress_tour_id
ON public.guide_progress(tour_id);

CREATE INDEX IF NOT EXISTS idx_guide_progress_completed
ON public.guide_progress(user_id, completed_at)
WHERE completed_at IS NOT NULL;

-- Row-Level Security (RLS)
ALTER TABLE public.guide_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own progress
CREATE POLICY "Users can view their own guide progress"
  ON public.guide_progress
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own progress
CREATE POLICY "Users can insert their own guide progress"
  ON public.guide_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own progress
CREATE POLICY "Users can update their own guide progress"
  ON public.guide_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to execute
GRANT SELECT, INSERT, UPDATE ON public.guide_progress TO authenticated;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_guide_progress_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guide_progress_updated_at_trigger
BEFORE UPDATE ON public.guide_progress
FOR EACH ROW
EXECUTE FUNCTION update_guide_progress_updated_at();

-- Comment for documentation
COMMENT ON TABLE public.guide_progress IS
'Tracks user progress through guide tours.
Stores: guide start/completion/skip events and helpfulness ratings.
One record per user per guide (upsertable).';

COMMENT ON COLUMN public.guide_progress.tour_id IS
'Unique guide identifier (e.g., "dashboard-overview", "manage-inventory")';

COMMENT ON COLUMN public.guide_progress.helpful_rating IS
'1-5 star rating collected at end of guide (optional)';
