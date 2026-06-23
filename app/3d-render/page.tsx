'use client';

import React, { useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Box, Download, Settings2, Sparkles, Loader2 } from 'lucide-react';
import CinematicIntro from '@/components/CinematicIntro';

export default function Render3DPage() {
  const router = useRouter();
  const { currentFloorPlan, finalRender, setFinalRender, collectedParameters, sessionId } = useArchitectStore();
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateRender = async () => {
    if (!currentFloorPlan || isRendering) return;
    
    setIsRendering(true);
    setError(null);
    try {
      const res = await fetch('/api/final-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlanBase64: currentFloorPlan,
          collectedParameters
        })
      });
      const data = await res.json();
      if (data.render) {
        setFinalRender(data.render);
      } else {
        setError(data.error || '3D render failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsRendering(false);
    }
  };

  const downloadImage = () => {
    if (!finalRender) return;
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${finalRender}`;
    a.download = '3d-render.png';
    a.click();
  };

  return (
    <main className="flex flex-col w-full h-screen bg-[#0a0a0f] text-[#FFB000] font-mono overflow-hidden relative">
      <CinematicIntro 
        videoPath="/stage videos/Chapter 3 - 3D Render.mp4" 
        title="Chapter 3 - THE RENDER" 
      />

      {/* Subtle animated background gradient */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAw IDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0" />

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-[#1e1810] bg-[#0f0f18]/80 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-[#FFB000]/30 hover:border-[#FFB000] hover:bg-[#FFB000]/10 transition-all group"
          >
            <ArrowLeft className="text-[#FFB000]/70 group-hover:text-[#FFB000]" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              3D Render Matrix
            </h1>
            <span className="text-[10px] tracking-[3px] text-[#FFB000]/60 uppercase">
              Photorealistic Generation Engine
            </span>
          </div>
        </div>
        
        {finalRender && (
          <button 
            onClick={downloadImage}
            className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#FFB000] text-[#0a0a0f] hover:bg-[#D8B78D] font-bold rounded transition-colors"
          >
            <Download size={14} /> Export Render
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 overflow-hidden">
        
        {/* Left Side: Viewport */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          {finalRender ? (
            <div className="relative w-full h-full max-h-[80vh] bg-white rounded-xl shadow-[0_0_40px_rgba(255,176,0,0.1)] overflow-hidden border border-[#FFB000]/20 group">
              <img 
                src={`data:image/jpeg;base64,${finalRender}`} 
                alt="3D Final Render" 
                className="w-full h-full object-cover"
              />
            </div>
          ) : currentFloorPlan ? (
             <div className="flex flex-col items-center justify-center w-full h-full max-h-[80vh] border border-[#FFB000]/20 bg-[#0f0f18]/50 backdrop-blur rounded-xl relative overflow-hidden">
                <img 
                  src={`data:image/jpeg;base64,${currentFloorPlan}`} 
                  alt="Draft Floor Plan" 
                  className="w-full h-full object-contain opacity-30 blur-sm grayscale"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]/60 backdrop-blur-md">
                   <Box size={64} className="text-[#FFB000]/40 mb-6" />
                   <h2 className="text-xl tracking-[4px] font-bold text-white uppercase mb-2">Ready for Rendering</h2>
                   <p className="text-[#FFB000]/60 tracking-[2px] text-xs uppercase max-w-md text-center">
                     Initialize the photorealistic generation sequence using your drafted floor plan.
                   </p>
                   
                   <button 
                    onClick={handleGenerateRender}
                    disabled={isRendering}
                    className="mt-8 flex items-center gap-3 px-8 py-4 bg-[#FFB000]/10 border border-[#FFB000] text-[#FFB000] hover:bg-[#FFB000] hover:text-[#0a0a0f] uppercase tracking-widest font-bold transition-all"
                   >
                     {isRendering ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                     {isRendering ? 'Rendering Engine Active...' : 'Initialize Render'}
                   </button>
                </div>
             </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-[#FFB000]/40 p-12 border-2 border-dashed border-[#FFB000]/20 rounded-xl">
              <Box size={48} className="mb-4 opacity-50" />
              <p className="tracking-[2px] uppercase text-sm">No floor plan available.</p>
              <p className="text-[10px] mt-2 opacity-70">Design a layout in the Render Zone first.</p>
            </div>
          )}
        </div>

        {/* Right Side: Filters & Settings */}
        <div className="w-[360px] border-l border-[#1e1810] bg-[#0f0f18]/90 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-[#1e1810]">
            <h2 className="text-sm tracking-[3px] text-[#FFB000] font-bold uppercase flex items-center gap-2">
              <Settings2 size={14} /> Render Filters
            </h2>
            <p className="text-[10px] tracking-wide text-[#FFB000]/60 mt-2 leading-relaxed">
              Configure lighting, environment, and material aesthetics.
            </p>
          </div>

          <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            {error && (
              <div className="p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wide rounded">
                ⚠️ {error}
              </div>
            )}

            {/* Filter Placeholders */}
            <div className="space-y-4 opacity-50 pointer-events-none">
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Time of Day</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Atmosphere</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Material Style</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-[#1e1810]">
                <span className="text-[10px] tracking-[2px] uppercase text-white">Camera Angle</span>
                <span className="text-[9px] tracking-widest text-[#FFB000]">Coming Soon</span>
              </div>
            </div>

            <div className="mt-auto p-4 border border-[#FFB000]/20 bg-[#FFB000]/5 rounded">
              <p className="text-[9px] tracking-widest uppercase text-[#FFB000]/80 leading-relaxed text-center">
                Advanced structural filtering modules are currently offline pending authorization.
              </p>
            </div>
          </div>
        </div>

      </main>
    </main>
  );
}
