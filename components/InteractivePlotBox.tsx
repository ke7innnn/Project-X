'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';

export default function InteractivePlotBox() {
  const { collectedParameters, updateParameters } = useArchitectStore();
  
  const [isConfirmed, setIsConfirmed] = useState(
    !!collectedParameters.plotWidth && !!collectedParameters.plotHeight
  );
  
  const [inputW, setInputW] = useState(collectedParameters.plotWidth?.toString() || '');
  const [inputH, setInputH] = useState(collectedParameters.plotHeight?.toString() || '');
  
  const [isLocked, setIsLocked] = useState(true);
  const [editingDimension, setEditingDimension] = useState<'width' | 'height' | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // 1 meter = 4 pixels for visual representation (scale factor)
  const pxPerMeter = 4;
  
  const [boxW, setBoxW] = useState((collectedParameters.plotWidth || 50) * pxPerMeter);
  const [boxH, setBoxH] = useState((collectedParameters.plotHeight || 50) * pxPerMeter);

  // Sync state if AI updates it via chat
  useEffect(() => {
    if (collectedParameters.plotWidth && collectedParameters.plotHeight) {
      setBoxW(collectedParameters.plotWidth * pxPerMeter);
      setBoxH(collectedParameters.plotHeight * pxPerMeter);
      setIsConfirmed(true);
    }
  }, [collectedParameters.plotWidth, collectedParameters.plotHeight]);

  const handleConfirm = () => {
    const w = parseFloat(inputW);
    const h = parseFloat(inputH);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      updateParameters({ plotWidth: w, plotHeight: h });
      setIsConfirmed(true);
    }
  };

  const handleFinalize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const { currentFloorPlan, setCurrentFloorPlan, updateParameters } = useArchitectStore.getState();
    if (!currentFloorPlan) return;
    
    // The parent is the white container div (bg-white p-16 aspect-square)
    const whiteContainer = containerRef.current?.parentElement;
    const imgEl = whiteContainer?.querySelector('img') as HTMLImageElement | null;
    if (!imgEl || !whiteContainer) return;

    // The box element is the first child of containerRef (the div with width/height style)
    const boxEl = containerRef.current?.firstElementChild as HTMLElement | null;
    if (!boxEl) return;

    // Load the intrinsic image at full resolution
    const img = new Image();
    img.src = `data:image/jpeg;base64,${currentFloorPlan}`;
    await new Promise((resolve) => { img.onload = resolve; });

    // --- Step 1: Measure exact screen positions ---
    const containerRect = whiteContainer.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();

    // --- Step 2: Figure out where image pixels actually render (object-contain) ---
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const elemAspect = imgRect.width / imgRect.height;

    let renderedW: number, renderedH: number, renderedScreenLeft: number, renderedScreenTop: number;
    if (imgAspect > elemAspect) {
      renderedW = imgRect.width;
      renderedH = imgRect.width / imgAspect;
      renderedScreenLeft = imgRect.left;
      renderedScreenTop = imgRect.top + (imgRect.height - renderedH) / 2;
    } else {
      renderedH = imgRect.height;
      renderedW = imgRect.height * imgAspect;
      renderedScreenLeft = imgRect.left + (imgRect.width - renderedW) / 2;
      renderedScreenTop = imgRect.top;
    }

    // --- Step 3: Scale factor so image renders at its natural resolution ---
    const pxPerScreenPx = img.naturalWidth / renderedW;

    // --- Step 4: Create a canvas matching the ENTIRE white container ---
    const canvasW = Math.round(containerRect.width * pxPerScreenPx);
    const canvasH = Math.round(containerRect.height * pxPerScreenPx);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill entire canvas with white (matches the white container background)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // --- Step 5: Draw the image at its correct position within the canvas ---
    const imgCanvasX = (renderedScreenLeft - containerRect.left) * pxPerScreenPx;
    const imgCanvasY = (renderedScreenTop - containerRect.top) * pxPerScreenPx;
    // Draw at natural resolution (img.naturalWidth × img.naturalHeight)
    ctx.drawImage(img, imgCanvasX, imgCanvasY, img.naturalWidth, img.naturalHeight);

    // --- Step 6: Draw the box at its correct position within the canvas ---
    const boxCanvasX = (boxRect.left - containerRect.left) * pxPerScreenPx;
    const boxCanvasY = (boxRect.top - containerRect.top) * pxPerScreenPx;
    const boxCanvasW = boxRect.width * pxPerScreenPx;
    const boxCanvasH = boxRect.height * pxPerScreenPx;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(3, 4 * pxPerScreenPx);
    ctx.strokeRect(boxCanvasX, boxCanvasY, boxCanvasW, boxCanvasH);

    // Export back to base64
    const newBase64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    setCurrentFloorPlan(newBase64);
    updateParameters({ isPlotBurned: true });
  };

  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    startPosRef.current = { x: e.clientX, y: e.clientY, w: boxW, h: boxH };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - startPosRef.current.x;
      const dy = moveEvent.clientY - startPosRef.current.y;
      
      let newW = startPosRef.current.w;
      let newH = startPosRef.current.h;

      const containerW = containerRef.current?.clientWidth || 472;
      const containerH = containerRef.current?.clientHeight || 472;

      if (handle === 'br') {
        if (isLocked) {
          const ratio = startPosRef.current.w / startPosRef.current.h;
          // Use the larger delta axis to drive the scale
          const scaleW = (startPosRef.current.w + dx * 2) / startPosRef.current.w;
          const scaleH = (startPosRef.current.h + dy * 2) / startPosRef.current.h;
          const scale = Math.max(scaleW, scaleH);
          newW = Math.max(80, startPosRef.current.w * scale);
          newH = Math.max(80, startPosRef.current.h * scale);
        } else {
          newW = Math.max(80, startPosRef.current.w + dx * 2);
          newH = Math.max(80, startPosRef.current.h + dy * 2);
        }
      }
      
      setBoxW(newW);
      setBoxH(newH);
      
      // Update actual meters
      updateParameters({ 
        plotWidth: Math.round(newW / pxPerMeter), 
        plotHeight: Math.round(newH / pxPerMeter) 
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  if (!isConfirmed) {
    return (
      <div className="absolute inset-0 bg-[#0A0E1A]/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-xl">
        <div className="bg-[#1F2937] p-6 rounded-xl border border-gray-700 shadow-2xl">
          <h3 className="text-[#FFB000] text-lg font-semibold mb-4">Set Plot Dimensions</h3>
          <div className="flex gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Width (m)</label>
              <input type="number" value={inputW} onChange={(e) => setInputW(e.target.value)} className="w-24 bg-[#0A0E1A] text-white p-2 rounded border border-gray-600 focus:border-[#FFB000] outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Height (m)</label>
              <input type="number" value={inputH} onChange={(e) => setInputH(e.target.value)} className="w-24 bg-[#0A0E1A] text-white p-2 rounded border border-gray-600 focus:border-[#FFB000] outline-none" />
            </div>
          </div>
          <button onClick={handleConfirm} className="w-full bg-[#FFB000] text-[#0A0E1A] font-semibold py-2 rounded hover:bg-[#A38A65] transition-colors">
            Confirm & Draw Plot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-16 flex items-center justify-center pointer-events-none z-40 rounded-xl">
      <div 
        style={{ width: boxW, height: boxH }}
        className="relative flex-shrink-0 border-2 border-solid border-[#000000] bg-[#FFB000]/5 shadow-[0_0_30px_rgba(196,168,130,0.15)] hover:bg-[#FFB000]/10 pointer-events-auto transition-colors flex items-center justify-center group"
      >
          <>
            <div className="absolute -top-6 text-[#FFB000] font-mono text-xs bg-[#111827] px-2 py-0.5 rounded shadow border border-gray-800 cursor-text pointer-events-auto transition-colors hover:bg-gray-800" onClick={() => setEditingDimension('width')}>
          {editingDimension === 'width' ? (
            <input 
              type="number" autoFocus 
              className="bg-transparent outline-none w-12 text-center text-[#FFB000]" 
              defaultValue={Math.round(boxW / pxPerMeter)} 
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                  setBoxW(val * pxPerMeter);
                  updateParameters({ plotWidth: val });
                }
                setEditingDimension(null);
              }} 
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} 
            />
          ) : `${Math.round(boxW / pxPerMeter)}m Width`}
        </div>
        
        <div className="absolute -left-16 top-1/2 -translate-y-1/2 -rotate-90 text-[#FFB000] font-mono text-xs bg-[#111827] px-2 py-0.5 rounded shadow border border-gray-800 cursor-text pointer-events-auto transition-colors hover:bg-gray-800" onClick={() => setEditingDimension('height')}>
          {editingDimension === 'height' ? (
            <input 
              type="number" autoFocus 
              className="bg-transparent outline-none w-12 text-center text-[#FFB000]" 
              defaultValue={Math.round(boxH / pxPerMeter)} 
              onBlur={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) {
                  setBoxH(val * pxPerMeter);
                  updateParameters({ plotHeight: val });
                }
                setEditingDimension(null);
              }} 
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} 
            />
          ) : `${Math.round(boxH / pxPerMeter)}m Height`}
        </div>
          </>
        
        {/* Resize Handle */}
          <div 
            onMouseDown={(e) => handleMouseDown(e, 'br')}
            className="absolute -bottom-3 -right-3 w-6 h-6 bg-[#FFB000] rounded-full cursor-se-resize shadow-lg flex items-center justify-center"
          >
            <div className="w-2 h-2 bg-[#0A0E1A] rounded-full" />
          </div>
        
        {/* Ratio Lock Toggle */}
          <button 
            onClick={(e) => { e.stopPropagation(); setIsLocked(!isLocked); }} 
            className="absolute bottom-2 left-2 text-[#FFB000]/50 hover:text-[#FFB000] z-50 pointer-events-auto text-xs font-mono bg-[#111827]/80 px-2 rounded"
          >
            {isLocked ? '🔒 Locked Ratio' : '🔓 Free Resize'}
          </button>

        {/* Finalize Button */}
          <button 
            onClick={handleFinalize} 
            className="absolute -bottom-10 bg-[#FFB000] text-[#0A0E1A] font-semibold text-xs px-4 py-1.5 rounded shadow hover:bg-[#A38A65] pointer-events-auto transition-colors opacity-0 group-hover:opacity-100"
          >
            ✓ Submit Plot
          </button>
      </div>
    </div>
  );
}
