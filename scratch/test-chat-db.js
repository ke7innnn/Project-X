const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (match) {
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const sessId = '9de2e138-aa71-4bc9-acf9-7baa29ea63a8';
  console.log(`Fetching project session: ${sessId}`);
  
  const { data, error } = await supabase
    .from('projects')
    .select('state')
    .eq('session_id', sessId)
    .single();

  if (error) {
    console.error('Database error:', error);
    return;
  }

  const state = data.state;
  console.log('Project Name:', state.projectName);
  console.log('Conversation History Length:', state.conversationHistory.length);

  const rawMessages = state.conversationHistory.map((msg) => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map((p) => p.text).join('\n')
  }));

  const messages = [
    {
      role: 'system',
      content: `You are an architect...`
    },
    ...rawMessages,
    { role: 'user', content: 'okay' }
  ];

  console.log('\nSending messages to Groq...');
  
  const groqApiKeys = [env.GROQ_API_KEY, env.GROQ_API_KEY_FALLBACK].filter(Boolean);
  
  for (let i = 0; i < groqApiKeys.length; i++) {
    const key = groqApiKeys[i];
    try {
      const startTime = Date.now();
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages,
          temperature: 0.7,
          max_tokens: 2048,
          response_format: { type: 'json_object' }
        })
      });
      
      console.log(`Key ${i + 1} Status: ${res.status} | Time: ${Date.now() - startTime}ms`);
      const bodyText = await res.text();
      console.log('Body:', bodyText.substring(0, 1000));
    } catch (e) {
      console.error(`Key ${i + 1} Error:`, e);
    }
  }
}

run();
