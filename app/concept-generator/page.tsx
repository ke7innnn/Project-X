'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Download, Sparkles, X, Undo2, Redo2 } from 'lucide-react';

interface Point { x: number; y: number; }

const CANVAS_RATIOS = [
  { label: 'Square (Large)', id: 'square', w: 888, h: 888, falSize: 'square_hd' },
  { label: 'Landscape (Large)', id: 'landscape', w: 960, h: 636, falSize: 'landscape_4_3' },
  { label: 'Portrait (Large)', id: 'portrait', w: 636, h: 888, falSize: 'portrait_4_3' },
] as const;
type RatioId = typeof CANVAS_RATIOS[number]['id'];
const CELL_PX = 12;

const FAL_OUTPUT_SIZES: Record<string, { w: number; h: number }> = {
  'square_hd': { w: 1024, h: 1024 },
  'square': { w: 512, h: 512 },
  'landscape_4_3': { w: 1024, h: 768 },
  'landscape_16_9': { w: 1024, h: 576 },
  'portrait_4_3': { w: 768, h: 1024 },
  'portrait_16_9': { w: 576, h: 1024 },
};

function polygonArea(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[]
) {
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length; i++) {
    const p2 = pts[(i + 1) % pts.length];
    ctx.lineTo(p2.x, p2.y);
  }
  ctx.closePath();
}

function scalePoints(pts: Point[], fromW: number, fromH: number, toW: number, toH: number, zoomToFit = false, padding = 10): Point[] {
  let scale = Math.min(toW / fromW, toH / fromH);
  let offsetX = (toW - (fromW * scale)) / 2;
  let offsetY = (toH - (fromH * scale)) / 2;

  if (zoomToFit && pts.length >= 3) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const ptsW = maxX - minX;
    const ptsH = maxY - minY;
    const targetW = Math.max(1, toW - padding * 2);
    const targetH = Math.max(1, toH - padding * 2);

    scale = Math.min(targetW / (ptsW || 1), targetH / (ptsH || 1));
    offsetX = (toW / 2) - ((minX + maxX) / 2) * scale;
    offsetY = (toH / 2) - ((minY + maxY) / 2) * scale;
  }

  return pts.map(p => ({
    x: Math.round(p.x * scale + offsetX),
    y: Math.round(p.y * scale + offsetY)
  }));
}

function exportCleanTraceForAI(
  activePts: Point[],
  canvasW: number,
  canvasH: number,
  falSize: string
): string {
  const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
  const offscreen = document.createElement('canvas');
  offscreen.width = outSize.w;
  offscreen.height = outSize.h;
  const ctx = offscreen.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  if (activePts.length >= 3) {
    const scaledPts = scalePoints(activePts, canvasW, canvasH, outSize.w, outSize.h, true, 24);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 14;
    ctx.lineJoin = 'miter';
    drawPolygonPath(ctx, scaledPts);
    ctx.stroke();
  }

  return offscreen.toDataURL('image/png');
}

