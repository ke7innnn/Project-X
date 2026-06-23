const fs = require('fs');
const path = require('path');

// Simulate the fetchImageAsBase64 function
async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { data: Buffer.from(buffer).toString('base64'), mimeType };
}

// Simulate callGemini
async function callGemini(options) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

  const { model, temperature = 0.7, systemPrompt, timeoutMs = 30000 } = options;
  const contents = options._customContents;

  const requestBody = {
    contents,
    generationConfig: {
      temperature,
      responseModalities: ['image', 'text'],
    },
  };

  if (systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${model}): ${response.status} — ${errorText}`);
  }

  return await response.json();
}

async function run() {
  const natureImageUrl = 'https://images.pexels.com/photos/1072179/pexels-photo-1072179.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'; // Sample leaf image from Pexels
  const natureImageDescription = 'green leaf';
  const collectedParameters = {
    plotWidth: 10,
    plotHeight: 15,
    floors: 1,
    rooms: ['bedroom', 'kitchen', 'living room'],
  };

  const descriptionToUse = natureImageDescription || 'organic geometric shape';
  const prompt = `Generate a clean, high-contrast, black-and-white 2D CAD floor plan. Grid size: ${collectedParameters.plotWidth}x${collectedParameters.plotHeight} meters. Include: ${collectedParameters.rooms.join(', ')}. The layout must be inspired by the structure of: ${descriptionToUse}.`;

  console.log('Prompt:', prompt);

  // Load CAD style reference image
  let cadStyleBase64;
  let cadStyleMime = 'image/png';
  try {
    const cadStylePath = path.join(__dirname, '..', 'public', 'cad-style-reference.png');
    if (fs.existsSync(cadStylePath)) {
      cadStyleBase64 = fs.readFileSync(cadStylePath).toString('base64');
      console.log('Loaded CAD style reference image. Size:', cadStyleBase64.length);
    } else {
      console.log('CAD style reference image not found at:', cadStylePath);
    }
  } catch (err) {
    console.error('Failed to load CAD style reference:', err);
  }

  // Resolve reference image
  let refImageBase64;
  let refImageMime = 'image/jpeg';
  try {
    console.log('Fetching Pexels image as base64...');
    const fetched = await fetchImageAsBase64(natureImageUrl);
    refImageBase64 = fetched.data;
    refImageMime = fetched.mimeType;
    console.log('Fetched nature image. Size:', refImageBase64.length);
  } catch (err) {
    console.error('Failed to fetch nature image:', err);
  }

  const buildParts = () => {
    const parts = [{ text: prompt }];
    if (cadStyleBase64) {
      parts.push({ inlineData: { mimeType: cadStyleMime, data: cadStyleBase64 } });
    }
    if (refImageBase64) {
      parts.push({ inlineData: { mimeType: refImageMime, data: refImageBase64 } });
    }
    return parts;
  };

  const promises = [0, 1].map((_, i) =>
    new Promise((resolve, reject) =>
      setTimeout(async () => {
        try {
          console.log(`[Variation ${i}] Starting Gemini call...`);
          const res = await callGemini({
            model: 'gemini-3.1-flash-image-preview',
            temperature: 0.9,
            _customContents: [{ role: 'user', parts: buildParts() }],
          });
          const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
          if (!part?.inlineData?.data) throw new Error('No image in response');
          console.log(`[Variation ${i}] Succeeded!`);
          resolve(part.inlineData.data);
        } catch (e) {
          console.error(`[Variation ${i}] Failed:`, e.message);
          reject(e);
        }
      }, i * 500)
    )
  );

  const results = await Promise.allSettled(promises);
  console.log('All completed. Results:', results.map(r => r.status));
}

run();
