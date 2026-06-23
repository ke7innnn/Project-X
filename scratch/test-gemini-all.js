const apiKey = process.env.GEMINI_API_KEY || "";

async function testModel(model) {
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Generate a simple black and white floor plan.' }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  console.log(`\nFetching: ${model}`);
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log(`Status: ${response.status} | Time taken (ms): ${Date.now() - startTime}`);
    if (!response.ok) {
      console.log('Error Body:', await response.text());
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

async function run() {
  await testModel('gemini-2.5-flash-image');
  await testModel('gemini-3.1-flash-image-preview');
  await testModel('gemini-3-pro-image');
}

run();