export default function ConceptGenerator() {
  const router = useRouter();

  const [ratioId, setRatioId] = useState<RatioId>('square');
  const currentRatio = CANVAS_RATIOS.find(r => r.id === ratioId) || CANVAS_RATIOS[0];
  const CANVAS_W = currentRatio.w;
  const CANVAS_H = currentRatio.h;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [activePts, setActivePts] = useState<Point[]>([]);
  const [history, setHistory] = useState<Point[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const [showGeneratedImage, setShowGeneratedImage] = useState(false);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);

    // Draw grid
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 1;
    const effectiveWidth = cvs.width * 2;
    const effectiveHeight = cvs.height * 2;
    const startX = -effectiveWidth + (pan.x % CELL_PX);
    const startY = -effectiveHeight + (pan.y % CELL_PX);
    ctx.beginPath();
    for (let x = startX; x < effectiveWidth; x += CELL_PX) {
      ctx.moveTo(x, -effectiveHeight);
      ctx.lineTo(x, effectiveHeight);
    }
    for (let y = startY; y < effectiveHeight; y += CELL_PX) {
      ctx.moveTo(-effectiveWidth, y);
      ctx.lineTo(effectiveWidth, y);
    }
    ctx.stroke();

    // Draw trace
    if (activePts.length > 0) {
      ctx.beginPath();
      ctx.moveTo(activePts[0].x, activePts[0].y);
      for (let i = 1; i < activePts.length; i++) {
        ctx.lineTo(activePts[i].x, activePts[i].y);
      }
      if (activePts.length >= 3) {
        ctx.closePath();
      }
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      if (activePts.length >= 3) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.1)';
        ctx.fill();
      }

      activePts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00f0ff';
        ctx.fill();
      });
    }

    ctx.restore();
  }, [activePts, pan, CANVAS_W, CANVAS_H]);

  const snapToGrid = (val: number) => Math.round(val / CELL_PX) * CELL_PX;

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    if (!cvs) return null;
    const rect = cvs.getBoundingClientRect();
    const scaleX = cvs.width / rect.width;
    const scaleY = cvs.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX - pan.x,
      y: (e.clientY - rect.top) * scaleY - pan.y
    };
  };

  const updateHistory = (newPts: Point[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newPts);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    const newPts = [...activePts, { x: snapToGrid(pt.x), y: snapToGrid(pt.y) }];
    setActivePts(newPts);
    updateHistory(newPts);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setActivePts(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setActivePts(history[historyIndex + 1]);
    }
  };

  const clear = () => {
    setActivePts([]);
    updateHistory([]);
  };

  const generateConcept = async () => {
    if (activePts.length < 3) return;
    setIsGeneratingImage(true);
    setGenerationError(null);

    const traceCanvasBase64 = exportCleanTraceForAI(activePts, CANVAS_W, CANVAS_H, currentRatio.falSize);

    try {
      const res = await fetch('/api/generate-concept-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traceCanvasBase64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate concept');
      
      setGeneratedImageUrls(data.imageUrls);
      setShowGeneratedImage(true);
    } catch (err: any) {
      setGenerationError(err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const currentAreaPx = polygonArea(activePts);
  const currentAreaSqm = currentAreaPx / (CELL_PX * CELL_PX);

  return (
    <div className="flex h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-[#00f0ff] selection:text-black overflow-hidden relative">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex-none flex items-center justify-between p-4 bg-[#0a0a0a] border-b border-[#1f1f1f]">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="p-2 text-zinc-400 hover:text-[#00f0ff] hover:bg-[#00f0ff]/10 rounded transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-widest text-zinc-100 uppercase flex items-center gap-3">
                <span className="text-[#00f0ff]">CONCEPT</span> GENERATOR
                <span className="px-2 py-0.5 text-[10px] bg-[#00f0ff]/20 text-[#00f0ff] rounded font-mono">NEW</span>
              </h1>
              <p className="text-xs text-zinc-500 tracking-[0.2em] font-mono">
                AI CONCEPT FLOOR PLANS
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-4 bg-black px-4 py-2 rounded border border-zinc-800 font-mono text-sm shadow-inner">
              <span className="text-zinc-500">Trace Area: <span className="text-[#00f0ff] font-bold">{currentAreaSqm.toFixed(1)} sqm</span></span>
            </div>
            {generationError && <div className="text-red-500 text-sm font-mono">{generationError}</div>}
            
            <button
              onClick={generateConcept}
              disabled={activePts.length < 3 || isGeneratingImage}
              className="px-6 py-2 bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/50 rounded hover:bg-[#00f0ff] hover:text-black hover:shadow-[0_0_15px_rgba(0,240,255,0.4)] disabled:opacity-50 transition-all font-mono tracking-widest text-sm flex items-center gap-2"
            >
              {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isGeneratingImage ? 'GENERATING...' : 'GENERATE CONCEPT'}
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center">
            
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#0a0a0a] p-1.5 rounded border border-[#1f1f1f] shadow-lg">
              <span className="px-2 text-xs font-mono tracking-widest text-zinc-500">CANVAS:</span>
              <button
                onClick={undo} disabled={historyIndex === 0}
                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-zinc-800"
                title="Undo"
              ><Undo2 className="w-4 h-4" /></button>
              <button
                onClick={redo} disabled={historyIndex === history.length - 1}
                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 rounded hover:bg-zinc-800"
                title="Redo"
              ><Redo2 className="w-4 h-4" /></button>
              
              <div className="w-px h-4 bg-zinc-800 mx-1"></div>
              
              <button onClick={() => setRatioId('square')} className={"px-3 py-1.5 text-xs font-mono rounded " + (ratioId === 'square' ? 'bg-zinc-800 text-[#00f0ff]' : 'text-zinc-500 hover:text-zinc-300')}>SQUARE</button>
              <button onClick={() => setRatioId('landscape')} className={"px-3 py-1.5 text-xs font-mono rounded " + (ratioId === 'landscape' ? 'bg-zinc-800 text-[#00f0ff]' : 'text-zinc-500 hover:text-zinc-300')}>LANDSCAPE</button>
              
              <div className="w-px h-4 bg-zinc-800 mx-1"></div>
              
              <button onClick={clear} className="px-3 py-1.5 text-xs font-mono text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded flex items-center gap-1">
                <X className="w-3 h-3" /> RESET
              </button>
            </div>
            
            <div className="relative shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-zinc-800/50" style={{ width: CANVAS_W, height: CANVAS_H }}>
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                onPointerDown={handlePointerDown}
                className="absolute inset-0 cursor-crosshair bg-black"
                style={{ width: CANVAS_W, height: CANVAS_H }}
              />
            </div>
          </div>
        </div>
      </div>
      
      {showGeneratedImage && generatedImageUrls.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-8">
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4 max-w-5xl w-full flex flex-col gap-4 shadow-2xl relative">
            <button 
              onClick={() => setShowGeneratedImage(false)}
              className="absolute -top-4 -right-4 w-8 h-8 bg-zinc-800 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors z-10 shadow-lg"
            >
              <X className="w-4 h-4" />
            </button>
            
            <div className="flex items-center justify-between border-b border-[#1f1f1f] pb-4">
              <h3 className="font-mono text-lg text-[#00f0ff] flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> CONCEPT GENERATED
              </h3>
              <a 
                href={generatedImageUrls[0]} download="concept-plan.png"
                className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 text-white rounded hover:bg-zinc-700 transition-colors font-mono text-sm"
              >
                <Download className="w-4 h-4" /> DOWNLOAD
              </a>
            </div>
            
            <div className="relative flex-1 min-h-[60vh] bg-black rounded border border-zinc-800 flex items-center justify-center overflow-hidden">
              <img src={generatedImageUrls[0]} alt="Concept Plan" className="max-w-full max-h-[60vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
