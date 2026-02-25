
-- Source definitions: reusable parser configurations
CREATE TABLE public.source_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  url_pattern text NOT NULL DEFAULT '',
  parser_type text NOT NULL DEFAULT 'ai_induced',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_snapshot jsonb,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.source_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage source_definitions"
  ON public.source_definitions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can view active source_definitions"
  ON public.source_definitions FOR SELECT
  USING (status = 'active');

-- Import runs: logs per import attempt with debug data
CREATE TABLE public.import_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_definition_id uuid REFERENCES public.source_definitions(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.v2_events(id) ON DELETE SET NULL,
  url text,
  status text NOT NULL DEFAULT 'running',
  raw_content_preview text,
  extracted_data jsonb,
  mapped_data jsonb,
  validation_errors jsonb DEFAULT '[]'::jsonb,
  log jsonb DEFAULT '[]'::jsonb,
  error_message text,
  sessions_created integer DEFAULT 0,
  entries_created integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage import_runs"
  ON public.import_runs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_source_definitions_updated_at
  BEFORE UPDATE ON public.source_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
