import { NextResponse } from 'next/server';
import sharp from 'sharp';

export const maxDuration = 60;

/**
 * Image pre-processing pipeline using sharp before vectorization.
 * Pipeline is GENTLE and focuses on ANTI-ALIASING.
 * We upscale the image 2x with Lanczos3 interpolation to smooth out pixelated lines,
 * giving vectorizer.ai clean, high-resolution curves to trace instead of jagged pixels.
 */
async function preprocessForVectorization(inputBuffer: Buffer): Promise<Buffer> {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const targetWidth = Math.min(4096, Math.max(3000, (metadata.width || 1000) * 3));

  return await image
    // 1. Upscale 3x+ with smooth Lanczos3 interpolation to remove pixelation/jaggies
    .resize({ width: targetWidth, kernel: sharp.kernel.lanczos3 })
    // 2. Grayscale
    .greyscale()
    // 3. Normalize to stretch contrast naturally
    .normalise()
    // 4. Sharpen to make lines and details extremely crisp without diffusing or erasing them
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.0 })
    // 5. Very gentle contrast stretch to clean the background without eroding thin/dashed lines
    .linear(1.15, -19)
    // Output PNG — lossless
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
