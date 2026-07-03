import { NextResponse } from "next/server";
import sharp from "sharp";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const potrace = require('potrace') as typeof import('potrace');

export const maxDuration = 60;

function generateSilhouette(data: Buffer, width: number, height: number, channels: number): Buffer {
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [[0, 0]];
  visited[0] = 1;

  const isBackground = (x: number, y: number) => {
    const idx = (y * width + x) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    // Background pixels are white-ish (luminance > 220)
    return (r + g + b) / 3 > 220;
  };

  let head = 0;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (!visited[nidx] && isBackground(nx, ny)) {
          visited[nidx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  // Edit buffer: Background -> White, House Footprint -> Black
  const outBuffer = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const vidx = y * width + x;
      if (visited[vidx]) {
        outBuffer[idx] = 255;
        outBuffer[idx + 1] = 255;
        outBuffer[idx + 2] = 255;
      } else {
        outBuffer[idx] = 0;
        outBuffer[idx + 1] = 0;
        outBuffer[idx + 2] = 0;
      }
      if (channels === 4) outBuffer[idx + 3] = 255;
    }
  }

  return outBuffer;
}

const SYSTEM_PROMPT = (width: number, height: number) => `You are an expert architectural vision AI. Analyze the provided floor plan image and extract its semantic layout into a strict JSON object.

We have traced the image and its dimensions are: width: ${width}px, height: ${height}px.
Your coordinates must align EXACTLY with this pixel bounding box.

Output JSON format:
{
  "rooms": [
    {
      "id": "unique-id",
      "label": "Room Name (e.g., Bedroom, Kitchen)",
      "x": number,
      "y": number,
      "width": number,
      "height": number
    }
  ]
}

CRITICAL RULES:
- The coordinate system starts at top-left (0,0) and spans up to (${width}, ${height}).
- Extract only the interior rooms. Estimate their coordinates to fit inside the visual boundary of the plan.
- Rooms MUST NOT overlap. They should share adjacent edges where they touch and pack together cleanly like tiles inside the building footprint.
- Output ONLY valid JSON. No markdown formatting or explanations.`;

export async function POST(request: Request) {
  try {
    const { imageBase64 } = await request.json();
    if (!imageBase64) return NextResponse.json({ error: "Missing imageBase64" }, { status: 400 });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    // 1. Load image using sharp and extract metadata
    const image = sharp(imgBuffer).ensureAlpha();
    const metadata = await image.metadata();
    const imgW = metadata.width || 1000;
    const imgH = metadata.height || 1000;

    // 2. Downscale to 300x300 to close door/window gaps and ensure high performance
    const targetSize = 300;
    const downscaledInfo = await sharp(imgBuffer)
      .ensureAlpha()
      .resize(targetSize, targetSize, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const dsData = downscaledInfo.data;
    const dsW = downscaledInfo.info.width;
    const dsH = downscaledInfo.info.height;
    const dsChannels = downscaledInfo.info.channels;

    // 3. Morphological Dilation to expand wall thickness and completely seal door openings
    const dilatedBuffer = Buffer.alloc(dsData.length);
    const radius = 8; // Closes gaps of up to 16px on the 300x300 space (about 40px on original image)
    for (let y = 0; y < dsH; y++) {
      for (let x = 0; x < dsW; x++) {
        const idx = (y * dsW + x) * dsChannels;
        let minVal = 255;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < dsH) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < dsW) {
                const nidx = (ny * dsW + nx) * dsChannels;
                const val = (dsData[nidx] + dsData[nidx + 1] + dsData[nidx + 2]) / 3;
                if (val < minVal) minVal = val;
              }
            }
          }
        }
        dilatedBuffer[idx] = minVal;
        dilatedBuffer[idx + 1] = minVal;
        dilatedBuffer[idx + 2] = minVal;
        if (dsChannels === 4) dilatedBuffer[idx + 3] = 255;
      }
    }

    // 4. Run queue-based flood fill starting from (0,0) on dilated downscaled buffer
    const visited = new Uint8Array(dsW * dsH);
    const queue: [number, number][] = [[0, 0]];
    visited[0] = 1;

    const isDsBackground = (x: number, y: number) => {
      const idx = (y * dsW + x) * dsChannels;
      const val = (dilatedBuffer[idx] + dilatedBuffer[idx + 1] + dilatedBuffer[idx + 2]) / 3;
      return val > 200;
    };

    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < dsW && ny >= 0 && ny < dsH) {
          const nidx = ny * dsW + nx;
          if (!visited[nidx] && isDsBackground(nx, ny)) {
            visited[nidx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }

    // 5. Map the isolated silhouette back to the original image dimensions
    const channels = 4;
    const silBuffer = Buffer.alloc(imgW * imgH * channels);
    for (let y = 0; y < imgH; y++) {
      for (let x = 0; x < imgW; x++) {
        const idx = (y * imgW + x) * channels;
        const dsX = Math.floor(x * dsW / imgW);
        const dsY = Math.floor(y * dsH / imgH);
        const vidx = dsY * dsW + dsX;

        if (visited[vidx]) {
          silBuffer[idx] = 255;
          silBuffer[idx + 1] = 255;
          silBuffer[idx + 2] = 255;
        } else {
          silBuffer[idx] = 0;
          silBuffer[idx + 1] = 0;
          silBuffer[idx + 2] = 0;
        }
        silBuffer[idx + 3] = 255;
      }
    }

    // 6. Convert the raw silhouette buffer to PNG buffer
    const silhouettePngBuffer = await sharp(silBuffer, {
      raw: {
        width: imgW,
        height: imgH,
        channels: channels
      }
    })
    .png()
    .toBuffer();

    // 7. Run Potrace on the solid silhouette PNG buffer
    const rawSvg: string = await new Promise((resolve, reject) => {
      potrace.trace(silhouettePngBuffer, {
        threshold: 130,
        turdSize: 15,
        color: '#1e293b', // Blueprint Slate color
        background: 'transparent'
      }, (err, svgString) => {
        if (err) reject(err); else resolve(svgString);
      });
    });

    // 8. Call Gemini 2.5 Pro via OpenRouter for relative layout extraction
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) throw new Error("Missing OPENROUTER_API_KEY");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT(imgW, imgH) },
          { 
            role: "user", 
            content: [
              { type: "text", text: "Extract the room dimensions aligning with the coordinate space." },
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${errText}`);
    }
    
    const data = await res.json();
    let content = data.choices[0].message.content.trim();
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const layoutData = JSON.parse(content);

    const layout = {
      exterior_shell: { width: imgW, height: imgH },
      rooms: layoutData.rooms
    };

    return NextResponse.json({ layout, rawSvg });
  } catch (error: any) {
    console.error("[extract-layout] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
