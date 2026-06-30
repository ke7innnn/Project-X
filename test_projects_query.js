const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
  return acc;
}, {});

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
  const { data, error } = await supabase
    .from('projects')
    .select('session_id, updated_at, projectName:state->>projectName, placeName:state->>placeName, isDeleted:state->>isDeleted')
    .order('updated_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error("ERROR:", error);
  } else {
    console.log("SUCCESS. Row count:", data.length);
    console.log("First row:", data[0]);
  }
}
test();
