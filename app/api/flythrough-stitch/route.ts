import { NextResponse } from 'next/server';

export const maxDuration = 120;

export const AUDIO_SOUNDTRACKS: Record<string, { title: string; genre: string; audioUrl: string; desc: string }> = {
  luxury_orchestral: {
    title: 'Majestic Architectural Symphony',
    genre: 'Cinematic Orchestral',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3', // High-end royalty-free cinematic strings
    desc: 'Grand sweeping violins, horns, and ambient timpani building to a crescendo.',
  },
  sunset_piano: {
    title: 'Golden Hour Horizon',
    genre: 'Piano & Strings',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
    desc: 'Intimate, emotional piano arpeggios with warm sunset cello atmospheres.',
  },
  modern_ambient: {
    title: 'Cyberpunk Metropolis Pulse',
    genre: 'Electronic Ambient',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3',
    desc: 'Deep sub-bass swells, shimmering synthesizer textures, and crisp modern rhythm.',
  },
  lofi_architecture: {
    title: 'Nordic Studio Mood',
    genre: 'Lofi Minimalist',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3',
    desc: 'Relaxing Rhodes chords, vinyl warmth, and subtle mellow percussive grooves.',
  },
};

export async function POST(req: Request) {
  try {
    const {
      shots, // array of { shotNumber, videoUrl, title, duration }
      audioMood = 'luxury_orchestral',
      filmTitle = 'Architectural Masterpiece Flythrough',
      duration = 60,
    } = await req.json();

    const videoList: any[] = Array.isArray(shots) ? shots : [];
    if (videoList.length === 0) {
      return NextResponse.json({ error: 'No video shots provided for stitching.' }, { status: 400 });
    }

    const selectedAudio = AUDIO_SOUNDTRACKS[audioMood] || AUDIO_SOUNDTRACKS.luxury_orchestral;

    console.log(`[FlythroughStitch] Packaging ${videoList.length} shots with audio: ${selectedAudio.title}...`);

    return NextResponse.json({
      success: true,
      masterVideo: {
        filmTitle,
        totalDuration: duration,
        shotCount: videoList.length,
        audioTrack: selectedAudio,
        shots: videoList,
        stitchedAt: Date.now(),
      },
    });
  } catch (err: any) {
    console.error('[FlythroughStitch Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to stitch flythrough reel.' },
      { status: 500 }
    );
  }
}
