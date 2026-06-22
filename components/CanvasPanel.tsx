'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { useRef, useEffect, useState } from 'react';
import FloorPlanGrid from './FloorPlanGrid';
import InteractivePlotBox from './InteractivePlotBox';
import { Download, Upload, Palette } from 'lucide-react';

export default function CanvasPanel() {
  const { 
    phase, 
    selectedNatureImage, 
    hoveredNatureImage, 
    isLoading, 
    loadingMessage,
    currentFloorPlan,
    previousFloorPlan,
    setPreviousFloorPlan,
    setCurrentFloorPlan,
    finalRender,
    setFinalRender,
    collectedParameters
  } = useArchitectStore();

  const [styledFloorPlan, setStyledFloorPlan] = useState<string | null>(null);
  const [reimportedPlan, setReimportedPlan] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRenderLoading, setIsRenderLoading] = useState(false);
  const isRenderLoadingRef = useRef(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderAttempted, setRenderAttempted] = useState(false);

  const handleUploadRefined = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1];
        setReimportedPlan(base64);
        useArchitectStore.getState().setPhase('reimport');
        
        // Apply style
        try {
          useArchitectStore.getState().setIsLoading(true);
          useArchitectStore.getState().setLoadingMessage('Applying original architectural style...');
          
          const res = await fetch('/api/apply-style', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uploadedDrawingBase64: base64,
              collectedParameters
            })
          });
          const data = await res.json();
          if (data.styledFloorPlan) {
            setStyledFloorPlan(data.styledFloorPlan);
          }
        } catch (error) {
          console.error(error);
        } finally {
          useArchitectStore.getState().setIsLoading(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateRender = async () => {
    if (!styledFloorPlan && !currentFloorPlan) {
      setRenderError('No floor plan available to render.');
      return;
    }
    // Prevent double-click synchronously
    if (isRenderLoadingRef.current) return;
    setRenderError(null);
    setRenderAttempted(true);
    isRenderLoadingRef.current = true;
    try {
      setIsRenderLoading(true);
      const res = await fetch('/api/final-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlanBase64: styledFloorPlan || currentFloorPlan,
          collectedParameters
        })
      });
      const data = await res.json();
      if (data.render) {
        setFinalRender(data.render);
      } else {
        setRenderError(data.error || '3D render failed. Please try again.');
        setRenderAttempted(false); // Allow retry on failure
      }
    } catch (error: any) {
      console.error(error);
      setRenderError('Network error. Please check your connection and try again.');
      setRenderAttempted(false);
    } finally {
      isRenderLoadingRef.current = false;
      setIsRenderLoading(false);
    }
  };

  const downloadImage = (base64Data: string, filename: string) => {
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${base64Data}`;
    a.download = filename;
    a.click();
  };

  // Search or Concept phase: show nature ref
  if (phase === 'search' || phase === 'concept' || phase === 'parameters' || phase === 'vastu') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-transparent relative overflow-y-auto">
        {(hoveredNatureImage || selectedNatureImage) ? (
          <div className="relative w-full h-full max-h-[80vh] flex flex-col items-center justify-center bg-[#0A0E1A] rounded-xl p-4 border border-gray-800 shadow-xl mb-8">
            <h3 className="text-[#FFB000] font-semibold mb-3 flex items-center self-start z-10 relative">
              <span className="mr-2">🌿</span> Nature Reference {hoveredNatureImage ? '(Preview)' : ''}
            </h3>
            <img 
              src={(hoveredNatureImage || selectedNatureImage)!.url} 
              alt={(hoveredNatureImage || selectedNatureImage)!.description} 
              className="w-full h-full object-contain rounded-lg relative z-0"
            />
            <p className="text-gray-400 text-sm mt-3 self-start relative z-10">{(hoveredNatureImage || selectedNatureImage)!.description}</p>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            Select a nature reference image to begin
          </div>
        )}
        
        {/* Placeholder canvas grid background */}
        <div className="flex-1 w-full border border-gray-800 rounded-xl" style={{
          backgroundImage: 'radial-gradient(circle, #1F2937 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />
      </div>
    );
  }

  // Generating options phase
  if (phase === 'generate' && isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-transparent">
        <div className="w-16 h-16 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-6" />
        <h2 className="text-xl text-[#FFB000]">{loadingMessage || 'Generating floor plans...'}</h2>
      </div>
    );
  }

  // Generation done, select option
  if (phase === 'generate' && !isLoading) {
    return (
      <div className="flex-1 bg-transparent overflow-y-auto">
        <FloorPlanGrid />
      </div>
    );
  }

  // Measure / Edit phase
  if (phase === 'measure' || phase === 'edit') {
    return (
      <div className="flex-1 bg-transparent p-8 relative flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-50 bg-transparent/80 backdrop-blur-sm flex flex-col items-center justify-center">
             <div className="w-12 h-12 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-4" />
             <p className="text-[#FFB000]">{loadingMessage || 'Applying your changes... ✦'}</p>
          </div>
        )}
        
        {previousFloorPlan && (
          <div className="absolute top-4 right-4 z-40 bg-[#0A0E1A] p-2 rounded-lg border border-gray-700 shadow-xl w-48">
            <p className="text-xs text-gray-400 mb-2">Previous Version</p>
            <img src={`data:image/jpeg;base64,${previousFloorPlan}`} alt="Previous" className="w-full aspect-square object-contain rounded bg-white" />
            <button 
              onClick={() => {
                setCurrentFloorPlan(previousFloorPlan);
                setPreviousFloorPlan(null);
              }}
              className="mt-2 w-full text-xs py-1 border border-[#FFB000] text-[#FFB000] rounded hover:bg-[#FFB000]/10"
            >
              ↩ Restore
            </button>
          </div>
        )}

        {currentFloorPlan && (
          <div className="relative h-full max-h-[72vh] aspect-square bg-white p-16 rounded-xl shadow-2xl flex items-center justify-center">
            <img 
              src={`data:image/jpeg;base64,${currentFloorPlan}`} 
              alt="Current Floor Plan" 
              className="w-full h-full object-contain"
            />
            {!collectedParameters.isPlotBurned && <InteractivePlotBox />}
          </div>
        )}
      </div>
    );
  }

  // Export / Reimport Phase
  if (phase === 'export' || phase === 'reimport') {
    return (
      <div className="flex-1 bg-transparent flex flex-col p-8 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl text-[#FFB000] font-semibold">Final Layout & Rendering</h2>
          
          <div className="flex gap-4">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleUploadRefined} 
              accept="image/png, image/jpeg"
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#374151] text-white px-4 py-2 rounded-lg transition-colors border border-gray-700"
            >
              <Upload size={16} /> Upload Refined Drawing
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="w-full py-12 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-[#FFB000]">{loadingMessage}</p>
          </div>
        )}

        {phase === 'reimport' && !isLoading && (
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="bg-[#0A0E1A] p-4 rounded-xl border border-gray-800">
              <h3 className="text-gray-400 mb-3 text-sm">Your AutoCAD Upload</h3>
              {reimportedPlan && (
                <img src={`data:image/jpeg;base64,${reimportedPlan}`} alt="Uploaded" className="w-full bg-white rounded-lg" />
              )}
            </div>
            <div className="bg-[#0A0E1A] p-4 rounded-xl border border-[#FFB000]/50 shadow-[0_0_15px_rgba(196,168,130,0.1)]">
              <h3 className="text-[#FFB000] mb-3 text-sm">AI Styled Version</h3>
              {styledFloorPlan && (
                <img src={`data:image/jpeg;base64,${styledFloorPlan}`} alt="Styled" className="w-full bg-white rounded-lg" />
              )}
            </div>
          </div>
        )}

        {(phase === 'export' || (phase === 'reimport' && styledFloorPlan)) && !isLoading && (
          <div className="bg-[#0A0E1A] p-6 rounded-xl border border-gray-800 flex flex-col">
            <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
              <h3 className="text-xl text-white">Exports</h3>
              <div className="flex gap-3">
                <button 
                  onClick={() => downloadImage(styledFloorPlan || currentFloorPlan || '', 'floorplan.png')}
                  className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#374151] px-4 py-2 rounded-lg transition-colors"
                >
                  <Download size={16} /> PNG
                </button>
                <button 
                  onClick={() => handleGenerateRender()}
                  disabled={isRenderLoading}
                  className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#D8B78D] text-black font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRenderLoading ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Palette size={16} />
                  )}
                  {isRenderLoading ? 'Generating...' : finalRender ? 'Rendered ✓' : 'Generate 3D Render'}
                </button>
              </div>
            </div>

            {renderError && (
              <div className="mt-4 p-4 border border-red-500/40 rounded-xl bg-red-900/20 text-red-400 text-sm">
                ⚠️ {renderError}
              </div>
            )}
            {isRenderLoading ? (
              <div className="mt-4 p-8 border border-[#FFB000]/20 rounded-xl bg-[#0A0E1A] flex flex-col items-center justify-center min-h-[300px]">
                 <div className="w-12 h-12 border-4 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-4" />
                 <p className="text-[#FFB000] animate-pulse">Rendering high-quality 3D image...</p>
              </div>
            ) : finalRender && (
              <div className="mt-4">
                <h3 className="text-[#FFB000] mb-4 font-semibold">Premium 3D Render</h3>
                <img src={`data:image/jpeg;base64,${finalRender}`} alt="3D Render" className="w-full rounded-xl shadow-2xl" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return <div className="flex-1 bg-transparent"></div>;
}
