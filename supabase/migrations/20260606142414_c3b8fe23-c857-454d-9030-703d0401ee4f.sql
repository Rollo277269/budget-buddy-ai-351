ALTER TABLE public.ui_text_overrides REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ui_text_overrides;