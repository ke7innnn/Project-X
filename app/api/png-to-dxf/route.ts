import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * POST /api/png-to-dxf
 * Body: multipart/form-data with field "image" (file)
 * Optional field "format": "dxf" (default) | "svg"
 *
 * Forwards the image to vectorizer.ai using HTTP Basic Auth and
 * returns the binary DXF or SVG result.
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

    // Build the multipart body for vectorizer.ai
    const vectorizerForm = new FormData();
    vectorizerForm.append('image', imageFile, imageFile.name || 'upload.png');

    // Output format — dxf or svg
    vectorizerForm.append('output.file_format', outputFormat);

    // Processing options for maximum accuracy on architectural floor plans
    if (outputFormat === 'dxf') {
      vectorizerForm.append('processing.max_colors', '2');      // B&W floor plans — 2 colours = perfect trace
      vectorizerForm.append('output.dxf.compatibility_level', '21'); // AutoCAD 2007+ DXF
    } else {
      // SVG preview — keep curves, high detail
      vectorizerForm.append('processing.max_colors', '2');
    }

    // Credentials via HTTP Basic Auth
    const basicAuth = 'Basic ' + Buffer.from(`${apiId}:${apiSecret}`).toString('base64');

    console.log(`[png-to-dxf] Calling vectorizer.ai — format: ${outputFormat}, size: ${imageFile.size} bytes`);

    const vectorizerRes = await fetch('https://api.vectorizer.ai/api/v1/vectorize', {
      method: 'POST',
      headers: {
        Authorization: basicAuth,
      },
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
    const contentType =
      outputFormat === 'dxf' ? 'application/dxf' : 'image/svg+xml';
    const fileName =
      outputFormat === 'dxf' ? 'floorplan.dxf' : 'floorplan.svg';

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
