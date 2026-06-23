'use client';

import React, { useState, useRef } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Box, Download, Settings2, Sparkles, Loader2, UploadCloud } from 'lucide-react';
import CinematicIntro from '@/components/CinematicIntro';

export default function Render3DPage() {
  const router = useRouter();
  const { currentFloorPlan, setCurrentFloorPlan, finalRender, setFinalRender, collectedParameters, sessionId } = useArchitectStore();



  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sunpath, setSunpath] = useState('North');
  const [customSunpath, setCustomSunpath] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('Normal');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleApplySunpathEdit = async () => {
    if (!finalRender || isRendering) return;
    
    setIsRendering(true);
    setError(null);
    const direction = sunpath === 'custom' ? customSunpath : sunpath;
    if (!direction.trim()) {
      setError('Please specify a custom direction.');
      setIsRendering(false);
      return;
    }

    try {
      const res = await fetch('/api/final-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingRenderBase64: finalRender,
          isSunpathEdit: true,
          sunpathDirection: direction,
          collectedParameters
        })
      });
      const data = await res.json();
      if (data.render) {
        setFinalRender(data.render);
      } else {
        setError(data.error || 'Sunpath edit failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsRendering(false);
    }
  };

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
          collectedParameters,
          renderStyle: selectedStyle
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCurrentFloorPlan(base64);
        setFinalRender(null); // Reset render when a new plan is uploaded
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
        
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-[#FFB000]/30 text-[#FFB000] hover:bg-[#FFB000]/10 hover:border-[#FFB000] font-bold rounded transition-colors"
          >
            <UploadCloud size={14} /> Upload Plan
          </button>
          
          {finalRender && (
            <button 
              onClick={downloadImage}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#FFB000] text-[#0a0a0f] hover:bg-[#D8B78D] font-bold rounded transition-colors"
            >
              <Download size={14} /> Export Render
            </button>
          )}
        </div>
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
                className="w-full h-full object-contain"
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
            <div className="flex flex-col items-center justify-center text-[#FFB000]/40 p-12 border-2 border-dashed border-[#FFB000]/20 rounded-xl bg-[#0f0f18]/30">
              <UploadCloud size={64} className="mb-6 opacity-50 text-[#FFB000]" />
              <h2 className="text-xl tracking-[4px] font-bold text-white uppercase mb-2">Upload Floor Plan</h2>
              <p className="text-[#FFB000]/60 tracking-[2px] text-xs uppercase max-w-md text-center mb-8">
                Upload a 2D floor plan image to initialize the photorealistic 3D generation sequence.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-8 py-4 bg-[#FFB000]/10 border border-[#FFB000] text-[#FFB000] hover:bg-[#FFB000] hover:text-[#0a0a0f] uppercase tracking-widest font-bold transition-all"
              >
                <UploadCloud size={18} /> Select Image
              </button>
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

            {/* Architectural Style Selector */}
            <div className="p-4 border border-zinc-800 bg-[#07070a] rounded flex flex-col gap-3">
              <span className="text-[10px] font-bold tracking-[2px] uppercase text-white">Architectural Style</span>
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider leading-relaxed">
                Choose an architectural aesthetic theme for the generated 3D render.
              </p>
              
              <div className="space-y-2">
                <select
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  disabled={isRendering}
                  className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono cursor-pointer"
                >
                  <option value="Normal">Style: Normal / Default</option>
                  <optgroup label="Minimalist">
                    <option value="Minimalist Modern">Minimalist Modern</option>
                    <option value="Japandi">Japandi</option>
                    <option value="Scandinavian">Scandinavian</option>
                    <option value="Bauhaus">Bauhaus</option>
                  </optgroup>
                  <optgroup label="Industrial">
                    <option value="Industrial Loft">Industrial Loft</option>
                    <option value="Brutalist">Brutalist</option>
                    <option value="Warehouse Conversion">Warehouse Conversion</option>
                    <option value="Steampunk">Steampunk</option>
                  </optgroup>
                  <optgroup label="Modern">
                    <option value="Contemporary">Contemporary</option>
                    <option value="Mid-Century Modern">Mid-Century Modern</option>
                    <option value="Hi-Tech">Hi-Tech</option>
                    <option value="Parametric/Deconstructivist">Parametric/Deconstructivist</option>
                  </optgroup>
                  <optgroup label="Organic/Natural">
                    <option value="Biophilic">Biophilic</option>
                    <option value="Earthen/Adobe">Earthen/Adobe</option>
                    <option value="Blob Architecture">Blob Architecture</option>
                    <option value="Mediterranean">Mediterranean</option>
                  </optgroup>
                  <optgroup label="Historic/Classical">
                    <option value="Gothic">Gothic</option>
                    <option value="Renaissance">Renaissance</option>
                    <option value="Neoclassical">Neoclassical</option>
                    <option value="Victorian">Victorian</option>
                  </optgroup>
                  <optgroup label="Futuristic/Speculative">
                    <option value="Cyberpunk">Cyberpunk</option>
                    <option value="Sci-Fi">Sci-Fi</option>
                    <option value="Afrofuturist">Afrofuturist</option>
                    <option value="Solarpunk">Solarpunk</option>
                  </optgroup>
                  <optgroup label="Luxury/Decorative">
                    <option value="Contemporary Luxury">Contemporary Luxury</option>
                    <option value="Art Deco">Art Deco</option>
                    <option value="Maximalist">Maximalist</option>
                    <option value="Tropical Luxury">Tropical Luxury</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Active Sunpath Controller */}
            {finalRender ? (
              <div className="p-4 border border-[#FFB000]/30 bg-[#FFB000]/5 rounded flex flex-col gap-3">
                <span className="text-[10px] font-bold tracking-[2px] uppercase text-[#FFB000]">Change Sunpath</span>
                <p className="text-[9px] text-[#FFB000]/60 uppercase tracking-wider leading-relaxed">
                  Shift the position of the sun. Long, sharp shadows will dynamically project on the opposite side of the structure.
                </p>
                
                <div className="space-y-2">
                  <label className="block text-[9px] uppercase tracking-widest text-zinc-400">Direction</label>
                  <select
                    value={sunpath}
                    onChange={(e) => {
                      setSunpath(e.target.value);
                      if (e.target.value !== 'custom') setCustomSunpath('');
                    }}
                    className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono"
                  >
                    <option value="North">North (Shadows South)</option>
                    <option value="South">South (Shadows North)</option>
                    <option value="East">East (Shadows West)</option>
                    <option value="West">West (Shadows East)</option>
                    <option value="North-East">North-East (Shadows South-West)</option>
                    <option value="North-West">North-West (Shadows South-East)</option>
                    <option value="South-East">South-East (Shadows North-West)</option>
                    <option value="South-West">South-West (Shadows North-East)</option>
                    <option value="custom">Custom Direction...</option>
                  </select>
                </div>

                {sunpath === 'custom' && (
                  <div className="space-y-2">
                    <label className="block text-[9px] uppercase tracking-widest text-zinc-400">Custom Position</label>
                    <input
                      type="text"
                      value={customSunpath}
                      onChange={(e) => setCustomSunpath(e.target.value)}
                      placeholder="E.G. LOW ON THE WESTERN HORIZON"
                      className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono tracking-wider"
                    />
                  </div>
                )}

                <button
                  onClick={handleApplySunpathEdit}
                  disabled={isRendering}
                  className="w-full py-3 mt-2 bg-[#FFB000] text-black font-bold uppercase tracking-widest text-[9px] rounded hover:bg-[#D8B78D] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isRendering && <Loader2 size={12} className="animate-spin" />}
                  {isRendering ? 'Recalculating Shadows...' : 'Apply Sunpath Edit'}
                </button>
              </div>
            ) : (
              <p className="text-[9px] tracking-widest uppercase text-zinc-500 text-center py-4">
                Initialize render to unlock filters
              </p>
            )}

            {/* Filter Placeholders */}
            <div className="space-y-4 opacity-30 pointer-events-none">
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
