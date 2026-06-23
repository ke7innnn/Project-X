'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { useRef, useEffect, useState } from 'react';
import FloorPlanGrid from './FloorPlanGrid';
import InteractivePlotBox from './InteractivePlotBox';
import { Download, Upload, Palette, ZoomIn, ZoomOut, Maximize, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const VectorEditor = dynamic(() => import('./VectorEditor'), { ssr: false });

export default function CanvasPanel() {
  const [isEditingVectors, setIsEditingVectors] = useState(false);
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
    collectedParameters,
    updateParameters
  } = useArchitectStore();

  const [styledFloorPlan, setStyledFloorPlan] = useState<string | null>(null);
  const [reimportedPlan, setReimportedPlan] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRenderLoading, setIsRenderLoading] = useState(false);
  const isRenderLoadingRef = useRef(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderAttempted, setRenderAttempted] = useState(false);
  const [sunpath, setSunpath] = useState('North');
  const [customSunpath, setCustomSunpath] = useState('');

  const handleApplySunpathEdit = async () => {
    if (!finalRender || isRenderLoading) return;
    
    setRenderError(null);
    const direction = sunpath === 'custom' ? customSunpath : sunpath;
    if (!direction.trim()) {
      setRenderError('Please specify a custom direction.');
      return;
    }

    try {
      setIsRenderLoading(true);
      isRenderLoadingRef.current = true;
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
        setRenderError(data.error || 'Sunpath edit failed. Please try again.');
      }
    } catch (err) {
      setRenderError('Network error. Please check your connection and try again.');
    } finally {
      setIsRenderLoading(false);
      isRenderLoadingRef.current = false;
    }
  };

  // --- Zoom & Pan state ---
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [isZoomTransition, setIsZoomTransition] = useState(true);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setIsZoomTransition(true);
    setZoom(prev => {
      const next = Math.min(5, Math.max(0.5, prev + delta));
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePanMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsPanning(true);
    setIsZoomTransition(false);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };

    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - panStartRef.current.x;
      const dy = me.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    };
    const onUp = () => {
      setIsPanning(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const resetZoom = () => {
    setIsZoomTransition(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    setIsZoomTransition(true);
    setZoom(prev => Math.min(5, prev + 0.25));
  };

  const zoomOut = () => {
    setIsZoomTransition(true);
    setZoom(prev => {
      const next = Math.max(0.5, prev - 0.25);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

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
                updateParameters({ isPlotBurned: false });
                resetZoom();
              }}
              className="mt-2 w-full text-xs py-1 border border-[#FFB000] text-[#FFB000] rounded hover:bg-[#FFB000]/10"
            >
              ↩ Restore
            </button>
          </div>
        )}

        {currentFloorPlan && (
          <div 
            className="relative h-full max-h-[72vh] aspect-square overflow-hidden rounded-xl shadow-2xl"
            onWheel={handleWheel}
          >
            <div
              onMouseDown={handlePanMouseDown}
              onDoubleClick={resetZoom}
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isZoomTransition ? 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
                cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                width: '100%',
                height: '100%',
              }}
              className="bg-white p-16 flex items-center justify-center"
            >
              <img 
                src={`data:image/jpeg;base64,${currentFloorPlan}`} 
                alt="Current Floor Plan" 
                className="w-full h-full object-contain select-none pointer-events-none"
                draggable={false}
              />
              {!collectedParameters.isPlotBurned && <InteractivePlotBox />}
            </div>
          </div>
        )}

        {/* Zoom Controls */}
        {currentFloorPlan && (
          <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-1 bg-[#0A0E1A]/90 backdrop-blur-md rounded-xl border border-gray-700/50 shadow-2xl p-1.5">
            <button
              onClick={zoomIn}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-[#FFB000] hover:bg-[#FFB000]/10 transition-all duration-200"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <div className="text-center text-[10px] font-mono text-gray-500 select-none py-0.5">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={zoomOut}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-[#FFB000] hover:bg-[#FFB000]/10 transition-all duration-200"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <div className="w-full h-px bg-gray-700/50 my-0.5" />
            <button
              onClick={resetZoom}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-300 hover:text-[#FFB000] hover:bg-[#FFB000]/10 transition-all duration-200"
              title="Reset Zoom"
            >
              <Maximize size={16} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Export / Reimport Phase
  if (phase === 'export' || phase === 'reimport') {
    return (
      <div className="flex-1 bg-transparent flex flex-col p-8 overflow-y-auto relative">
        {isEditingVectors && (
          <VectorEditor onClose={() => setIsEditingVectors(false)} />
        )}

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
              onClick={() => setIsEditingVectors(true)}
              className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#e09c00] text-black font-bold px-4 py-2 rounded-lg transition-all shadow-[0_0_15px_rgba(255,176,0,0.15)] hover:shadow-[0_0_20px_rgba(255,176,0,0.3)]"
            >
              <Palette size={16} /> Start CAD Vector Editor
            </button>
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
              <div className="mt-4 flex flex-col gap-6">
                <div>
                  <h3 className="text-[#FFB000] mb-4 font-semibold">Premium 3D Render</h3>
                  <img src={`data:image/jpeg;base64,${finalRender}`} alt="3D Render" className="w-full rounded-xl shadow-2xl" />
                </div>

                <div className="p-4 border border-[#FFB000]/30 bg-[#FFB000]/5 rounded-xl flex flex-col gap-3">
                  <span className="text-[11px] font-bold tracking-[2px] uppercase text-[#FFB000]">Change Sunpath</span>
                  <p className="text-[9px] text-[#FFB000]/60 uppercase tracking-wider leading-relaxed">
                    Shift the position of the sun. Long, sharp shadows will dynamically project on the opposite side of the structure.
                  </p>
                  
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 flex flex-col gap-2">
                      <label className="text-[9px] uppercase tracking-widest text-zinc-400">Select Direction</label>
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
                      <div className="flex-1 flex flex-col gap-2">
                        <label className="text-[9px] uppercase tracking-widest text-zinc-400">Custom Position</label>
                        <input
                          type="text"
                          value={customSunpath}
                          onChange={(e) => setCustomSunpath(e.target.value)}
                          placeholder="E.G. LOW ON THE WESTERN HORIZON"
                          className="w-full bg-black text-xs border border-gray-700 text-white rounded px-3 py-2.5 focus:outline-none focus:border-[#FFB000] uppercase font-mono tracking-wider"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleApplySunpathEdit}
                    disabled={isRenderLoading}
                    className="mt-2 py-3 bg-[#FFB000] text-black font-bold uppercase tracking-widest text-[9px] rounded hover:bg-[#D8B78D] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,176,0,0.1)]"
                  >
                    {isRenderLoading && <Loader2 size={12} className="animate-spin" />}
                    {isRenderLoading ? 'Recalculating Shadows...' : 'Apply Sunpath Edit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return <div className="flex-1 bg-transparent"></div>;
}
