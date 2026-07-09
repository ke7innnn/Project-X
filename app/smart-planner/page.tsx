'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Download, RotateCcw, ImageIcon, Sparkles, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number; }
interface Room { code: string; name: string; w: number; h: number; area: number; }
interface Flat { id: string; name: string; rooms: Room[]; }
interface RoomSchedule {
  confirmed: boolean;
  plotW: number; plotH: number;
  siteExteriorW: number; siteExteriorH: number;
  flats: Flat[];
  totalBuildupArea: number;
  buildingFootprint: number;
}
interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const CANVAS_W = 900;
const CANVAS_H = 700;
const CELL_PX = 12;
const GRID_COLS = Math.floor(CANVAS_W / CELL_PX);
const GRID_ROWS = Math.floor(CANVAS_H / CELL_PX);

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function polygonArea(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}
function polygonBoundingBox(pts: Point[]) {
  const xs = pts.map(p => p.x); const ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
function pxToM(px: number) { return +(px / CELL_PX).toFixed(1); }

// ─── Export canvas as clean white-bg PNG for GPT-Image-2 ────────────────────
function exportCanvasForAI(plotPts: Point[], sitePts: Point[]): string {
  const offscreen = document.createElement('canvas');
  offscreen.width = CANVAS_W;
  offscreen.height = CANVAS_H;
  const ctx = offscreen.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Light grid
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= CANVAS_W; x += CELL_PX) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
  for (let y = 0; y <= CANVAS_H; y += CELL_PX) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }

  // Grid scale labels
  ctx.fillStyle = '#cccccc';
  ctx.font = '8px monospace';
  for (let x = 0; x <= CANVAS_W; x += CELL_PX * 10) ctx.fillText(x / CELL_PX + 'm', x + 2, 10);
  for (let y = CELL_PX * 10; y <= CANVAS_H; y += CELL_PX * 10) ctx.fillText(y / CELL_PX + 'm', 2, y);

  // Orange dashed plot boundary
  if (plotPts.length >= 3) {
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    plotPts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('PLOT BOUNDARY', plotPts[0].x + 4, plotPts[0].y - 6);
  }

  // Cyan solid site exterior
  if (sitePts.length >= 3) {
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    sitePts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,188,212,0.06)';
    ctx.fill();
    ctx.stroke();
    // Label
    ctx.fillStyle = '#00bcd4';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('SITE EXTERIOR (FILL ROOMS INSIDE HERE)', sitePts[0].x + 4, sitePts[0].y + 14);
  }

  return offscreen.toDataURL('image/png');
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmartPlannerPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [drawMode, setDrawMode] = useState<'plot' | 'site' | null>(null);
  const [plotPoints, setPlotPoints] = useState<Point[]>([]);
  const [sitePoints, setSitePoints] = useState<Point[]>([]);
  const [plotClosed, setPlotClosed] = useState(false);
  const [siteClosed, setSiteClosed] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: '**Welcome to Smart Planner \u2014 AI Floor Plan Generator**\n\n1. **Trace your Plot Boundary** (orange mode) on the canvas\n2. **Trace your Site Exterior** (cyan mode) after setbacks\n3. **Tell me your requirements** \u2014 how many flats, BHK type\n\nI will calculate everything mathematically, then generate a professional floor plan image.\n\n**Start tracing or just tell me your plot dimensions!**'
  }]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [roomSchedule, setRoomSchedule] = useState<RoomSchedule | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [showGeneratedImage, setShowGeneratedImage] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const snapToGrid = (v: number) => Math.round(v / CELL_PX) * CELL_PX;

  // ── Canvas Renderer ─────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid
    ctx.strokeStyle = '#0d1f0d'; ctx.lineWidth = 0.5;
    for (let x = 0; x <= CANVAS_W; x += CELL_PX) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
    for (let y = 0; y <= CANVAS_H; y += CELL_PX) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }

    // Scale labels
    ctx.fillStyle = '#1a3a1a'; ctx.font = '8px monospace';
    for (let x = 0; x <= CANVAS_W; x += CELL_PX * 10) ctx.fillText(x / CELL_PX + 'm', x + 2, 10);
    for (let y = CELL_PX * 10; y <= CANVAS_H; y += CELL_PX * 10) ctx.fillText(y / CELL_PX + 'm', 2, y);

    // Plot boundary
    if (plotPoints.length > 0) {
      ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2; ctx.setLineDash([8, 4]);
      ctx.beginPath();
      plotPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      if (plotClosed) ctx.closePath();
      else if (drawMode === 'plot' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      ctx.stroke(); ctx.setLineDash([]);
      plotPoints.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#f97316' : '#fb923c'; ctx.fill();
      });
      if (!plotClosed && plotPoints.length >= 3 && drawMode === 'plot') {
        ctx.beginPath(); ctx.arc(plotPoints[0].x, plotPoints[0].y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f97316aa'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    // Site exterior
    if (sitePoints.length > 0) {
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath();
      sitePoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      if (siteClosed) { ctx.closePath(); ctx.fillStyle = 'rgba(0,240,255,0.05)'; ctx.fill(); }
      else if (drawMode === 'site' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      ctx.stroke();
      sitePoints.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#00f0ff' : '#67e8f9'; ctx.fill();
      });
      if (!siteClosed && sitePoints.length >= 3 && drawMode === 'site') {
        ctx.beginPath(); ctx.arc(sitePoints[0].x, sitePoints[0].y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#00f0ffaa'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }

    // Status hint
    if (drawMode) {
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = drawMode === 'plot' ? '#f97316' : '#00f0ff';
      ctx.fillText(
        drawMode === 'plot'
          ? '\u25cf Drawing: PLOT BOUNDARY \u2014 click to add points, click first point to close'
          : '\u25cf Drawing: SITE EXTERIOR \u2014 click to add points, click first point to close',
        10, CANVAS_H - 12
      );
    }

    // AI generating overlay
    if (isGeneratingImage) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#00f0ff';
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u2728 I\'m generating your floor plan...', CANVAS_W / 2, CANVAS_H / 2 - 16);
      ctx.font = '14px monospace';
      ctx.fillStyle = '#00f0ffaa';
      ctx.fillText('Creating layout \u2014 ~10 seconds', CANVAS_W / 2, CANVAS_H / 2 + 16);
      ctx.textAlign = 'left';
    }
  }, [plotPoints, sitePoints, plotClosed, siteClosed, hoverPoint, drawMode, isGeneratingImage]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Converts a mouse event to canvas coordinates, accounting for
  // object-contain letterboxing (empty bars on sides or top/bottom).
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    // Scale factor object-contain uses (fits canvas inside element, preserves AR)
    const displayScale = Math.min(rect.width / CANVAS_W, rect.height / CANVAS_H);
    // Actual rendered content size
    const renderedW = CANVAS_W * displayScale;
    const renderedH = CANVAS_H * displayScale;
    // Letterbox offset (centered)
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    return {
      x: snapToGrid((e.clientX - rect.left - offsetX) / displayScale),
      y: snapToGrid((e.clientY - rect.top  - offsetY) / displayScale),
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const { x, y } = getCanvasCoords(e);

    if (drawMode === 'plot' && !plotClosed) {
      if (plotPoints.length >= 3) {
        const dx = x - plotPoints[0].x, dy = y - plotPoints[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 15) { setPlotClosed(true); setDrawMode(null); return; }
      }
      setPlotPoints(prev => [...prev, { x, y }]);
    }
    if (drawMode === 'site' && !siteClosed) {
      if (sitePoints.length >= 3) {
        const dx = x - sitePoints[0].x, dy = y - sitePoints[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 15) { setSiteClosed(true); setDrawMode(null); return; }
      }
      setSitePoints(prev => [...prev, { x, y }]);
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    setHoverPoint(getCanvasCoords(e));
  };

  const getPlotContext = () => {
    if (!plotClosed || plotPoints.length < 3) return null;
    const plotBB = polygonBoundingBox(plotPoints);
    const plotAreaSqm = +(polygonArea(plotPoints) / (CELL_PX * CELL_PX)).toFixed(1);
    let siteW = pxToM(plotBB.maxX - plotBB.minX);
    let siteH = pxToM(plotBB.maxY - plotBB.minY);
    let siteArea = plotAreaSqm;
    if (siteClosed && sitePoints.length >= 3) {
      const siteBB = polygonBoundingBox(sitePoints);
      siteW = pxToM(siteBB.maxX - siteBB.minX);
      siteH = pxToM(siteBB.maxY - siteBB.minY);
      siteArea = +(polygonArea(sitePoints) / (CELL_PX * CELL_PX)).toFixed(1);
    }
    return {
      widthM: pxToM(plotBB.maxX - plotBB.minX), heightM: pxToM(plotBB.maxY - plotBB.minY),
      areaM: plotAreaSqm, siteWidthM: siteW, siteHeightM: siteH, siteAreaM: siteArea,
    };
  };

  // ── Generate floor plan image via GPT-Image-2 ────────────────────────────
  const generateFloorPlanImage = async (schedule: RoomSchedule) => {
    const plotPts = plotClosed ? plotPoints : [];
    const sitePts = siteClosed ? sitePoints : plotPts;
    const activePts = sitePts.length > 0 ? sitePts : plotPts;

    if (activePts.length < 3) {
      setGenerationError('No polygon traced — please trace your site boundary first');
      return;
    }

    setIsGeneratingImage(true);
    setGenerationError(null);
    setShowGeneratedImage(false);

    try {
      // Export a clean white-background version of the canvas
      const imageBase64 = exportCanvasForAI(plotPts, sitePts);

      const res = await fetch('/api/generate-floorplan-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, roomSchedule: schedule }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed');

      setGeneratedImageUrl(data.imageUrl);
      setShowGeneratedImage(true);
    } catch (err: any) {
      setGenerationError('Image generation failed: ' + err.message);
      console.error('[SmartPlanner] Image gen error:', err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // ── Send chat message ────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: inputText.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInputText(''); setIsLoading(true);
    setGenerationError(null);

    try {
      const res = await fetch('/api/smart-planner-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          plotBoundary: getPlotContext(),
        }),
      });
      const data = await res.json();

      if (data.roomSchedule?.confirmed) {
        const sched = data.roomSchedule as RoomSchedule;
        setRoomSchedule(sched);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.text || 'Sorry, I could not process that.'
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const downloadImage = () => {
    if (!generatedImageUrl) return;
    const a = document.createElement('a');
    a.href = generatedImageUrl;
    a.download = 'smart-floor-plan.png';
    a.target = '_blank';
    a.click();
  };

  const plotInfo = getPlotContext();
  const totalRooms = roomSchedule?.flats.reduce((s, f) => s + f.rooms.length, 0) ?? 0;

  return (
    <main className="flex flex-col w-full h-screen bg-[#050f05] text-green-400 font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-green-900/40 bg-[#050f05]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="w-9 h-9 rounded-full border border-green-700/40 hover:border-green-400 hover:bg-green-500/10 flex items-center justify-center transition-all">
            <ArrowLeft size={16} className="text-green-500" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(0,255,100,0.3)]">
              Smart Planner <span className="text-[10px] bg-green-500/20 border border-green-500/40 text-green-400 px-2 py-0.5 rounded ml-2">v3</span>
            </h1>
            <span className="text-[9px] tracking-[3px] text-green-600 uppercase">Mathematical Planning &middot; Visual Layout &middot; Vastu Compliant</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {plotInfo && (
            <div className="flex items-center gap-4 text-[10px] border border-green-900/50 rounded px-3 py-1.5 bg-[#0a1a0a]">
              <span className="text-orange-400">Plot: <strong>{plotInfo.widthM}m &times; {plotInfo.heightM}m = {plotInfo.areaM} sqm</strong></span>
              {siteClosed && <span className="text-cyan-400">Site: <strong>{plotInfo.siteWidthM}m &times; {plotInfo.siteHeightM}m = {plotInfo.siteAreaM} sqm</strong></span>}
            </div>
          )}
          {generationError && (
            <div className="text-[9px] text-red-400 border border-red-900/50 rounded px-2 py-1 bg-red-950/30 max-w-xs truncate">
              &#9888; {generationError}
            </div>
          )}
          {generatedImageUrl && (
            <button onClick={downloadImage} className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 rounded transition-all">
              <Download size={13} /> Download PNG
            </button>
          )}
          {generatedImageUrl && (
            <button onClick={() => setShowGeneratedImage(!showGeneratedImage)} className={`flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest border rounded transition-all ${showGeneratedImage ? 'bg-purple-500/20 border-purple-400 text-purple-300' : 'border-green-700/40 text-green-600 hover:border-green-500'}`}>
              <ImageIcon size={13} /> {showGeneratedImage ? 'Show Canvas' : 'Show Floor Plan'}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas / Image Panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Mode toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-green-900/30 bg-[#070f07] shrink-0">
            <span className="text-[9px] tracking-[3px] uppercase text-green-800 mr-2">Canvas:</span>
            <button
              onClick={() => { if (plotClosed) return; setDrawMode(d => d === 'plot' ? null : 'plot'); setSitePoints([]); setSiteClosed(false); }}
              disabled={plotClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold ${drawMode === 'plot' ? 'bg-orange-500/20 border-orange-400 text-orange-300' : plotClosed ? 'border-orange-900/40 text-orange-900 cursor-not-allowed' : 'border-orange-700/40 text-orange-500 hover:bg-orange-500/10'}`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              {plotClosed ? 'Plot \u2713' : drawMode === 'plot' ? 'Drawing Plot...' : 'Plot Boundary'}
            </button>
            <button
              onClick={() => setDrawMode(d => d === 'site' ? null : 'site')}
              disabled={!plotClosed || siteClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold ${drawMode === 'site' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : siteClosed ? 'border-cyan-900/40 text-cyan-900 cursor-not-allowed' : !plotClosed ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-cyan-700/40 text-cyan-500 hover:bg-cyan-500/10'}`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              {siteClosed ? 'Site Ext \u2713' : drawMode === 'site' ? 'Drawing Site...' : 'Site Exterior'}
            </button>
            <div className="ml-auto flex items-center gap-2">
              {isGeneratingImage && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-purple-400 border border-purple-900/40 rounded bg-purple-950/20">
                  <Loader2 size={11} className="animate-spin" />
                  Generating floor plan...
                </div>
              )}
              <button
                onClick={() => { setPlotPoints([]); setSitePoints([]); setPlotClosed(false); setSiteClosed(false); setDrawMode(null); setRoomSchedule(null); setGeneratedImageUrl(null); setShowGeneratedImage(false); setGenerationError(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-red-900/40 text-red-700 hover:bg-red-500/10 hover:text-red-500 transition-all"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <div className="text-[9px] text-green-900 border border-green-950 rounded px-2 py-1">
              1 cell = 1m &nbsp;|&nbsp; {GRID_COLS}m &times; {GRID_ROWS}m
            </div>
          </div>

          {/* Canvas or Generated Image */}
          <div className="flex-1 overflow-auto relative bg-[#030a03]">
            {showGeneratedImage && generatedImageUrl ? (
              <div className="w-full h-full flex items-center justify-center bg-[#030a03] p-4">
                <img
                  src={generatedImageUrl}
                  alt="AI Generated Floor Plan"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl shadow-purple-900/30 border border-purple-500/20"
                />
              </div>
            ) : (
              <canvas
                ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                className="block w-full h-full object-contain cursor-crosshair"
                onClick={handleCanvasClick} onMouseMove={handleCanvasMove}
                onMouseLeave={() => setHoverPoint(null)}
              />
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div className="w-[420px] border-l border-green-900/30 bg-[#070f07] flex flex-col shrink-0">
          <div className="px-5 py-3 border-b border-green-900/30 shrink-0">
            <h2 className="text-[11px] font-bold tracking-[3px] uppercase text-green-400">Smart Architect Chat</h2>
            <p className="text-[9px] text-green-800 uppercase tracking-wide mt-0.5">Mathematical Planning &middot; Visual Layout &middot; Vastu</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 text-[11px] leading-relaxed ${msg.role === 'user' ? 'bg-green-500/15 border border-green-500/30 text-green-200' : 'bg-[#0a180a] border border-green-900/40 text-green-300'}`}>
                  <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-green-100">$1</strong>')
                      .replace(/```json[\s\S]*?```/g, '<span class="text-green-600 text-[9px]">[Room schedule generated ✓ — Click Approve below to generate floor plan]</span>')
                      .replace(/```[\s\S]*?```/g, '<span class="text-green-600 text-[9px]">[Code block]</span>')
                  }} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#0a180a] border border-green-900/40 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-green-500" />
                  <span className="text-[10px] text-green-600">I'm thinking & calculating rooms...</span>
                </div>
              </div>
            )}
            {isGeneratingImage && !isLoading && (
              <div className="flex justify-start">
                <div className="bg-purple-950/30 border border-purple-900/40 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Sparkles size={14} className="animate-pulse text-purple-400" />
                  <span className="text-[10px] text-purple-400">I'm generating your floor plan image...</span>
                </div>
              </div>
            )}
            {generatedImageUrl && (
              <div className="border border-purple-500/30 rounded-lg bg-purple-950/20 p-4">
                <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Sparkles size={11} /> Floor Plan Generated!
                </div>
                <img src={generatedImageUrl} alt="Generated floor plan" className="w-full rounded border border-purple-900/30 mb-2" />
                <div className="flex gap-2">
                  <button onClick={() => setShowGeneratedImage(true)} className="flex-1 text-[9px] uppercase tracking-widest text-purple-400 border border-purple-900/30 rounded py-1.5 hover:bg-purple-500/10 transition-all">
                    View Full Size
                  </button>
                  <button
                    onClick={() => { setGeneratedImageUrl(null); roomSchedule && generateFloorPlanImage(roomSchedule); }}
                    disabled={isGeneratingImage}
                    className="flex-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-amber-400 border border-amber-900/40 rounded py-1.5 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <RefreshCw size={10} className={isGeneratingImage ? 'animate-spin' : ''} />
                    Regenerate
                  </button>
                </div>
              </div>
            )}
            {roomSchedule && (
              <div className="border border-green-500/30 rounded-lg bg-[#0a180a] p-4">
                <div className="text-[10px] font-bold text-green-300 uppercase tracking-widest mb-3">&#10003; Room Schedule ({roomSchedule.flats.length} flats, {totalRooms} rooms)</div>
                <div className="max-h-[300px] overflow-y-auto pr-1 space-y-3">
                  {roomSchedule.flats.map(flat => (
                    <div key={flat.id} className="border-b border-green-950/50 pb-2">
                      <div className="text-[10px] font-bold text-green-200 mb-1">Flat {flat.id}</div>
                      {flat.rooms.map((room: Room) => (
                        <div key={room.code} className="flex justify-between text-[9px] text-green-600 py-0.5 border-b border-green-950/30">
                          <span><strong className="text-green-400">{room.code}</strong> &mdash; {room.name}</span>
                          <span>{room.w}m &times; {room.h}m = <strong className="text-green-300">{room.area} sqm</strong></span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-2 border-t border-green-900/40 flex justify-between text-[9px]">
                  <span className="text-green-700">Total buildup area</span>
                  <strong className="text-green-300">{roomSchedule.totalBuildupArea} sqm</strong>
                </div>

                {!generatedImageUrl && (
                  <button
                    onClick={() => generateFloorPlanImage(roomSchedule)}
                    disabled={isGeneratingImage}
                    className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest bg-purple-600 border border-purple-400 text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-purple-900/30 transition-all animate-pulse"
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Generating Floor Plan Image...
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        Approve & Generate Floor Plan
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-4 py-3 border-t border-green-900/30 shrink-0">
            <div className="flex gap-2">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="e.g. fit 4 flats of 2BHK in my plot..."
                rows={2}
                className="flex-1 bg-[#0a180a] border border-green-900/40 text-green-200 placeholder-green-900 text-[11px] rounded px-3 py-2 focus:outline-none focus:border-green-500/60 resize-none"
              />
              <button onClick={sendMessage} disabled={isLoading || isGeneratingImage || !inputText.trim()} className="px-4 bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-all">
                <Send size={16} />
              </button>
            </div>
            <p className="text-[8px] text-green-900 mt-1.5 uppercase tracking-wide">Enter to send &middot; Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </main>
  );
}
