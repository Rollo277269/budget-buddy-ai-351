
-- Create storage bucket for commessa documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documenti-commesse', 'documenti-commesse', false)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to the bucket
CREATE POLICY "Allow public access on documenti-commesse"
ON storage.objects FOR ALL
TO anon, authenticated
USING (bucket_id = 'documenti-commesse')
WITH CHECK (bucket_id = 'documenti-commesse');
