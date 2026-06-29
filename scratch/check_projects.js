import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('session_id, updated_at, state')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return;
  }

  console.log(`Found ${data.length} projects.`);
  
  const today = new Date().toISOString().split('T')[0];

  data.forEach((proj, idx) => {
    const isToday = proj.updated_at.startsWith(today);
    const state = proj.state || {};
    const phase = state.phase || 'unknown';
    const history = state.conversationHistory || [];
    const name = state.projectName || 'Untitled';
    const place = state.placeName || 'Unknown';
    
    // Check if it has actual chats beyond the welcome message
    const hasChats = history.length > 1;

    console.log(`[${idx + 1}] Session: ${proj.session_id.substring(0, 8)}... | Name: ${name} | Updated: ${proj.updated_at} | Phase: ${phase} | Chats: ${history.length} msgs`);
    if (isToday) {
      console.log(`    -> ⭐ UPDATED TODAY!`);
      if (hasChats) {
        console.log(`    -> 💬 HAS REAL CHATS! (Client likely used this one)`);
      }
    }
  });
}

checkProjects();
