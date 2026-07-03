const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim().replace(/['"]/g, '');
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkConnection() {
  console.log("Checking Supabase connection to:", supabaseUrl);
  try {
    const { data, error } = await supabase.from('projects').select('id').limit(1);
    if (error) {
      console.error("Connection failed with error:", error);
    } else {
      console.log("Connection successful! Supabase is working.");
      console.log("Sample data fetched:", data);
    }
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

checkConnection();
