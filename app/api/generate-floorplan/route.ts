import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { FLOORPLAN_GENERATION_PROMPT } from '@/lib/prompts';
import fs from 'fs';
import path from 'path';

export const maxDuration = 60; // 60s timeout for Vercel functions

/**
 * Fetches a Pexels image URL and returns it as base64.
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { data: Buffer.from(buffer).toString('base64'), mimeType };
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

    // Ensure width and height fallbacks are present
    collectedParameters.plotWidth = collectedParameters.plotWidth || 10;
    collectedParameters.plotHeight = collectedParameters.plotHeight || 10;

    const descriptionToUse = customImageDescription || natureImageDescription || 'organic geometric shape';
    const prompt = FLOORPLAN_GENERATION_PROMPT(collectedParameters, descriptionToUse);

    // Load CAD style reference image
    let cadStyleBase64: string | undefined;
    let cadStyleMime = 'image/png';
    try {
      const cadStylePath = path.join(process.cwd(), 'public', 'cad-style-reference.png');
      if (fs.existsSync(cadStylePath)) {
        cadStyleBase64 = fs.readFileSync(cadStylePath).toString('base64');
      }
    } catch (err) {
      console.error('Failed to load CAD style reference:', err);
    }

    // Resolve the nature/custom reference image
    let refImageBase64: string | undefined;
    let refImageMime = 'image/jpeg';
    if (customImageBase64) {
      // Strip data URI prefix if present
      refImageBase64 = customImageBase64.includes(',')
        ? customImageBase64.split(',')[1]
        : customImageBase64;
    } else if (natureImageUrl) {
      const fetched = await fetchImageAsBase64(natureImageUrl);
      refImageBase64 = fetched.data;
      refImageMime = fetched.mimeType;
    }

    // Build the parts array: [prompt text, CAD style ref (optional), nature image ref (optional)]
    const buildParts = () => {
      const parts: any[] = [{ text: prompt }];
      if (cadStyleBase64) {
        parts.push({ inlineData: { mimeType: cadStyleMime, data: cadStyleBase64 } });
      }
      if (refImageBase64) {
        parts.push({ inlineData: { mimeType: refImageMime, data: refImageBase64 } });
      }
      return parts;
    };

    // Generate 2 variations in parallel
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
                timeoutMs: 45000, // Increased from 8s to 45s (image gen is slow)
                _customContents: [{ role: 'user', parts: buildParts() }],
              } as any);
            } catch (err: any) {
              console.warn(`[generate-floorplan] gemini-3.1-flash-image-preview variation ${i} failed: ${err.message}. Retrying with gemini-2.5-flash-image...`);
              res = await callGemini({
                model: 'gemini-2.5-flash-image',
                message: undefined,
                temperature: 0.9,
                responseModalities: ['image', 'text'],
                timeoutMs: 45000, // Increased from 8s to 45s
                _customContents: [{ role: 'user', parts: buildParts() }],
              } as any);
            }

            const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
            if (!part?.inlineData?.data) {
               console.error('[generate-floorplan] Gemini Response:', JSON.stringify(res));
               throw new Error('No image found in Gemini response candidate parts');
            }
            resolve(part.inlineData.data);
          } catch (e) {
            reject(e);
          }
        }, i * 100) // Lower delay so both run quickly
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
