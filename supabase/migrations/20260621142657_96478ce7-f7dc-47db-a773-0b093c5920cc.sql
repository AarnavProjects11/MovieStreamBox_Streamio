CREATE TYPE public.media_type AS ENUM ('torrent', 'direct_link');

CREATE TABLE public.media_streams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_url TEXT NOT NULL,
  stream_url TEXT NOT NULL,
  type public.media_type NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_streams TO authenticated;
GRANT ALL ON public.media_streams TO service_role;

ALTER TABLE public.media_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own streams"
  ON public.media_streams FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX media_streams_user_created_idx ON public.media_streams (user_id, created_at DESC);