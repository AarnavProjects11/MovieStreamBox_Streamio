CREATE TABLE public.user_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  manifest_url text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, manifest_url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_addons TO authenticated;
GRANT ALL ON public.user_addons TO service_role;
ALTER TABLE public.user_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own addons" ON public.user_addons FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_id text NOT NULL,
  meta_type text NOT NULL,
  season int NOT NULL DEFAULT 0,
  episode int NOT NULL DEFAULT 0,
  title text NOT NULL,
  poster text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, meta_id, season, episode)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_history TO authenticated;
GRANT ALL ON public.watch_history TO service_role;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own history" ON public.watch_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meta_id text NOT NULL,
  meta_type text NOT NULL,
  title text NOT NULL,
  poster text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, meta_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_items TO authenticated;
GRANT ALL ON public.library_items TO service_role;
ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own library" ON public.library_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);