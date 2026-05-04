CREATE TABLE public.web_vitals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name text NOT NULL,
  value numeric NOT NULL,
  rating text NOT NULL DEFAULT 'good',
  pathname text NOT NULL DEFAULT '',
  session_id text NOT NULL DEFAULT '',
  navigation_type text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_web_vitals_created_at ON public.web_vitals (created_at DESC);
CREATE INDEX idx_web_vitals_metric_name ON public.web_vitals (metric_name);
CREATE INDEX idx_web_vitals_pathname ON public.web_vitals (pathname);

ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public access on web_vitals"
ON public.web_vitals
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);