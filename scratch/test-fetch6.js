const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const env = {};
envLocal.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0]] = parts.slice(1).join('=');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.log("fetching lean fields...");
  const { data, error } = await supabase
    .from('projects')
    .select('session_id, updated_at, projectName:state->>projectName, placeName:state->>placeName')
    .order('updated_at', { ascending: false });
    
  console.log("Projects Count:", data ? data.length : 0);
  if (data && data.length > 0) {
    console.log("First project:", data[0]);
  }
  if (error) console.log("Error:", error);
}
test();
