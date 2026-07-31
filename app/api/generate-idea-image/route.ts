import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120;

// ── Model routing table ──────────────────────────────────────────────────────
// Each entry defines how to call the model with and without an input image.
const MODEL_CONFIGS: Record<string, {
  imageToImage: string;
  textOnly: string;
  editFallback?: string;
  useSize?: boolean; // GPT-Image-2 uses size string like "1024x1024" instead of image_size object
}> = {
  'nano-banana-pro': {
    imageToImage: 'fal-ai/nano-banana-pro/image-to-image',
    textOnly: 'fal-ai/nano-banana-pro',
  },
  'nano-banana-2': {
    imageToImage: 'fal-ai/nano-banana-2/image-to-image',
    textOnly: 'fal-ai/nano-banana-2',
    editFallback: 'fal-ai/nano-banana-2/edit',
  },
  'gpt-image-2': {
    imageToImage: 'openai/gpt-image-2/edit',
    textOnly: 'openai/gpt-image-2',
    useSize: true,
  },
};

export async function POST(req: Request) {
  try {
    const { prompt, style, imageSize, apiKey, inputImageBase64, canvasW, canvasH, modelId } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'Fal AI API Key (FAL_KEY) is missing. Switch to simulation mode or configure it in settings.' },
        { status: 400 }
      );
    }

    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    // ── Determine output image size ──────────────────────────────────────────
    let outputWidth = 1024;
    let outputHeight = 1024;
    if (canvasW && canvasH) {
      outputWidth = Math.round(parseInt(canvasW) / 64) * 64;
      outputHeight = Math.round(parseInt(canvasH) / 64) * 64;
      outputWidth = Math.max(512, Math.min(2048, outputWidth));
      outputHeight = Math.max(512, Math.min(2048, outputHeight));
    } else {
      const sizeMap: Record<string, { w: number; h: number }> = {
        'square_hd': { w: 1024, h: 1024 },
        'landscape_16_9': { w: 1024, h: 576 },
        'landscape_4_3': { w: 1024, h: 768 },
        'portrait_4_3': { w: 768, h: 1024 },
      };
      const preset = sizeMap[imageSize || 'square_hd'];
      outputWidth = preset?.w || 1024;
      outputHeight = preset?.h || 1024;
    }

    const selectedModel = modelId || 'nano-banana-2';
    const config = MODEL_CONFIGS[selectedModel] || MODEL_CONFIGS['nano-banana-2'];

    console.log(`[IdeaGenerator] Model: ${selectedModel} (${outputWidth}×${outputHeight}), image: ${!!inputImageBase64}`);

    // ── Helper: extract URL from fal response ────────────────────────────────
    const extractUrl = (res: any): string | null => {
      const imgs = res?.images || res?.data?.images;
      return imgs?.[0]?.url || null;
    };

    // ── Run generation ───────────────────────────────────────────────────────
    const runGeneration = async (): Promise<string | null> => {

      // ─── Image-to-Image path ───────────────────────────────────────────────
      if (inputImageBase64) {
        // Primary: image-to-image endpoint
        try {
          const input: any = {
            prompt,
            image_url: `data:image/png;base64,${inputImageBase64}`,
          };

          if (config.useSize) {
            input.quality = 'medium';
            input.size = `${outputWidth}x${outputHeight}`;
          } else {
            input.strength = 0.85;
          }

          const res = await fal.subscribe(config.imageToImage, { input });
          const url = extractUrl(res);
          if (url) {
            console.log(`[IdeaGenerator] ${selectedModel} image-to-image succeeded`);
            return url;
          }
        } catch (e: any) {
          console.error(`[IdeaGenerator] ${selectedModel} image-to-image failed:`, e.message);
        }

        // Fallback: /edit endpoint (if available)
        if (config.editFallback) {
          try {
            const res = await fal.subscribe(config.editFallback, {
              input: {
                prompt,
                image_url: `data:image/png;base64,${inputImageBase64}`,
                strength: 0.85,
              } as any,
            });
            const url = extractUrl(res);
            if (url) {
              console.log(`[IdeaGenerator] ${selectedModel} edit fallback succeeded`);
              return url;
            }
          } catch (e: any) {
            console.error(`[IdeaGenerator] ${selectedModel} edit fallback failed:`, e.message);
          }
        }
      }

      // ─── Text-only path ────────────────────────────────────────────────────
      try {
        const input: any = { prompt };
        if (config.useSize) {
          input.quality = 'medium';
          input.size = `${outputWidth}x${outputHeight}`;
        } else {
          input.image_size = { width: outputWidth, height: outputHeight };
        }

        const res = await fal.subscribe(config.textOnly, { input });
        const url = extractUrl(res);
        if (url) {
          console.log(`[IdeaGenerator] ${selectedModel} text-only succeeded`);
          return url;
        }
      } catch (e: any) {
        console.error(`[IdeaGenerator] ${selectedModel} text-only failed:`, e.message);
      }

      return null;
    };

    const finalUrl = await runGeneration();

    if (!finalUrl) {
      return NextResponse.json({ error: `${selectedModel} failed to generate. Try a different model.` }, { status: 500 });
    }

    return NextResponse.json({ url: finalUrl });

  } catch (error: any) {
    console.error('[IdeaGenerator] Fal AI Error:', error.message || error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
