import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, prompt, apiKey } = body;

    if (!mode || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: mode, prompt' },
        { status: 400 }
      );
    }

    // Configure FAL credentials
    const activeApiKey = apiKey || process.env.FAL_KEY;
    if (!activeApiKey) {
      return NextResponse.json(
        { error: 'FAL_KEY is not configured. Set it in .env.local or pass via settings.' },
        { status: 400 }
      );
    }
    const cleanApiKey = activeApiKey.replace(/\s+/g, '').replace(/[^a-zA-Z0-9:-]/g, '');
    fal.config({ credentials: cleanApiKey });

    if (mode === 'hero') {
      // ── HERO MODE ──────────────────────────────────────────────────────
      // Accepts floorPlanImageUrl + prompt → generates exterior hero render
      const { floorPlanImageUrl } = body;
      if (!floorPlanImageUrl) {
        return NextResponse.json(
          { error: 'Hero mode requires floorPlanImageUrl' },
          { status: 400 }
        );
      }

      console.log('[ViewSynthesis] HERO mode — uploading floor plan to FAL storage...');

      // Upload floor plan to FAL storage for the model
      const planRes = await fetch(floorPlanImageUrl);
      if (!planRes.ok) throw new Error(`Failed to fetch floor plan image: HTTP ${planRes.status}`);
      const planBuf = await planRes.arrayBuffer();
      const planBlob = new Blob([planBuf], { type: 'image/png' });
      const planFile = new File([planBlob], 'floorplan.png', { type: 'image/png' });
      const uploadedPlanUrl = await fal.storage.upload(planFile);

      console.log('[ViewSynthesis] Floor plan uploaded. Generating hero exterior render...');

      const result: any = await fal.subscribe('fal-ai/flux-2-pro/edit', {
        input: {
          image_urls: [uploadedPlanUrl],
          prompt,
        },
      });

      const images = result?.images || result?.data?.images;
      if (!images || images.length === 0) {
        throw new Error('Hero render returned no images');
      }

      console.log('[ViewSynthesis] Hero render complete.');
      return NextResponse.json({ url: images[0].url });

    } else if (mode === 'angle') {
      // ── ANGLE MODE ─────────────────────────────────────────────────────
      // Accepts heroImageUrl + prompt → generates angle view from the hero
      // GUARDRAIL: floorPlanImageUrl is deliberately NOT accepted here.
      const { heroImageUrl } = body;
      if (!heroImageUrl) {
        return NextResponse.json(
          { error: 'Angle mode requires heroImageUrl (the locked hero render)' },
          { status: 400 }
        );
      }

      console.log('[ViewSynthesis] ANGLE mode — uploading locked hero to FAL storage...');

      // Upload hero to FAL storage
      const heroRes = await fetch(heroImageUrl);
      if (!heroRes.ok) throw new Error(`Failed to fetch hero image: HTTP ${heroRes.status}`);
      const heroBuf = await heroRes.arrayBuffer();
      const heroBlob = new Blob([heroBuf], { type: 'image/png' });
      const heroFile = new File([heroBlob], 'hero.png', { type: 'image/png' });
      const uploadedHeroUrl = await fal.storage.upload(heroFile);

      console.log('[ViewSynthesis] Hero uploaded. Generating angle view...');

      const result: any = await fal.subscribe('fal-ai/flux-2-pro/edit', {
        input: {
          image_urls: [uploadedHeroUrl],
          prompt,
        },
      });

      const images = result?.images || result?.data?.images;
      if (!images || images.length === 0) {
        throw new Error('Angle render returned no images');
      }

      console.log('[ViewSynthesis] Angle render complete.');
      return NextResponse.json({ url: images[0].url });

    } else {
      return NextResponse.json(
        { error: `Unknown mode: "${mode}". Use "hero" or "angle".` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('[ViewSynthesis] Error:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'View synthesis failed' },
      { status: 500 }
    );
  }
}
