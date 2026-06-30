'use client';

import { useArchitectStore } from '@/store/useArchitectStore';
import { useRef, useEffect, useState } from 'react';
import FloorPlanGrid from './FloorPlanGrid';
import InteractivePlotBox from './InteractivePlotBox';
import { Download, Upload, Palette, ZoomIn, ZoomOut, Maximize, Loader2, FileDown } from 'lucide-react';
import dynamic from 'next/dynamic';
import { RenderHistoryItem } from '@/types';
import { playSound } from '@/lib/sounds';

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
    floorPlanHistory,
    previousFloorPlan,
    setPreviousFloorPlan,
    setCurrentFloorPlan,
    finalRender,
    setFinalRender,
    collectedParameters,
    updateParameters,
    selectedStyle,
    setSelectedStyle,
    sunpath,
    setSunpath,
    customSunpath,
    setCustomSunpath,
    renderHistory,
    setRenderHistory,
    viewingHistoryId,
    setViewingHistoryId
  } = useArchitectStore();

  const [styledFloorPlan, setStyledFloorPlan] = useState<string | null>(null);
  const [reimportedPlan, setReimportedPlan] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRenderLoading, setIsRenderLoading] = useState(false);
  const isRenderLoadingRef = useRef(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderAttempted, setRenderAttempted] = useState(false);

  const generateRender = async (styleVal?: string, sunpathVal?: string) => {
    if (!styledFloorPlan && !currentFloorPlan) {
      setRenderError('No floor plan available to render.');
      return;
    }
    if (isRenderLoadingRef.current) return;
    setRenderError(null);
    setRenderAttempted(true);
    isRenderLoadingRef.current = true;
    
    const styleToUse = styleVal !== undefined ? styleVal : selectedStyle;
    const pathVal = sunpathVal !== undefined ? sunpathVal : sunpath;
    const directionToUse = pathVal === 'custom' ? customSunpath : pathVal;

    try {
      setIsRenderLoading(true);
      const res = await fetch('/api/final-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlanBase64: styledFloorPlan || currentFloorPlan,
          collectedParameters,
          renderStyle: styleToUse,
          sunpathDirection: directionToUse
        })
      });
      const data = await res.json();
      if (data.render) {
        const newItem: RenderHistoryItem = {
          id: Math.random().toString(),
          base64: data.render,
          style: styleToUse,
          sunpath: directionToUse
        };
        setRenderHistory([...renderHistory, newItem]);
        setViewingHistoryId(newItem.id); // Show the new render in detail
        setFinalRender(data.render); // Save in store
      } else {
        setRenderError(data.error || '3D render failed. Please try again.');
        setRenderAttempted(false);
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

  const handleApplySunpathEdit = () => generateRender(selectedStyle, sunpath);

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

  const handleGenerateRender = () => generateRender(selectedStyle, sunpath);

  const downloadImage = (base64Data: string, filename: string) => {
    const a = document.createElement('a');
    a.href = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    a.download = filename;
    a.click();
  };

  const exportProfessionalBlueprint = async () => {
    const base64 = styledFloorPlan || currentFloorPlan;
    if (!base64) return;
    
    const img = new window.Image();
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A4 Landscape at 300dpi
    const canvasWidth = 3508;
    const canvasHeight = 2480;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const margin = 100;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10;
    ctx.strokeRect(margin, margin, canvasWidth - margin * 2, canvasHeight - margin * 2);
    ctx.lineWidth = 4;
    ctx.strokeRect(margin + 20, margin + 20, canvasWidth - (margin + 20) * 2, canvasHeight - (margin + 20) * 2);

    const maxImgWidth = canvasWidth - margin * 4;
    const maxImgHeight = canvasHeight - margin * 4 - 300;
    
    const scale = Math.min(maxImgWidth / img.width, maxImgHeight / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const drawX = (canvasWidth - drawWidth) / 2;
    const drawY = margin + 40 + (maxImgHeight - drawHeight) / 2;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    const tbWidth = 800;
    const tbHeight = 250;
    const tbX = canvasWidth - margin - 20 - tbWidth;
    const tbY = canvasHeight - margin - 20 - tbHeight;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(tbX, tbY, tbWidth, tbHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeRect(tbX, tbY, tbWidth, tbHeight);

    ctx.beginPath();
    ctx.moveTo(tbX, tbY + 80);
    ctx.lineTo(tbX + tbWidth, tbY + 80);
    ctx.moveTo(tbX, tbY + 160);
    ctx.lineTo(tbX + tbWidth, tbY + 160);
    ctx.moveTo(tbX + tbWidth / 2, tbY + 160);
    ctx.lineTo(tbX + tbWidth / 2, tbY + tbHeight);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';

    ctx.font = 'bold 36px monospace';
    ctx.fillText('PROJECT:', tbX + 20, tbY + 45);
    ctx.font = 'bold 48px sans-serif';
    const projName = useArchitectStore.getState().projectName || 'AI ARCHITECT LAYOUT';
    ctx.fillText(projName, tbX + 220, tbY + 55);

    ctx.font = 'bold 28px monospace';
    ctx.fillText('DRAWING TITLE: Floor Plan', tbX + 20, tbY + 125);
    
    ctx.font = '24px monospace';
    ctx.fillText(`DATE: ${new Date().toLocaleDateString()}`, tbX + 20, tbY + 200);
    ctx.fillText(`SCALE: NTS`, tbX + 20, tbY + 230);

    ctx.font = 'bold 24px monospace';
    ctx.fillText(`GENERATED BY:`, tbX + tbWidth / 2 + 20, tbY + 200);
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`RENDER ZONE AI`, tbX + tbWidth / 2 + 20, tbY + 230);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    downloadImage(dataUrl, 'Professional_Blueprint.jpg');
    playSound('success');
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
        
        {floorPlanHistory && floorPlanHistory.length > 1 && (
          <div className="absolute left-6 top-6 bottom-6 w-24 bg-[#0A0E1A]/80 backdrop-blur-md border border-[#222] rounded-xl z-40 flex flex-col items-center py-4 overflow-y-auto shadow-2xl space-y-6 custom-scrollbar hidden md:flex">
            <h3 className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-2">History</h3>
            {floorPlanHistory.map((historyBase64, idx) => {
              const isCurrent = historyBase64 === currentFloorPlan;
              return (
                <div 
                  key={idx}
                  onClick={() => {
                    setCurrentFloorPlan(historyBase64);
                    updateParameters({ isPlotBurned: false });
                    resetZoom();
                  }}
                  className={`relative w-16 h-16 rounded-lg cursor-pointer transition-all duration-300 border-2 flex-shrink-0 ${isCurrent ? 'border-[#FFB000] scale-110 shadow-[0_0_15px_rgba(255,176,0,0.4)]' : 'border-transparent opacity-50 hover:opacity-100 hover:border-[#444]'}`}
                  title={`Version ${idx + 1}`}
                >
                  <img src={historyBase64.startsWith('data:') ? historyBase64 : `data:image/jpeg;base64,${historyBase64}`} alt={`v${idx+1}`} className="w-full h-full object-cover rounded bg-white" />
                  <div className="absolute -bottom-5 left-0 right-0 text-center text-[9px] text-[#888] font-bold">V{idx + 1}</div>
                </div>
              );
            })}
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
          <div className="bg-[#0A0E1A] p-6 rounded-xl border border-gray-800 flex flex-col gap-6">
            
            {/* BIG VIEWPORT: 2D Blueprint View is always visible */}
            <div className="flex flex-col gap-6 border-b border-gray-800 pb-6">
                <div className="flex justify-between items-center pb-4 border-b border-gray-800">
                  <h3 className="text-xl text-white">2D Blueprint View</h3>
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedStyle}
                      onChange={(e) => setSelectedStyle(e.target.value)}
                      disabled={isRenderLoading}
                      className="bg-[#1F2937] text-white text-xs border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:border-[#FFB000] uppercase font-mono h-[38px] cursor-pointer"
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

                    <button 
                      onClick={() => {
                        playSound('click');
                        downloadImage(styledFloorPlan || currentFloorPlan || '', 'floorplan.png');
                      }}
                      className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#374151] px-4 py-2 rounded-lg transition-colors h-[38px] text-white"
                      title="Download raw image"
                    >
                      <Download size={16} /> PNG
                    </button>
                    <button 
                      onClick={() => {
                        playSound('click');
                        exportProfessionalBlueprint();
                      }}
                      className="flex items-center gap-2 border-2 border-[#FFB000] text-[#FFB000] hover:bg-[#FFB000] hover:text-black font-semibold px-4 py-2 rounded-lg transition-colors h-[38px] cursor-pointer"
                    >
                      <Download size={16} /> Export Blueprint
                    </button>
                    <button 
                      onClick={() => {
                        playSound('click');
                        handleGenerateRender();
                      }}
                      disabled={isRenderLoading}
                      className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#D8B78D] text-black font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed h-[38px] cursor-pointer"
                    >
                      {isRenderLoading ? (
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Palette size={16} />
                      )}
                      {isRenderLoading ? 'Generating...' : 'Generate 3D Render'}
                    </button>
                  </div>
                </div>

                {renderError && (
                  <div className="p-4 border border-red-500/40 rounded-xl bg-red-900/20 text-red-400 text-sm">
                    ⚠️ {renderError}
                  </div>
                )}

                {/* Flat 2D Blueprint image */}
                <div className="w-full max-h-[50vh] flex items-center justify-center bg-white p-6 rounded-xl border border-gray-800">
                  <img 
                    src={`data:image/jpeg;base64,${styledFloorPlan || currentFloorPlan}`} 
                    alt="Active 2D Floor Plan" 
                    className="max-w-full max-h-[45vh] object-contain rounded"
                  />
                </div>

                {/* Sunpath controls on the drawing panel */}
                <div className="p-4 border border-[#FFB000]/30 bg-[#FFB000]/5 rounded-xl flex flex-col gap-3">
                  <span className="text-[11px] font-bold tracking-[2px] uppercase text-[#FFB000]">Configure Shadows (Sunpath)</span>
                  <p className="text-[9px] text-[#FFB000]/60 uppercase tracking-wider leading-relaxed">
                    Set the position of the sun. Diffuse, soft shadows will be projected opposite to this direction during generation.
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
                </div>
              </div>

            {/* RENDER HISTORY SECTION */}
            <div>
              <h3 className="text-sm font-bold tracking-[3px] text-white uppercase mb-4">Generated 3D Renders History</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {renderHistory.map((item) => (
                  <div key={item.id} className="bg-[#07070d] border border-gray-800 rounded-xl overflow-hidden hover:border-[#FFB000]/50 transition-all flex flex-col shadow-lg">
                    <div className="aspect-video relative overflow-hidden bg-black/40">
                      <img src={`data:image/jpeg;base64,${item.base64}`} alt="Render Thumb" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold text-[#FFB000] uppercase truncate">{item.style}</div>
                        <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1">Sun: {item.sunpath}</div>
                      </div>
                      
                      <div className="flex gap-1.5 mt-2">
                        <button
                          onClick={() => setViewingHistoryId(item.id)}
                          className="flex-1 py-1.5 bg-[#FFB000]/10 border border-[#FFB000]/30 hover:border-[#FFB000] text-[#FFB000] hover:text-[#0a0a0f] hover:bg-[#FFB000] font-bold uppercase tracking-widest text-[8px] rounded transition-all cursor-pointer"
                        >
                          Inspect / Edit
                        </button>
                        <button
                          onClick={() => downloadImage(item.base64, `render-${item.style.replace(/\s+/g, '-')}.png`)}
                          className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-[8px] transition-colors cursor-pointer"
                          title="Download"
                        >
                          <Download size={12} />
                        </button>
                        <button
                          onClick={() => {
                            setRenderHistory(renderHistory.filter((h: RenderHistoryItem) => h.id !== item.id));
                            if (viewingHistoryId === item.id) setViewingHistoryId(null);
                          }}
                          className="px-2 py-1.5 bg-red-950/20 hover:bg-red-900/50 text-red-400 rounded text-[8px] transition-colors cursor-pointer"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* GENERATING LOADING CARD */}
                {isRenderLoading && (
                  <div className="bg-[#07070d] border border-[#FFB000]/40 rounded-xl overflow-hidden animate-pulse flex flex-col justify-center items-center p-6 min-h-[160px]">
                    <div className="w-8 h-8 border-3 border-[#FFB000] border-t-transparent rounded-full animate-spin mb-3" />
                    <span className="text-[9px] text-[#FFB000] tracking-widest uppercase text-center font-bold">Generating Render...</span>
                  </div>
                )}

                {!isRenderLoading && renderHistory.length === 0 && (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center border border-dashed border-gray-800 rounded-xl bg-black/10 text-zinc-500">
                    <span className="text-xs uppercase tracking-widest">No Renders Generated Yet</span>
                    <span className="text-[9px] uppercase tracking-widest mt-1 text-zinc-600">Select a style and sunpath above to start</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* DETAILED CONCEPT INSPECT MODAL OVERLAY */}
        {viewingHistoryId && (() => {
          const activeItem = renderHistory.find(h => h.id === viewingHistoryId);
          if (!activeItem) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-8 animate-fadeIn">
              <div className="bg-[#0A0E1A] border border-[#FFB000]/30 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                {/* Modal Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#07070d]">
                  <div>
                    <h3 className="text-[#FFB000] text-sm font-semibold uppercase tracking-wider">Viewing Rendered Concept</h3>
                    <span className="text-[10px] text-zinc-400 uppercase tracking-widest block mt-0.5">
                      Style: {activeItem.style} | Shadows: {activeItem.sunpath}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadImage(activeItem.base64, `render-${activeItem.style.replace(/\s+/g, '-')}.png`)}
                      className="flex items-center gap-2 bg-[#1F2937] hover:bg-[#374151] px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer text-white font-mono"
                    >
                      <Download size={14} /> Download PNG
                    </button>
                    <button 
                      onClick={() => setViewingHistoryId(null)}
                      className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#e09c00] text-black font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer font-mono"
                    >
                      Close
                    </button>
                  </div>
                </div>
                
                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-6 bg-black/40 flex items-center justify-center min-h-0">
                  <img 
                    src={`data:image/jpeg;base64,${activeItem.base64}`} 
                    alt="Detailed 3D Render" 
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl border border-zinc-800" 
                  />
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  return <div className="flex-1 bg-transparent"></div>;
}
