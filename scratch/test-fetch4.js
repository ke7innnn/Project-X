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
  console.log("fetching state of one project...");
  const { data, error } = await supabase.from('projects').select('session_id, updated_at, state').limit(1);
  if (data && data[0]) {
    console.log("State size:", JSON.stringify(data[0].state).length, "bytes");
  } else {
    console.log("No data or error:", error);
  }
}
test();
