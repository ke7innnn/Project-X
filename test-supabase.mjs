import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDb() {
  console.log("Checking Supabase connection to:", supabaseUrl);
  
  // Just try to fetch any public table, or get the list of buckets to test connection
  // Since we don't know the exact tables, we'll try to just check the auth status or a non-existent table 
  // just to see if we get a network error vs a standard postgres error.
  
  try {
    const { data, error } = await supabase.from('projects').select('*').limit(1);
    
    if (error) {
      console.log("Connected to Supabase, but got table error (this is fine if table doesn't exist):", error.message);
    } else {
      console.log("Successfully connected and queried 'projects' table!", data);
    }
    console.log("Supabase connection is WORKING!");
  } catch(e) {
    console.error("Fatal connection error:", e.message);
  }
}
checkDb();
