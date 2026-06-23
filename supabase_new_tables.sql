-- ============================================================
-- Edit Projects Table (for direct floor plan edits only)
-- ============================================================
CREATE TABLE public.edit_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.edit_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
  ON public.edit_projects FOR SELECT
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON public.edit_projects FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON public.edit_projects FOR UPDATE
  USING (true);

CREATE TRIGGER edit_projects_updated_at
BEFORE UPDATE ON public.edit_projects
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 3D Render Projects Table (for direct 3D renders only)
-- ============================================================
CREATE TABLE public.render3d_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.render3d_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
  ON public.render3d_projects FOR SELECT
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON public.render3d_projects FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON public.render3d_projects FOR UPDATE
  USING (true);

CREATE TRIGGER render3d_projects_updated_at
BEFORE UPDATE ON public.render3d_projects
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
