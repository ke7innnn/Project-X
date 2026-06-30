'use client';

import { useEffect, useState } from 'react';
import ChatPanel from '@/components/ChatPanel';
import CanvasPanel from '@/components/CanvasPanel';
import RenderZoneHUD from '@/components/RenderZoneHUD';
import CinematicIntro from '@/components/CinematicIntro';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useParams, useRouter } from 'next/navigation';

export default function WorkspacePage() {
  const params = useParams();
  const id = params?.id as string;
  const setSessionId = useArchitectStore((state) => state.setSessionId);
  const isRestored = useArchitectStore((state) => state.isRestored);
  const currentSessionId = useArchitectStore((state) => state.sessionId);
  const phase = useArchitectStore((state) => state.phase);

  const router = useRouter();

  useEffect(() => {
    // If the URL ID is different from our store ID, update the store.
    // This will trigger SupabaseSyncProvider to fetch the new project.
    if (id && id !== currentSessionId) {
      useArchitectStore.setState({ isRestored: false }); // Force a re-fetch
      setSessionId(id);
    }
  }, [id, currentSessionId, setSessionId]);

  useEffect(() => {
    // Auto-redirect to /edit when we enter the editing phase
    if (isRestored && (phase === 'edit' || phase === 'measure')) {
      router.push('/edit');
    }
  }, [phase, isRestored, router]);

  // While restoring from the database, show a cool loader
  if (id !== currentSessionId || !isRestored) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-screen bg-[#0d0d0d] font-mono text-[#FFB000]">
         <div className="w-12 h-12 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-4" />
         <p className="tracking-widest uppercase">Connecting to Workspace Node...</p>
      </div>
    );
  }
  // Select dynamic intro video based on restored project phase
  let introVideo = "/stage videos/Chapter 1 'THE CONCEPT'.mp4";
  let introTitle = "Chapter 1 - THE CONCEPT";

  if (phase === 'edit' || phase === 'reimport' || phase === 'export') {
    introVideo = "/stage videos/Chapter 2 - 'THE TRANSFORMATION INTO ARCHITECTURE'.mp4";
    introTitle = "Chapter 2 - THE TRANSFORMATION INTO ARCHITECTURE";
  }

  return (
    <main className="flex flex-col w-full h-screen bg-[#0d0d0d] overflow-hidden font-mono text-white relative">
      <CinematicIntro 
        key={introVideo}
        videoPath={introVideo} 
        title={introTitle} 
      />

      {/* Background grid texture for the entire Render Zone */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none z-0" />
      
      {/* Top HUD Tracker */}
      <RenderZoneHUD />

      {/* Main Split Screen Area */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Left Panel: Chat (30%) */}
        <div className="w-[30%] h-full flex flex-col border-r border-[#222] bg-[#0d0d0d]/80 backdrop-blur">
          <ChatPanel />
        </div>

        {/* Right Panel: Canvas (70%) */}
        <div className="w-[70%] h-full flex flex-col relative">
          <CanvasPanel />
        </div>
      </div>
    </main>
  );
}
