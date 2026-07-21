'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AnimatedPlayer from '@/components/AnimatedPlayer';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';

function SharedPlayerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [storyboardData, setStoryboardData] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);

  useEffect(() => {
    if (!id) {
      setErrorMsg('No project ID specified in URL. Please verify your link.');
      setIsLoading(false);
      return;
    }

    const fetchProjectAndStoryboard = async () => {
      try {
        // Query mock database / supabase table
        const { data, error } = await supabase
          .from('projects')
          .select('state')
          .eq('session_id', id)
          .single() as any;

        if (error || !data) {
          throw new Error('Project state not found inside database.');
        }

        const state = data.state || {};
        const projectName = state.projectName || 'Architectural Concept';

        // Extract primary assets
        const primaryFp = state.currentFloorPlan;
        const heroRender = state.finalRender;
        const angles = Array.isArray(state.angles) ? state.angles : [];
        const uploads = Array.isArray(state.uploads) ? state.uploads : [];

        // Build list of valid visual assets
        const playlist: any[] = [];
        if (primaryFp) playlist.push({ imageId: 'floorplan', type: 'floorPlan', url: primaryFp });
        if (heroRender) playlist.push({ imageId: 'hero', type: 'hero', url: heroRender });
        angles.forEach((a: any, idx: number) => {
          playlist.push({ imageId: a.id || `angle_${idx}`, type: 'angle', url: a.url || a });
        });
        uploads.forEach((u: any, idx: number) => {
          playlist.push({ imageId: u.id || `upload_${idx}`, type: 'upload', url: u.url || u });
        });

        // Set local state representation
        setImages(playlist.map(item => ({ id: item.imageId, url: item.url })));

        if (playlist.length === 0) {
          throw new Error('This project has no layout images or renders uploaded yet.');
        }

        // Call storyboard generator endpoint
        try {
          const response = await fetch('/api/generate-storyboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              images: playlist.map(item => ({ imageId: item.imageId, type: item.type, url: item.url })),
              topic: projectName
            }),
            signal: AbortSignal.timeout(15000)
          });

          if (response.ok) {
            const data = await response.json();
            setStoryboardData(data);
          } else {
            throw new Error('Failed to fetch storyboard template from server.');
          }
        } catch (apiErr) {
          console.warn('[share-player] API storyboard generator offline, constructing local layout path.');
          
          // Construct offline-safe narrative
          const localStoryboard = {
            title: projectName,
            audioMood: 'ambient-cinematic',
            scenes: [
              {
                sceneType: 'open',
                imageIds: [],
                title: projectName.toUpperCase(),
                caption: 'CINEMATIC DESIGN TIMELINE PROPOSAL',
                transitionIn: 'fade',
                motion: 'still',
                durationMs: 3000
              },
              ...playlist.map((item, idx) => ({
                sceneType: item.type === 'floorPlan' ? 'plan' : item.type === 'hero' ? 'morph' : 'angle',
                imageIds: [item.imageId],
                title: item.type === 'floorPlan' ? 'SITE FLOORS SCHEMATIC' : `CINEMATIC DETAIL SCENE ${idx + 1}`,
                caption: 'Digital model mapping showing material specs.',
                transitionIn: idx === 0 ? 'fade' : item.type === 'hero' ? 'scaleMorph' : 'whipPan',
                motion: idx % 2 === 0 ? 'kenBurnsIn' : 'panRight',
                durationMs: 3200
              })),
              {
                sceneType: 'closing',
                imageIds: [],
                title: 'PINNACLE DESIGN GROUP',
                caption: 'All conceptual layouts subject to professional site verification.',
                transitionIn: 'fade',
                motion: 'still',
                durationMs: 3000
              }
            ]
          };
          setStoryboardData(localStoryboard);
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error('[share-player] Error:', err.message);
        setErrorMsg(err.message || 'Failed to retrieve project timeline.');
        setIsLoading(false);
      }
    };

    fetchProjectAndStoryboard();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#060608] flex flex-col justify-center items-center gap-4 text-zinc-500 font-mono text-xs">
        <Loader2 size={24} className="animate-spin text-cyan-400" />
        <span className="tracking-[0.2em] uppercase">Loading Shared Presentation Deck...</span>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-[#060608] flex flex-col justify-center items-center gap-6 p-8 text-center select-none font-mono">
        <AlertTriangle size={48} className="text-amber-500 animate-bounce" />
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-white uppercase tracking-widest">Playback Failed</h2>
          <p className="text-xs text-zinc-400 max-w-md leading-relaxed uppercase">{errorMsg}</p>
        </div>
        <button
          onClick={() => router.push('/projects')}
          className="flex items-center gap-1.5 px-4 py-2 border border-blue-900/40 hover:border-cyan-400 text-zinc-400 hover:text-white rounded text-xs uppercase tracking-wider transition-all cursor-pointer bg-black/40"
        >
          <ArrowLeft size={12} />
          Back to Projects
        </button>
      </div>
    );
  }

  if (storyboardData && images.length > 0) {
    return (
      <AnimatedPlayer
        storyboard={storyboardData}
        images={images}
        isShared={true}
        onClose={() => router.push('/projects')}
      />
    );
  }

  return null;
}

export default function SharedPlayerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#060608] flex flex-col justify-center items-center gap-4 text-zinc-500 font-mono text-xs">
        <Loader2 size={24} className="animate-spin text-cyan-400" />
        <span className="tracking-[0.2em] uppercase font-bold">Initializing Frame Router...</span>
      </div>
    }>
      <SharedPlayerContent />
    </Suspense>
  );
}
