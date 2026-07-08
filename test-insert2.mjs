import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const { data, error } = await supabase.from('projects').insert({
    session_id: "test-session-12345",
    state: { phase: 'search', projectName: "Test RLS", placeName: "Test Location" }
  }).select();
  
  if (error) {
    console.error("INSERT FAILED:", error);
  } else {
    console.log("INSERT SUCCEEDED:", data);
  }
}
testInsert();
