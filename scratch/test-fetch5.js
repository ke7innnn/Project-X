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
  console.log("fetching all states...");
  let max = 0;
  const { data, error } = await supabase.from('projects').select('session_id, state');
  if (data) {
    data.forEach(r => {
      const size = JSON.stringify(r.state).length;
      if (size > max) max = size;
    });
    console.log(`Successfully fetched ${data.length} projects. Max state size: ${max} bytes`);
  } else {
    console.log("Error:", error);
  }
}
test();
