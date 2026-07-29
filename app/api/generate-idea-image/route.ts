import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { prompt, style, imageSize, apiKey, inputImageBase64, canvasW, canvasH } = await req.json();

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
    // Use custom canvas dimensions if provided, otherwise fall back to preset size
    let outputWidth = 1024;
    let outputHeight = 1024;
    if (canvasW && canvasH) {
      // Round to nearest 64 (fal models require multiples of 64)
      outputWidth = Math.round(parseInt(canvasW) / 64) * 64;
      outputHeight = Math.round(parseInt(canvasH) / 64) * 64;
      // Clamp to safe range
      outputWidth = Math.max(512, Math.min(2048, outputWidth));
      outputHeight = Math.max(512, Math.min(2048, outputHeight));
    } else {
      // Use preset imageSize mapping
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

    console.log(`[IdeaGenerator] Dual GPT-Image-1 image-to-image parallel run (${outputWidth}×${outputHeight})...`);
    console.log(`[IdeaGenerator] Input image provided: ${!!inputImageBase64}`);

    // ── Shared input for both variants ───────────────────────────────────────
    // If a traced canvas image is provided, use image-to-image mode
    // Otherwise, fall back to text-only generation (no input image)
    const buildInput = (seed: number) => {
      if (inputImageBase64) {
        // Image-to-image: traced polygon guides the shape placement
        return {
          prompt: prompt,
          image_url: `data:image/png;base64,${inputImageBase64}`,
          strength: 0.85,   // 85% creative freedom — respects boundary shape, generates content
          seed: seed,
        };
      } else {
        // Text-to-image fallback
        return {
          prompt: prompt,
          image_size: { width: outputWidth, height: outputHeight },
          seed: seed,
        };
      }
    };

    // ── Model: FLUX ──────────────────────────────────
    // Run twice with different seeds for Variant Alpha and Variant Beta
    const SEED_A = 42;
    const SEED_B = 137;

    const runVariant = async (seed: number, label: string): Promise<string | null> => {
      // Image-to-Image Generation (ControlNet / Structure Guided)
      if (inputImageBase64) {
        try {
          const res = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
            input: {
              prompt: prompt,
              image_url: `data:image/png;base64,${inputImageBase64}`,
              strength: 0.85, // 0.85 allows the AI to draw inside the mask while strictly keeping the boundary
              image_size: { width: outputWidth, height: outputHeight },
              seed: seed,
            } as any
          });
          const imgs = (res as any)?.images || (res as any)?.data?.images;
          const url = imgs?.[0]?.url;
          if (url) {
            console.log(`[IdeaGenerator] ${label} FLUX I2I succeeded`);
            return url;
          }
        } catch (e: any) {
          console.error(`[IdeaGenerator] ${label} FLUX I2I failed:`, e.message);
        }
      }

      // Fallback: Text-to-Image Generation
      try {
        const res = await fal.subscribe('fal-ai/flux-pro/v1.1', {
          input: {
            prompt: prompt,
            image_size: { width: outputWidth, height: outputHeight },
            seed: seed,
          } as any
        });
        const imgs = (res as any)?.images || (res as any)?.data?.images;
        const url = imgs?.[0]?.url;
        if (url) {
          console.log(`[IdeaGenerator] ${label} FLUX T2I succeeded`);
          return url;
        }
      } catch (e: any) {
        console.error(`[IdeaGenerator] ${label} FLUX T2I failed:`, e.message);
      }

      return null;
    };

    // Run both variants in parallel
    const [variantA, variantB] = await Promise.all([
      runVariant(SEED_A, 'Variant-Alpha'),
      runVariant(SEED_B, 'Variant-Beta'),
    ]);

    if (!variantA && !variantB) {
      return NextResponse.json({ error: 'Both GPT-Image-1 variants failed to generate images.' }, { status: 500 });
    }

    return NextResponse.json({
      gptImageUrl: variantA,
      nanoImageUrl: variantB,
      url: variantA || variantB,
    });

  } catch (error: any) {
    console.error('[IdeaGenerator] Fal AI Error:', error.message || error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
