const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gaonkbzjzreudcztgtdm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhb25rYnpqenJldWRjenRndGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTI3MjUsImV4cCI6MjA5NzY4ODcyNX0.U75SVhFmlXt0UIDexS-o4RQYIuwC-kEmMa08Kd2Xsq4'
);

async function test() {
  console.log("Fetching...");
  const { data, error } = await supabase.from('projects').select('session_id, updated_at, state->projectName, state->placeName, state->isDeleted').order('updated_at', { ascending: false });
  console.log("Data length:", data ? data.length : null);
  console.log("First item:", data && data[0]);
  console.log("Error:", error);
  process.exit();
}

test();
