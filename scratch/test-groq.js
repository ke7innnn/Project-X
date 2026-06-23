const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const keys = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (match) {
    keys[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const groqKeys = [keys.GROQ_API_KEY, keys.GROQ_API_KEY_FALLBACK].filter(Boolean);

async function testKey(key, name) {
  console.log(`\nTesting ${name}: ${key.substring(0, 10)}...`);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 10
      })
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log('Response:', text.substring(0, 300));
  } catch (err) {
    console.error('Error:', err);
  }
}

async function run() {
  for (let i = 0; i < groqKeys.length; i++) {
    await testKey(groqKeys[i], `Key ${i + 1}`);
  }
}

run();
