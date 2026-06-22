const apiKey = process.env.GEMINI_API_KEY || "";
const model = 'gemini-2.5-flash-image';

async function run() {
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Generate a floor plan for a 100x20 North-facing modern house.' }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
      responseModalities: ['image', 'text']
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  console.log('Fetching:', url);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
