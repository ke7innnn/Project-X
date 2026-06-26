import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { FLOORPLAN_GENERATION_PROMPT } from '@/lib/prompts';
import sharp from 'sharp';

export const maxDuration = 60;

/**
 * Fetch raw image bytes from a URL.
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ArchitectBot/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Convert a reference photo into a stark BLACK silhouette on WHITE background.
 *
 * Pipeline:
 *  1. Resize to max 800px (enough detail, fast to process)
 *  2. Convert to greyscale
 *  3. Normalise contrast (stretch full range 0–255)
 *  4. Threshold at 128 → pure black/white pixels
 *     (subject becomes BLACK, background becomes WHITE)
 *  5. Invert if image is mostly light (background is naturally white already)
 *
 * The resulting PNG is an unambiguous flat black silhouette that Gemini can
 * trivially trace — no photographed colour detail to confuse it.
 */
async function extractSilhouette(inputBuffer: Buffer): Promise<{ data: string; mimeType: string }> {
  const img = sharp(inputBuffer);
  const metadata = await img.metadata();

  // Determine if the image is mostly bright (background white) or dark
  // We do this by computing the mean of a tiny downscale of the greyscale
  const { data: sampleData } = await sharp(inputBuffer)
    .resize(50, 50, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mean = sampleData.reduce((s, v) => s + v, 0) / sampleData.length;
  const isLightBackground = mean > 128; // true = background is white/bright

  // Max 800px wide for speed; never enlarge tiny images much
  const targetWidth = Math.min(800, Math.max(400, (metadata.width || 800)));

  let pipeline = sharp(inputBuffer)
    .resize({ width: targetWidth, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .normalise();

  // Threshold to pure black/white at mid-point
  // After threshold: values > 128 become white (255), values <= 128 become black (0)
  const silhouetteBuffer = await pipeline
    .threshold(128)
    // If the background is light, the subject is now black — perfect silhouette
    // If the background was dark, we need to invert so subject = black, bg = white
    .negate(isLightBackground ? false : true)
    .png()
    .toBuffer();

  const b64 = silhouetteBuffer.toString('base64');
  console.log(
    `[generate-floorplan] Silhouette extracted — mean brightness: ${mean.toFixed(1)}, isLightBg: ${isLightBackground}, silhouette size: ${b64.length}`
  );
  return { data: b64, mimeType: 'image/png' };
}

export async function POST(request: Request) {
  try {
    const {
      collectedParameters,
      natureImageUrl,
      natureImageDescription,
      customImageBase64,
      customImageDescription,
    } = await request.json();

    collectedParameters.plotWidth = collectedParameters.plotWidth || 10;
    collectedParameters.plotHeight = collectedParameters.plotHeight || 10;

    const descriptionToUse = customImageDescription || natureImageDescription || 'organic geometric shape';
    const prompt = FLOORPLAN_GENERATION_PROMPT(collectedParameters, descriptionToUse);

    console.log('[generate-floorplan] Nature URL:', natureImageUrl);
    console.log('[generate-floorplan] Custom image provided:', !!customImageBase64);

    // ── Step 1: Get raw image bytes ───────────────────────────────────────
    let rawBuffer: Buffer | null = null;

    if (customImageBase64) {
      // Uploaded image — decode base64 to buffer
      const raw = customImageBase64.includes(',')
        ? customImageBase64.split(',')[1]
        : customImageBase64;
      rawBuffer = Buffer.from(raw, 'base64');
      console.log('[generate-floorplan] Using uploaded custom image');
    } else if (natureImageUrl) {
      try {
        rawBuffer = await fetchImageBuffer(natureImageUrl);
        console.log('[generate-floorplan] Fetched nature image, size:', rawBuffer.length);
      } catch (err: any) {
        console.error('[generate-floorplan] Failed to fetch nature image:', err.message);
      }
    }

    // ── Step 2: Convert to stark B&W silhouette ───────────────────────────
    // This is the KEY step. Instead of sending the photograph, we send a clean
    // black silhouette so Gemini MUST trace the exact shape outline.
    let imagePart: any | undefined;

    if (rawBuffer) {
      try {
        const silhouette = await extractSilhouette(rawBuffer);
        imagePart = { inlineData: { mimeType: silhouette.mimeType, data: silhouette.data } };
        console.log('[generate-floorplan] Silhouette ready — sending to Gemini');
      } catch (silErr: any) {
        // Silhouette extraction failed — fall back to raw image
        console.warn('[generate-floorplan] Silhouette extraction failed, using raw image:', silErr.message);
        imagePart = { inlineData: { mimeType: 'image/jpeg', data: rawBuffer.toString('base64') } };
      }
    } else {
      console.error('[generate-floorplan] CRITICAL: No image available — Gemini has no shape to trace!');
    }

    // ── Step 3: Build prompt parts ────────────────────────────────────────
    const buildParts = () => {
      const parts: any[] = [{ text: prompt }];
      if (imagePart) {
        parts.push(imagePart);
      }
      return parts;
    };

    // ── Step 4: Generate 2 variations in parallel ─────────────────────────
    const promises = [0, 1].map((_, i) =>
      new Promise<string>((resolve, reject) =>
        setTimeout(async () => {
          try {
            let res;
            try {
              res = await callGemini({
                model: 'gemini-3.1-flash-image-preview',
                message: undefined,
                temperature: 0.9,
                responseModalities: ['image', 'text'],
                timeoutMs: 45000,
                _customContents: [{ role: 'user', parts: buildParts() }],
              } as any);
            } catch (err: any) {
              console.warn(`[generate-floorplan] gemini-3.1-flash-image-preview var ${i} failed: ${err.message}. Falling back to gemini-2.5-flash-image...`);
              res = await callGemini({
                model: 'gemini-2.5-flash-image',
                message: undefined,
                temperature: 0.9,
                responseModalities: ['image', 'text'],
                timeoutMs: 45000,
                _customContents: [{ role: 'user', parts: buildParts() }],
              } as any);
            }

            const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (!part?.inlineData?.data) {
              console.error('[generate-floorplan] Gemini Response:', JSON.stringify(res));
              throw new Error('No image found in Gemini response');
            }
            resolve(part.inlineData.data);
          } catch (e) {
            reject(e);
          }
        }, i * 150)
      )
    );

    const results = await Promise.allSettled(promises);
    const options = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value);

    if (options.length === 0) {
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => r.reason?.message || String(r.reason));
      throw new Error(`Floor plan generation failed. Details: ${JSON.stringify(errors)}`);
    }

    return NextResponse.json({ options });
  } catch (error: any) {
    console.error('[generate-floorplan] Error:', error);
    return NextResponse.json({ error: error.message, retry: true }, { status: 500 });
  }
}
