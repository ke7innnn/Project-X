import { NextResponse } from 'next/server';
import sharp from 'sharp';

export const maxDuration = 60;

/**
 * Image pre-processing pipeline using sharp before vectorization.
 * Goal: make even blurry/low-contrast floor plans into crisp B&W drawings
 * so vectorizer.ai can extract 100% of the detail.
 *
 * Pipeline:
 *  1. Grayscale               — strip color noise, treat as B&W drawing
 *  2. Median blur (3px)       — kill specks, scanner noise, JPEG artifacts
 *  3. Sharpen (aggressive)    — recover edge sharpness after blur
 *  4. Normalize               — stretch tones to full 0–255 range
 *  5. Linear contrast boost   — crush blacks, lift whites further
 *  6. Threshold               — convert to pure black & white (best for DXF tracing)
 */
async function preprocessForVectorization(inputBuffer: Buffer): Promise<Buffer> {
  return await sharp(inputBuffer)
    // 1. Convert to single-channel grayscale
    .greyscale()
    // 2. Median filter — noise reduction without destroying edge sharpness
    .median(3)
    // 3. Aggressive sharpening — sigma=3, flat=1, jagged=2
    .sharpen({ sigma: 3, m1: 1.5, m2: 2.5 })
    // 4. Normalize — auto-stretch levels so darkest=black, lightest=white
    .normalise()
    // 5. Linear contrast: multiply=1.8 (boosts contrast), offset=-30 (kills grey noise)
    .linear(1.8, -30)
    // 6. Threshold at 140/255 — converts grey mid-tones to pure B&W
    //    Everything below 140 → pure black (walls), above → pure white (space)
    .threshold(140)
    // Output as PNG — lossless, perfect for vectorizer.ai
    .png()
    .toBuffer();
}

/**
 * POST /api/png-to-dxf
 * Body: multipart/form-data with field "image" (file)
 * Optional field "format": "dxf" (default) | "svg"
 */
export async function POST(request: Request) {
  const apiId = process.env.VECTORIZER_API_ID;
  const apiSecret = process.env.VECTORIZER_API_SECRET;

  if (!apiId || !apiSecret) {
    return NextResponse.json(
      { error: 'Vectorizer.ai credentials not configured on the server.' },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const outputFormat = (formData.get('format') as string) || 'dxf';

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided.' }, { status: 400 });
    }

    // Read the uploaded image into a buffer
    const originalArrayBuffer = await imageFile.arrayBuffer();
    const originalBuffer = Buffer.from(originalArrayBuffer);

    // --- Pre-processing ---
    console.log(`[png-to-dxf] Pre-processing image: ${imageFile.name} (${imageFile.size} bytes)`);
    const processedBuffer = await preprocessForVectorization(originalBuffer);
    console.log(`[png-to-dxf] Pre-processed → ${processedBuffer.length} bytes. Sending to vectorizer.ai (format: ${outputFormat})`);

    // Build the multipart body for vectorizer.ai using the PROCESSED buffer
    // Copy into a fresh ArrayBuffer to avoid TypeScript SharedArrayBuffer incompatibility
    const safeArrayBuffer = processedBuffer.buffer.slice(
      processedBuffer.byteOffset,
      processedBuffer.byteOffset + processedBuffer.byteLength
    ) as ArrayBuffer;
    const processedBlob = new Blob([safeArrayBuffer], { type: 'image/png' });
    const vectorizerForm = new FormData();
    vectorizerForm.append('image', processedBlob, 'preprocessed.png');

    // Output format — dxf or svg
    vectorizerForm.append('output.file_format', outputFormat);

    // Test mode — works without API subscription (watermarked output).
    // Remove this line once upgraded to the vectorizer.ai API subscription tier.
    vectorizerForm.append('mode', 'test');

    // Processing options for maximum accuracy on architectural floor plans
    if (outputFormat === 'dxf') {
      vectorizerForm.append('processing.max_colors', '2');           // Pure B&W after threshold
      vectorizerForm.append('output.dxf.compatibility_level', '21'); // AutoCAD 2007+ DXF
    } else {
      vectorizerForm.append('processing.max_colors', '2');
    }

    // Credentials via HTTP Basic Auth
    const basicAuth = 'Basic ' + Buffer.from(`${apiId}:${apiSecret}`).toString('base64');

    const vectorizerRes = await fetch('https://api.vectorizer.ai/api/v1/vectorize', {
      method: 'POST',
      headers: { Authorization: basicAuth },
      body: vectorizerForm,
      signal: AbortSignal.timeout(55000),
    });

    if (!vectorizerRes.ok) {
      const errText = await vectorizerRes.text();
      console.error(`[png-to-dxf] Vectorizer.ai error ${vectorizerRes.status}:`, errText);
      return NextResponse.json(
        { error: `Vectorizer.ai error (${vectorizerRes.status}): ${errText}` },
        { status: vectorizerRes.status }
      );
    }

    // Stream the binary result back to the client
    const resultBuffer = await vectorizerRes.arrayBuffer();
    const contentType = outputFormat === 'dxf' ? 'application/dxf' : 'image/svg+xml';
    const fileName = outputFormat === 'dxf' ? 'floorplan.dxf' : 'floorplan.svg';

    return new Response(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[png-to-dxf] Unexpected error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
