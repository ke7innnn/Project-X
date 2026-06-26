-- ============================================================
-- ARCHITECT AI — FRESH DATABASE SETUP
-- Run this entire script in Supabase → SQL Editor
-- This will DELETE all old data and set up fresh tables
-- ============================================================

-- ── STEP 1: Drop all old tables & triggers ────────────────────────────────────

DROP TABLE IF EXISTS public.project_images CASCADE;
DROP TABLE IF EXISTS public.edit_projects CASCADE;
DROP TABLE IF EXISTS public.render3d_projects CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;

-- ── STEP 2: Create the updated_at trigger function ────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── STEP 3: Main projects table (lean metadata only, no base64 blobs) ─────────

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_all" ON public.projects FOR SELECT USING (true);
CREATE POLICY "projects_insert_all" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "projects_update_all" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "projects_delete_all" ON public.projects FOR DELETE USING (true);

CREATE TRIGGER projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── STEP 4: Project images table (stores large base64 blobs separately) ───────
-- This keeps the main projects row small (<50KB) so upserts never fail.
-- Floorplan base64 strings are ~500KB–1MB each; renders can be 1–2MB.

CREATE TABLE public.project_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  current_floor_plan TEXT,           -- base64 of the current active floor plan
  final_render TEXT,                 -- base64 of the latest 3D render
  generated_options JSONB DEFAULT '[]'::jsonb, -- array of base64 strings (draft options)
  render_history JSONB DEFAULT '[]'::jsonb,    -- array of { id, base64, style, sunpath }
  last_uploaded_image TEXT,          -- base64 of any user-uploaded reference image
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_images_select_all" ON public.project_images FOR SELECT USING (true);
CREATE POLICY "project_images_insert_all" ON public.project_images FOR INSERT WITH CHECK (true);
CREATE POLICY "project_images_update_all" ON public.project_images FOR UPDATE USING (true);
CREATE POLICY "project_images_delete_all" ON public.project_images FOR DELETE USING (true);

CREATE TRIGGER project_images_updated_at
BEFORE UPDATE ON public.project_images
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── STEP 5: Verify tables exist ────────────────────────────────────────────────

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
