import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 300;

fal.config({ credentials: process.env.FAL_KEY });

async function uploadBase64ToFalStorage(dataUri: string, filename = 'shot_input.png'): Promise<string> {
  const base64 = dataUri.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const blob = new Blob([buffer], { type: 'image/png' });
  const file = new File([blob], filename, { type: 'image/png' });
  return fal.storage.upload(file);
}

export async function POST(req: Request) {
  try {
    const {
      imageBase64,
      imageUrls,
      prompt,
      engine = 'wan_2_1', // 'wan_2_1' | 'kling_1_6' | 'seedance'
      duration = 10,
      aspectRatio = '16:9',
    } = await req.json();

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'FAL_KEY is missing.' }, { status: 500 });
    }
    fal.config({ credentials: falKey });

    let primaryImageUrl = '';

    if (imageBase64) {
      primaryImageUrl = await uploadBase64ToFalStorage(imageBase64, `shot_frame_${Date.now()}.png`);
    } else if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      primaryImageUrl = imageUrls[0];
    } else {
      return NextResponse.json({ error: 'Image input (imageBase64 or imageUrls) is required.' }, { status: 400 });
    }

    const enhancedPrompt = `Cinematic commercial architectural flythrough film of finished luxury building, ${prompt || 'smooth fluid drone camera glide, slow cinema motion'}, preserving exact photorealistic materials, realistic low-iron glass reflections and natural sunlight, 8k octane architectural visualization finish, 24fps fluid motion, zero morphing, zero wireframe.`;

    console.log(`[GenerateShot] Rendering shot with engine: ${engine}...`);

    let videoUrl = '';
    let seed = null;

    if (engine === 'kling_1_6') {
      try {
        const result: any = await fal.subscribe('fal-ai/kling-video/v1.6/standard/image-to-video', {
          input: {
            prompt: enhancedPrompt,
            image_url: primaryImageUrl,
            duration: (Number(duration) === 5 ? '5' : '10') as any,
            aspect_ratio: aspectRatio || '16:9',
          } as any,
        });
        videoUrl = result.data?.video?.url || result?.video?.url || result?.data?.output?.url;
        seed = result.data?.seed || result?.seed;
      } catch (klingErr: any) {
        console.warn('[GenerateShot] Kling 1.6 failed, falling back to Wan-i2v...', klingErr?.message);
        const result: any = await fal.subscribe('fal-ai/wan-i2v', {
          input: {
            prompt: enhancedPrompt,
            image_url: primaryImageUrl,
            aspect_ratio: '16:9',
            resolution: '720p',
          } as any,
        });
        videoUrl = result.data?.video?.url || result?.video?.url;
        seed = result.data?.seed || result?.seed;
      }
    } else if (engine === 'seedance') {
      const allUrls = Array.isArray(imageUrls) && imageUrls.length > 0 ? imageUrls : [primaryImageUrl];
      const result: any = await fal.subscribe('bytedance/seedance-2.0/fast/reference-to-video', {
        input: {
          prompt: enhancedPrompt,
          image_urls: allUrls,
          duration: Math.min(15, Number(duration || 10)),
          resolution: '480p',
          aspect_ratio: aspectRatio || '16:9',
        } as any,
      });
      videoUrl = result.data?.video?.url || result?.video?.url;
      seed = result.data?.seed || result?.seed;
    } else {
      // Primary: Wan 2.1 (fal-ai/wan-i2v) with automatic Kling fallback
      try {
        console.log('[GenerateShot] Calling fal-ai/wan-i2v...');
        const result: any = await fal.subscribe('fal-ai/wan-i2v', {
          input: {
            prompt: enhancedPrompt,
            image_url: primaryImageUrl,
            aspect_ratio: '16:9',
            resolution: '720p',
          } as any,
        });
        videoUrl = result.data?.video?.url || result?.video?.url || result?.data?.output?.url;
        seed = result.data?.seed || result?.seed;
      } catch (wanErr: any) {
        console.warn('[GenerateShot] fal-ai/wan-i2v failed, trying Kling 1.6 fallback...', wanErr?.message);
        try {
          const result: any = await fal.subscribe('fal-ai/kling-video/v1.6/standard/image-to-video', {
            input: {
              prompt: enhancedPrompt,
              image_url: primaryImageUrl,
              duration: '10' as any,
              aspect_ratio: '16:9',
            } as any,
          });
          videoUrl = result.data?.video?.url || result?.video?.url;
          seed = result.data?.seed || result?.seed;
        } catch (klingFallbackErr: any) {
          console.warn('[GenerateShot] Kling fallback failed, trying Minimax...', klingFallbackErr?.message);
          const result: any = await fal.subscribe('fal-ai/minimax-video/image-to-video', {
            input: {
              prompt: enhancedPrompt,
              image_url: primaryImageUrl,
            } as any,
          });
          videoUrl = result.data?.video?.url || result?.video?.url;
          seed = result.data?.seed || result?.seed;
        }
      }
    }

    if (!videoUrl) {
      throw new Error('Video model failed to produce a valid video URL.');
    }

    console.log('[GenerateShot] Shot successfully rendered:', videoUrl);

    return NextResponse.json({
      success: true,
      videoUrl,
      seed,
      engine,
    });
  } catch (err: any) {
    console.error('[GenerateShot Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to render video shot.' },
      { status: 500 }
    );
  }
}
