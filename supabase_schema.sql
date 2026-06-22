-- Create the projects table to store session data
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT UNIQUE NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Row Level Security) but allow anonymous access since we don't have auth yet
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
  ON public.projects FOR SELECT
  USING (true);

CREATE POLICY "Enable insert for all users"
  ON public.projects FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Enable update for all users"
  ON public.projects FOR UPDATE
  USING (true);

-- Create an updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the projects table
CREATE TRIGGER projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
