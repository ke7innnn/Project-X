import { callGemini } from '../lib/gemini';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  }
}

async function run() {
  try {
    console.log('Sending multimodal test request to Gemini 3 Pro Image...');
    
    // 1x1 base64 transparent PNG
    const dummyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const systemPrompt = `<role>
You are an expert CAD draftsman and master architect specializing in strict floor plan shape-fitting.
</role>
<critical_rules>
1. THE SHAPE IS SACRED: You MUST replicate the EXACT geometry and shape of the outer black outline from the SECONDARY IMAGE.
</critical_rules>`;

    const baseParts = [
      { text: "PRIMARY IMAGE (INTERNAL LAYOUT & ROOM SCHEDULE REFERENCE):" },
      {
        inlineData: {
          mimeType: 'image/png',
          data: dummyPng
        }
      },
      { text: "SECONDARY IMAGE (STRICT OUTER WALL BOUNDARY TRACE):" },
      {
        inlineData: {
          mimeType: 'image/png',
          data: dummyPng
        }
      },
      {
        text: `<task>
Your task is to take the internal room layout, flat divisions, and text labels from the PRIMARY IMAGE and completely remold, shrink, and compress them to fit 100% inside the exact black line boundary from the SECONDARY IMAGE.
</task>`
      }
    ];

    const response = await callGemini({
      model: 'gemini-3-pro-image',
      systemPrompt,
      temperature: 0.9,
      responseModalities: ['image', 'text'],
      timeoutMs: 50000,
      _customContents: [
        {
          role: 'user',
          parts: baseParts
        }
      ]
    } as any);

    console.log('API Response Candidates:');
    console.log(JSON.stringify(response.candidates, null, 2));

    const parts = response.candidates?.[0]?.content?.parts || [];
    console.log('Parts count:', parts.length);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.text) {
        console.log(`Part ${i} [Text]:`, p.text);
      }
      if (p.inlineData) {
        console.log(`Part ${i} [Image]: MIME=${p.inlineData.mimeType}, Data length=${p.inlineData.data.length}`);
      }
    }

  } catch (err: any) {
    console.error('Error running test:', err);
  }
}

run();
