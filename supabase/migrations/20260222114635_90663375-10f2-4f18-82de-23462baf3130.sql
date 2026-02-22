
-- Add endurance_race to session_type_enum
ALTER TYPE session_type_enum ADD VALUE IF NOT EXISTS 'endurance_race';

-- Add parent_session_id to v2_sessions for hour sub-sessions
ALTER TABLE public.v2_sessions 
ADD COLUMN parent_session_id uuid REFERENCES public.v2_sessions(id) ON DELETE CASCADE;

-- Index for efficient child session lookups
CREATE INDEX idx_v2_sessions_parent ON public.v2_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;
