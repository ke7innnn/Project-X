const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gaonkbzjzreudcztgtdm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhb25rYnpqenJldWRjenRndGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTI3MjUsImV4cCI6MjA5NzY4ODcyNX0.U75SVhFmlXt0UIDexS-o4RQYIuwC-kEmMa08Kd2Xsq4'
);

async function restore() {
  const { data, error } = await supabase.from('projects').select('session_id, state');
  if (error) {
    console.error(error);
    return;
  }
  
  let restored = 0;
  for (const p of data) {
    if (p.state && p.state.isDeleted) {
      delete p.state.isDeleted;
      await supabase.from('projects').update({ state: p.state }).eq('session_id', p.session_id);
      restored++;
    }
  }
  console.log(`Restored ${restored} projects!`);
}

restore();
