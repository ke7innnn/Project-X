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

async function migrate() {
  console.log("Fetching all session_ids...");
  const { data: sessions, error } = await supabase.from('projects').select('session_id');
  if (error || !sessions) {
    console.error("Failed to fetch sessions", error);
    return;
  }
  console.log(`Found ${sessions.length} projects. Processing one by one to avoid timeout...`);

  for (const s of sessions) {
    const sessionId = s.session_id;
    console.log(`Processing ${sessionId}...`);
    
    // Fetch full state for just this one project
    const { data: projectData, error: pError } = await supabase
      .from('projects')
      .select('state')
      .eq('session_id', sessionId)
      .single();
      
    if (pError || !projectData || !projectData.state) {
      console.error(`  Failed to fetch state for ${sessionId}`, pError);
      continue;
    }
    
    const state = projectData.state;
    const stateStr = JSON.stringify(state);
    
    // If state is small, it's already migrated or lean
    if (stateStr.length < 50000) {
      console.log(`  State is small (${stateStr.length} bytes). Skipping.`);
      continue;
    }
    
    console.log(`  State is LARGE (${stateStr.length} bytes). Migrating...`);
    
    const {
      currentFloorPlan, previousFloorPlan, finalRender,
      generatedOptions, lastUploadedImage,
      renderHistory,
      ...rest
    } = state;
    
    // Strip blobs from conversation history
    const history = Array.isArray(rest.conversationHistory) ? rest.conversationHistory : [];
    const cleanHistory = history.map(msg => {
      if (!msg.customType) return msg;
      if (msg.customType === 'floorplan-drafts') {
        return { ...msg, customData: { options: [] } };
      }
      if (msg.customType === 'floorplan-edit') {
        return { ...msg, customData: { instruction: msg.customData?.instruction || '' } };
      }
      if (msg.customType === 'uploaded-image') {
        return { ...msg, customData: { description: msg.customData?.description || '' } };
      }
      return msg;
    });
    
    rest.conversationHistory = cleanHistory;
    rest.hasFloorPlan = !!currentFloorPlan;
    rest.hasFinalRender = !!finalRender;
    rest.generatedOptionsCount = Array.isArray(generatedOptions) ? generatedOptions.length : 0;
    
    // 1. Insert into project_images
    const { error: imgError } = await supabase.from('project_images').upsert({
      session_id: sessionId,
      current_floor_plan: currentFloorPlan || null,
      final_render: finalRender || null,
      generated_options: Array.isArray(generatedOptions) ? generatedOptions : [],
      render_history: Array.isArray(renderHistory) ? renderHistory : [],
      last_uploaded_image: lastUploadedImage || null
    }, { onConflict: 'session_id' });
    
    if (imgError) {
      console.error(`  Failed to save project_images for ${sessionId}`, imgError);
      continue;
    }
    
    // 2. Update projects with lean state
    const { error: upError } = await supabase.from('projects').update({
      state: rest
    }).eq('session_id', sessionId);
    
    if (upError) {
      console.error(`  Failed to update lean state for ${sessionId}`, upError);
    } else {
      console.log(`  Successfully migrated ${sessionId}`);
    }
  }
  
  console.log("Migration complete!");
}

migrate();
