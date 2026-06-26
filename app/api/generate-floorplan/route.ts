import { NextResponse } from 'next/server';
import { callGemini } from '@/lib/gemini';
import { FLOORPLAN_GENERATION_PROMPT } from '@/lib/prompts';

export const maxDuration = 60; // 60s timeout for Vercel functions

/**
 * Fetches an image URL and returns it as base64.
 * Throws on failure so the caller can fall back to fileData URI mode.
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      // Some CDNs block requests without a browser-like User-Agent
      'User-Agent': 'Mozilla/5.0 (compatible; ArchitectBot/1.0)',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching reference image`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
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

    console.log('[generate-floorplan] Nature image URL received:', natureImageUrl);
    console.log('[generate-floorplan] Custom image provided:', !!customImageBase64);

    // ── Resolve image: base64 inline OR fetched OR fileData URL fallback ──
    // imageMode: 'inline' = we have base64, 'fileData' = Gemini fetches the URL directly
    let imagePart: any | undefined;

    if (customImageBase64) {
      // User uploaded their own image — use it directly
      const raw = customImageBase64.includes(',')
        ? customImageBase64.split(',')[1]
        : customImageBase64;
      const mime = customImageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      imagePart = { inlineData: { mimeType: mime, data: raw } };
      console.log('[generate-floorplan] Using custom uploaded image (inline base64)');
    } else if (natureImageUrl) {
      // Try to fetch the Pexels image as base64 first
      try {
        const fetched = await fetchImageAsBase64(natureImageUrl);
        imagePart = { inlineData: { mimeType: fetched.mimeType, data: fetched.data } };
        console.log('[generate-floorplan] Successfully fetched nature image as base64, mimeType:', fetched.mimeType, 'size:', fetched.data.length);
      } catch (fetchErr: any) {
        // Fetch failed (e.g. Pexels 403/CORS). Fall back: let Gemini fetch the URL directly.
        console.warn('[generate-floorplan] Direct image fetch failed:', fetchErr.message, '— falling back to Gemini fileData URI mode');
        imagePart = { fileData: { mimeType: 'image/jpeg', fileUri: natureImageUrl } };
      }
    } else {
      console.error('[generate-floorplan] CRITICAL: No reference image URL or base64 was provided! The model will have no shape to trace.');
    }

    // Build parts: always [prompt text, then image if available]
    const buildParts = () => {
      const parts: any[] = [{ text: prompt }];
      if (imagePart) {
        parts.push(imagePart);
        console.log('[generate-floorplan] Image part type:', imagePart.inlineData ? 'inlineData' : 'fileData');
      } else {
        console.warn('[generate-floorplan] No image part — Gemini will generate without a shape reference!');
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
                timeoutMs: 45000,
                _customContents: [{ role: 'user', parts: buildParts() }],
              } as any);
            } catch (err: any) {
              console.warn(`[generate-floorplan] gemini-3.1-flash-image-preview variation ${i} failed: ${err.message}. Retrying with gemini-2.5-flash-image...`);
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
               throw new Error('No image found in Gemini response candidate parts');
            }
            resolve(part.inlineData.data);
          } catch (e) {
            reject(e);
          }
        }, i * 100)
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
