import { NextResponse } from 'next/server';
import potrace from 'potrace';

export async function POST(request: Request) {
  try {
    const { currentFloorPlanBase64 } = await request.json();

    if (!currentFloorPlanBase64) {
      return NextResponse.json({ error: 'Missing currentFloorPlanBase64 in request body' }, { status: 400 });
    }

    let imgBuffer: Buffer;

    if (
      currentFloorPlanBase64.startsWith('http://') || 
      currentFloorPlanBase64.startsWith('https://') || 
      currentFloorPlanBase64.startsWith('/')
    ) {
      let fetchUrl = currentFloorPlanBase64;
      if (currentFloorPlanBase64.startsWith('/')) {
        const requestUrl = new URL(request.url);
        fetchUrl = `${requestUrl.protocol}//${requestUrl.host}${currentFloorPlanBase64}`;
      }
      const fetchRes = await fetch(fetchUrl);
      if (!fetchRes.ok) {
        throw new Error(`Failed to fetch image from URL: ${fetchUrl}`);
      }
      const arrayBuffer = await fetchRes.arrayBuffer();
      imgBuffer = Buffer.from(arrayBuffer);
    } else {
      const base64Data = currentFloorPlanBase64.replace(/^data:image\/\w+;base64,/, '');
      imgBuffer = Buffer.from(base64Data, 'base64');
    }

    // Run trace asynchronously
    const svg: string = await new Promise((resolve, reject) => {
      potrace.trace(imgBuffer, {
        threshold: 130,      // Threshold for black-and-white conversion
        turdSize: 15,        // Filter out small noisy speckles
        optTolerance: 0.3,
        color: '#00f0ff',   // Set wall color to active neon cyan (cyberpunk HUD theme)
        background: 'transparent'
      }, (err, svgString) => {
        if (err) {
          reject(err);
        } else {
          resolve(svgString);
        }
      });
    });

    return NextResponse.json({ svg });
  } catch (error: any) {
    console.error('[vectorize API] error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
