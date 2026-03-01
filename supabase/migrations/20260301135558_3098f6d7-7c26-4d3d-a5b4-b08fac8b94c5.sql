
-- Cache AI-generated session summaries
CREATE TABLE public.v2_session_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.v2_events(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.v2_sessions(id) ON DELETE CASCADE,
  tab_key TEXT NOT NULL, -- 'overall' or session id
  summary_markdown TEXT NOT NULL DEFAULT '',
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, tab_key)
);

ALTER TABLE public.v2_session_summaries ENABLE ROW LEVEL SECURITY;

-- Anyone can read published summaries
CREATE POLICY "Public can view summaries"
  ON public.v2_session_summaries FOR SELECT USING (true);

-- Only admins can insert/update/delete (via service role in edge function)
-- No client-side write policies needed

-- Add highlights_url to v2_sessions
ALTER TABLE public.v2_sessions ADD COLUMN IF NOT EXISTS highlights_url TEXT;
