const apiKey = process.env.GEMINI_API_KEY || "";
const model = 'gemini-3.1-flash-image-preview';

async function callOne(i) {
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
  console.log(`[Call ${i}] Fetching:`, url);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    console.log(`[Call ${i}] Status:`, response.status);
    const text = await response.text();
    if (response.ok) {
      console.log(`[Call ${i}] Success! (Body truncated)`);
    } else {
      console.log(`[Call ${i}] Error body:`, text);
    }
  } catch (err) {
    console.error(`[Call ${i}] Fetch error:`, err);
  }
}

async function run() {
  const promises = [0, 1].map((_, i) =>
    new Promise((resolve) =>
      setTimeout(async () => {
        await callOne(i);
        resolve();
      }, i * 500)
    )
  );
  await Promise.all(promises);
}

run();
