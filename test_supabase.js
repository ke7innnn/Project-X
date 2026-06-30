const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  console.log("Fetching...");
  const t0 = Date.now();
  const { data, error } = await supabase.from('projects').select('fake_column').limit(1);
  console.log("Time:", Date.now() - t0, "ms");
  console.log("Error:", error);
}
test();
