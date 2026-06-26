/**
 * DEEP DIAGNOSTIC TEST for Gemini Image Generation with Image Input
 * Run: node scratch/test-gemini-image-input.mjs
 *
 * Tests 3 scenarios in order:
 *  1. Raw image URL as base64 → Gemini 3.1 flash image generation
 *  2. Simplified prompt (just "draw a floor plan in this shape")
 *  3. Check if image input is even being accepted by the model
 */

import fs from 'fs';
import https from 'https';
import http from 'http';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE';
const MODEL = 'gemini-3.1-flash-image-preview';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// A simple bat-shaped kite Pexels image (public)
const TEST_IMAGE_URL = 'https://images.pexels.com/photos/1154510/pexels-photo-1154510.jpeg?auto=compress&cs=tinysrgb&w=800';

// ── Helpers ────────────────────────────────────────────────────────────────

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TestBot/1.0)' }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function callGeminiRaw(parts, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Parts being sent:', parts.map(p => {
    if (p.text) return `TEXT(${p.text.length} chars)`;
    if (p.inlineData) return `IMAGE(mimeType=${p.inlineData.mimeType}, base64Size=${p.inlineData.data.length})`;
    return JSON.stringify(Object.keys(p));
  }));

  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.7,
      responseModalities: ['image', 'text'],
    }
  });

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(60000),
  });

  const responseText = await response.text();
  console.log(`\nHTTP Status: ${response.status}`);

  if (!response.ok) {
    console.error('❌ API ERROR:', responseText.substring(0, 2000));
    return null;
  }

  const data = JSON.parse(responseText);
  const candidates = data.candidates || [];
  console.log('Candidates:', candidates.length);

  for (const c of candidates) {
    const finishReason = c.finishReason;
    console.log('Finish reason:', finishReason);
    if (c.content?.parts) {
      for (const p of c.content.parts) {
        if (p.text) console.log('Text response:', p.text.substring(0, 200));
        if (p.inlineData) {
          const outPath = `/Users/kevinpimenta/Desktop/Project X/scratch/test_output_${label.replace(/\s/g,'_')}.png`;
          fs.writeFileSync(outPath, Buffer.from(p.inlineData.data, 'base64'));
          console.log(`✅ IMAGE GENERATED → saved to: ${outPath}`);
        }
      }
    }
    if (c.safetyRatings) {
      console.log('Safety ratings:', JSON.stringify(c.safetyRatings));
    }
  }

  return data;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching test image from Pexels...');
  let imageBuffer;
  try {
    imageBuffer = await fetchBuffer(TEST_IMAGE_URL);
    console.log('✅ Image fetched, size:', imageBuffer.length, 'bytes');
  } catch (e) {
    console.error('❌ Failed to fetch image:', e.message);
    process.exit(1);
  }

  const imageBase64 = imageBuffer.toString('base64');
  const imagePart = { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } };

  // ── TEST 1: Minimal prompt with image ─────────────────────────────────
  await callGeminiRaw(
    [
      { text: 'Draw a 2D architectural floor plan in the EXACT shape shown in the image. The building walls must follow the outline of this shape. Black lines on white background.' },
      imagePart,
    ],
    'Test1_minimal_prompt_with_image'
  );

  // ── TEST 2: Text ONLY (no image) to confirm it defaults to leaf ────────
  await callGeminiRaw(
    [
      { text: 'Draw a 2D architectural floor plan in the shape of a bat with wings spread. Black lines on white background. AutoCAD style.' },
    ],
    'Test2_text_only_no_image'
  );

  // ── TEST 3: Image FIRST then text (different part order) ───────────────
  await callGeminiRaw(
    [
      imagePart,
      { text: 'Draw a 2D architectural floor plan using the EXACT same outer shape/silhouette as the object in this image. The exterior wall of the floor plan must match this shape. Black lines on white background.' },
    ],
    'Test3_image_first_then_text'
  );

  console.log('\n✅ All tests complete. Check scratch/ for output images.');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
