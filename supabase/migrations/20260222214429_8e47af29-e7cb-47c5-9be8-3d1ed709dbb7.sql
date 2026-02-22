ALTER TABLE public.v2_sessions
ADD COLUMN qualifying_session_id UUID REFERENCES public.v2_sessions(id) ON DELETE SET NULL;