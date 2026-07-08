'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Download, RotateCcw, Trash2, ZoomIn, ZoomOut, Layers } from 'lucide-react';

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
const CELL_PX = 12;       // 12px = 1 metre on screen
const CANVAS_W = 900;     // display px
const CANVAS_H = 700;
const GRID_COLS = Math.floor(CANVAS_W / CELL_PX);  // ≈75 cols = 75m
const GRID_ROWS = Math.floor(CANVAS_H / CELL_PX);  // ≈58 rows = 58m

// Flat colour palette for SVG rooms
const FLAT_COLORS = [
  '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#a78bfa',
  '#fb923c', '#2dd4bf', '#e879f9', '#86efac', '#fca5a5'
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pxToM(px: number) { return +(px / CELL_PX).toFixed(1); }
function mToPx(m: number) { return Math.round(m * CELL_PX); }

function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y;
    a -= pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

function polygonBoundingBox(pts: Point[]) {
  const xs = pts.map(p => p.x); const ys = pts.map(p => p.y);
  return {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys),
  };
}

// Ray-casting algorithm for point in polygon
function isPointInPolygon(pt: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Check if a rectangle is fully inside the polygon
function isRectInPolygon(rx: number, ry: number, rw: number, rh: number, poly: Point[]) {
  const corners = [
    { x: rx, y: ry },
    { x: rx + rw, y: ry },
    { x: rx, y: ry + rh },
    { x: rx + rw, y: ry + rh }
  ];
  return corners.every(c => isPointInPolygon(c, poly));
}

// Check if a rectangle intersects any already placed rectangles
function intersectsPlaced(rx: number, ry: number, rw: number, rh: number, placed: any[]) {
  return placed.some(p => {
    return !(rx + rw <= p.x || rx >= p.x + p.w || ry + rh <= p.y || ry >= p.y + p.h);
  });
}

// 2D grid-based irregular packing inside a polygon
function packRooms(flats: Flat[], sitePts: Point[]) {
  const placed: { code: string; name: string; flat: string; flatIdx: number; x: number; y: number; w: number; h: number }[] = [];
  
  if (sitePts.length < 3) return placed;
  const bb = polygonBoundingBox(sitePts);
  const step = mToPx(0.5); // Grid step for searching placements
  const gap = mToPx(0.1);  // Gap between rooms

  flats.forEach((flat, flatIdx) => {
    flat.rooms.forEach(room => {
      const rw = mToPx(room.w);
      const rh = mToPx(room.h);
      let placedThisRoom = false;

      // Scan the bounding box from top-left to bottom-right
      for (let y = bb.minY + step; y <= bb.maxY - rh && !placedThisRoom; y += step) {
        for (let x = bb.minX + step; x <= bb.maxX - rw && !placedThisRoom; x += step) {
          
          // 1. Check if the room's 4 corners are inside the cyan site polygon
          if (!isRectInPolygon(x, y, rw, rh, sitePts)) continue;

          // 2. Check if it overlaps with any already placed rooms
          if (!intersectsPlaced(x, y, rw, rh, placed)) {
            placed.push({ code: room.code, name: room.name, flat: flat.id, flatIdx, x, y, w: rw, h: rh });
            placedThisRoom = true;
          }
        }
      }
    });
  });

  return placed;
}

// Generate SVG from packed rooms
function buildSVG(
  plotPts: Point[], sitePts: Point[],
  packed: ReturnType<typeof packRooms>,
  schedule: RoomSchedule,
  canvasW: number, canvasH: number
): string {
  const plotPath = plotPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
  const sitePath = sitePts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

  const roomsSVG = packed.map(r => {
    const color = FLAT_COLORS[r.flatIdx % FLAT_COLORS.length];
    const fontSize = Math.max(7, Math.min(11, r.w / 6));
    return `
    <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="1.5"/>
    <text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 - 6}" text-anchor="middle" font-size="${fontSize}" font-family="monospace" font-weight="bold" fill="${color}">${r.code}</text>
    <text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 6}" text-anchor="middle" font-size="${Math.max(6, fontSize - 1)}" font-family="monospace" fill="${color}">${r.name}</text>
    <text x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 15}" text-anchor="middle" font-size="${Math.max(5, fontSize - 2)}" font-family="monospace" fill="${color}55">${pxToM(r.w)}×${pxToM(r.h)}m</text>
    `;
  }).join('');

  // Grid lines
  const gridLines: string[] = [];
  for (let x = 0; x <= canvasW; x += CELL_PX) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${canvasH}" stroke="#1a2a1a" stroke-width="0.5"/>`);
  }
  for (let y = 0; y <= canvasH; y += CELL_PX) {
    gridLines.push(`<line x1="0" y1="${y}" x2="${canvasW}" y2="${y}" stroke="#1a2a1a" stroke-width="0.5"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" style="background:#0a120a">
  <defs>
    <style>text { font-family: monospace; }</style>
  </defs>
  <!-- Grid -->
  <g opacity="0.4">${gridLines.join('')}</g>
  <!-- Plot Boundary -->
  <path d="${plotPath}" fill="none" stroke="#f97316" stroke-width="2" stroke-dasharray="6,3"/>
  <!-- Site Exterior -->
  <path d="${sitePath}" fill="rgba(0,240,255,0.05)" stroke="#00f0ff" stroke-width="2"/>
  <!-- Rooms -->
  ${roomsSVG}
  <!-- Labels -->
  <text x="10" y="18" font-size="9" fill="#f97316" font-family="monospace">● PLOT BOUNDARY</text>
  <text x="10" y="32" font-size="9" fill="#00f0ff" font-family="monospace">● SITE EXTERIOR (buildable)</text>
  <text x="${canvasW - 10}" y="${canvasH - 10}" text-anchor="end" font-size="8" fill="#ffffff33" font-family="monospace">1 grid cell = 1 metre | Smart Planner</text>
</svg>`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmartPlannerPage() {
  const router = useRouter();

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing state
  const [drawMode, setDrawMode] = useState<'plot' | 'site' | null>(null);
  const [plotPoints, setPlotPoints] = useState<Point[]>([]);
  const [sitePoints, setSitePoints] = useState<Point[]>([]);
  const [plotClosed, setPlotClosed] = useState(false);
  const [siteClosed, setSiteClosed] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `**Welcome to Smart Planner — Mathematical Accuracy Mode** 🏗️

I'm your senior architect assistant. Here's how we work together:

1. **Trace your Plot Boundary** using the **orange** mode on the canvas (left). Click to add points, close the shape when done.
2. **Trace your Site Exterior** (the building footprint inside the plot, accounting for setbacks) using **cyan** mode.
3. **Tell me your requirements** — how many flats, what BHK type, any special rooms.

I'll calculate whether it's mathematically possible, correct you if needed, and give you a precise room schedule with exact dimensions.

**Start by tracing your plot boundary on the canvas, or just tell me your plot dimensions!**`
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Generated room schedule + SVG
  const [roomSchedule, setRoomSchedule] = useState<RoomSchedule | null>(null);
  const [svgOutput, setSvgOutput] = useState<string | null>(null);
  const [showSVG, setShowSVG] = useState(false);

  // ── Canvas drawing ──────────────────────────────────────────────────────────
  const snapToGrid = (val: number) => Math.round(val / CELL_PX) * CELL_PX;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.fillStyle = '#050f05';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid
    ctx.strokeStyle = '#0d1f0d';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= CANVAS_W; x += CELL_PX) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += CELL_PX) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }

    // Scale labels every 10 cells = 10m
    ctx.fillStyle = '#1a3a1a';
    ctx.font = '8px monospace';
    for (let x = 0; x <= CANVAS_W; x += CELL_PX * 10) {
      ctx.fillText(`${x / CELL_PX}m`, x + 2, 10);
    }
    for (let y = CELL_PX * 10; y <= CANVAS_H; y += CELL_PX * 10) {
      ctx.fillText(`${y / CELL_PX}m`, 2, y);
    }

    // Draw plot boundary (orange)
    if (plotPoints.length > 0) {
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(plotPoints[0].x, plotPoints[0].y);
      plotPoints.forEach(p => ctx.lineTo(p.x, p.y));
      if (plotClosed) ctx.closePath();
      else if (drawMode === 'plot' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Points
      plotPoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#f97316' : '#fb923c';
        ctx.fill();
      });

      // First point highlight (close target)
      if (!plotClosed && plotPoints.length >= 3 && drawMode === 'plot') {
        ctx.beginPath();
        ctx.arc(plotPoints[0].x, plotPoints[0].y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f97316aa';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw site exterior (cyan)
    if (sitePoints.length > 0) {
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sitePoints[0].x, sitePoints[0].y);
      sitePoints.forEach(p => ctx.lineTo(p.x, p.y));
      if (siteClosed) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,240,255,0.05)';
        ctx.fill();
      } else if (drawMode === 'site' && hoverPoint) {
        ctx.lineTo(hoverPoint.x, hoverPoint.y);
      }
      ctx.stroke();

      sitePoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#00f0ff' : '#67e8f9';
        ctx.fill();
      });

      if (!siteClosed && sitePoints.length >= 3 && drawMode === 'site') {
        ctx.beginPath();
        ctx.arc(sitePoints[0].x, sitePoints[0].y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#00f0ffaa';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw packed rooms if we have a schedule
    if (roomSchedule && siteClosed && sitePoints.length >= 3) {
      const packed = packRooms(roomSchedule.flats, sitePoints);
      packed.forEach(r => {
        const color = FLAT_COLORS[r.flatIdx % FLAT_COLORS.length];
        ctx.fillStyle = color + '30';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(7, Math.min(10, r.w / 8))}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(r.code, r.x + r.w / 2, r.y + r.h / 2 - 4);
        ctx.font = `${Math.max(6, Math.min(8, r.w / 10))}px monospace`;
        ctx.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2 + 6);
        ctx.textAlign = 'left';
      });
    }

    // Mode label
    if (drawMode) {
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = drawMode === 'plot' ? '#f97316' : '#00f0ff';
      ctx.fillText(
        drawMode === 'plot' ? '● Drawing: PLOT BOUNDARY — click to add points, click first point to close' 
          : '● Drawing: SITE EXTERIOR — click to add points, click first point to close',
        10, CANVAS_H - 12
      );
    }
  }, [plotPoints, sitePoints, plotClosed, siteClosed, hoverPoint, drawMode, roomSchedule]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const x = snapToGrid((e.clientX - rect.left) * scaleX);
    const y = snapToGrid((e.clientY - rect.top) * scaleY);

    if (drawMode === 'plot' && !plotClosed) {
      if (plotPoints.length >= 3) {
        const dx = x - plotPoints[0].x, dy = y - plotPoints[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 15) {
          setPlotClosed(true); setDrawMode(null);
          return;
        }
      }
      setPlotPoints(prev => [...prev, { x, y }]);
    }

    if (drawMode === 'site' && !siteClosed) {
      if (sitePoints.length >= 3) {
        const dx = x - sitePoints[0].x, dy = y - sitePoints[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 15) {
          setSiteClosed(true); setDrawMode(null);
          return;
        }
      }
      setSitePoints(prev => [...prev, { x, y }]);
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    setHoverPoint({
      x: snapToGrid((e.clientX - rect.left) * scaleX),
      y: snapToGrid((e.clientY - rect.top) * scaleY),
    });
  };

  // ── Compute plot info for LLM context ──────────────────────────────────────
  const getPlotContext = () => {
    if (!plotClosed || plotPoints.length < 3) return null;
    const plotBB = polygonBoundingBox(plotPoints);
    const plotW = pxToM(plotBB.maxX - plotBB.minX);
    const plotH = pxToM(plotBB.maxY - plotBB.minY);
    const plotAreaSqm = +(polygonArea(plotPoints) / (CELL_PX * CELL_PX)).toFixed(1);

    let siteW = plotW, siteH = plotH, siteArea = plotAreaSqm;
    if (siteClosed && sitePoints.length >= 3) {
      const siteBB = polygonBoundingBox(sitePoints);
      siteW = pxToM(siteBB.maxX - siteBB.minX);
      siteH = pxToM(siteBB.maxY - siteBB.minY);
      siteArea = +(polygonArea(sitePoints) / (CELL_PX * CELL_PX)).toFixed(1);
    }

    return {
      widthM: plotW, heightM: plotH, areaM: plotAreaSqm,
      siteWidthM: siteW, siteHeightM: siteH, siteAreaM: siteArea,
    };
  };

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: inputText.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/smart-planner-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          plotBoundary: getPlotContext(),
        }),
      });
      const data = await res.json();

      if (data.roomSchedule?.confirmed) {
        setRoomSchedule(data.roomSchedule);

        // Generate SVG
        const plotPts = plotClosed ? plotPoints : [];
        const sitePts = siteClosed ? sitePoints : plotPts;
        const packed = packRooms(data.roomSchedule.flats, sitePts.length > 0 ? sitePts : plotPts);
        const svg = buildSVG(plotPts, sitePts, packed, data.roomSchedule, CANVAS_W, CANVAS_H);
        setSvgOutput(svg);
        setShowSVG(true);
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.text || 'Sorry, I could not process that.' }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── SVG Download ───────────────────────────────────────────────────────────
  const downloadSVG = () => {
    if (!svgOutput) return;
    const blob = new Blob([svgOutput], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'smart-plan.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const plotInfo = getPlotContext();

  return (
    <main className="flex flex-col w-full h-screen bg-[#050f05] text-green-400 font-mono overflow-hidden">

      {/* TOP BAR */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-green-900/40 bg-[#050f05]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="w-9 h-9 rounded-full border border-green-700/40 hover:border-green-400 hover:bg-green-500/10 flex items-center justify-center transition-all"
          >
            <ArrowLeft size={16} className="text-green-500" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(0,255,100,0.3)]">
              Smart Planner <span className="text-[10px] bg-green-500/20 border border-green-500/40 text-green-400 px-2 py-0.5 rounded ml-2">BETA</span>
            </h1>
            <span className="text-[9px] tracking-[3px] text-green-600 uppercase">Mathematically Accurate Floor Plan Generator</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Plot info readout */}
          {plotInfo && (
            <div className="flex items-center gap-4 text-[10px] border border-green-900/50 rounded px-3 py-1.5 bg-[#0a1a0a]">
              <span className="text-orange-400">Plot: <strong>{plotInfo.widthM}m × {plotInfo.heightM}m = {plotInfo.areaM} sqm</strong></span>
              {siteClosed && <span className="text-cyan-400">Site: <strong>{plotInfo.siteWidthM}m × {plotInfo.siteHeightM}m = {plotInfo.siteAreaM} sqm</strong></span>}
            </div>
          )}

          {svgOutput && (
            <button
              onClick={downloadSVG}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 rounded transition-all"
            >
              <Download size={13} /> Download SVG
            </button>
          )}

          {svgOutput && (
            <button
              onClick={() => setShowSVG(!showSVG)}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest border rounded transition-all ${showSVG ? 'bg-green-500/20 border-green-400 text-green-300' : 'border-green-700/40 text-green-600 hover:border-green-500'}`}
            >
              <Layers size={13} /> {showSVG ? 'Show Canvas' : 'Show Plan SVG'}
            </button>
          )}
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Canvas */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Canvas Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-green-900/30 bg-[#070f07] shrink-0">
            <span className="text-[9px] tracking-[3px] uppercase text-green-800 mr-2">Canvas Mode:</span>

            <button
              onClick={() => { if (plotClosed) return; setDrawMode(d => d === 'plot' ? null : 'plot'); setSitePoints([]); setSiteClosed(false); }}
              disabled={plotClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold
                ${drawMode === 'plot' ? 'bg-orange-500/20 border-orange-400 text-orange-300' : plotClosed ? 'border-orange-900/40 text-orange-900 cursor-not-allowed' : 'border-orange-700/40 text-orange-500 hover:bg-orange-500/10'}`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              {plotClosed ? 'Plot ✓' : drawMode === 'plot' ? 'Drawing Plot...' : 'Plot Boundary'}
            </button>

            <button
              onClick={() => setDrawMode(d => d === 'site' ? null : 'site')}
              disabled={!plotClosed || siteClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold
                ${drawMode === 'site' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : siteClosed ? 'border-cyan-900/40 text-cyan-900 cursor-not-allowed' : !plotClosed ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-cyan-700/40 text-cyan-500 hover:bg-cyan-500/10'}`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              {siteClosed ? 'Site Ext ✓' : drawMode === 'site' ? 'Drawing Site...' : 'Site Exterior'}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { setPlotPoints([]); setSitePoints([]); setPlotClosed(false); setSiteClosed(false); setDrawMode(null); setRoomSchedule(null); setSvgOutput(null); setShowSVG(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-red-900/40 text-red-700 hover:bg-red-500/10 hover:text-red-500 transition-all"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>

            <div className="text-[9px] text-green-900 border border-green-950 rounded px-2 py-1">
              1 cell = 1m &nbsp;|&nbsp; Grid: {GRID_COLS}m × {GRID_ROWS}m
            </div>
          </div>

          {/* Canvas / SVG Display */}
          <div className="flex-1 overflow-auto relative bg-[#030a03]">
            {showSVG && svgOutput ? (
              <div
                className="w-full h-full"
                dangerouslySetInnerHTML={{ __html: svgOutput }}
              />
            ) : (
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                className="block w-full h-full object-contain cursor-crosshair"
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMove}
                onMouseLeave={() => setHoverPoint(null)}
              />
            )}
          </div>
        </div>

        {/* RIGHT: Smart Chat */}
        <div className="w-[420px] border-l border-green-900/30 bg-[#070f07] flex flex-col shrink-0">

          {/* Chat Header */}
          <div className="px-5 py-3 border-b border-green-900/30 shrink-0">
            <h2 className="text-[11px] font-bold tracking-[3px] uppercase text-green-400">Smart Architect Chat</h2>
            <p className="text-[9px] text-green-800 uppercase tracking-wide mt-0.5">NBC 2016 Standards · Mathematically Verified</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-3 text-[11px] leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-green-500/15 border border-green-500/30 text-green-200'
                    : 'bg-[#0a180a] border border-green-900/40 text-green-300'
                  }`}
                >
                  {/* Render markdown-like bold */}
                  <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-green-100">$1</strong>')
                      .replace(/```json[\s\S]*?```/g, '<span class="text-green-600 text-[9px]">[Room schedule generated ✓]</span>')
                      .replace(/```[\s\S]*?```/g, '<span class="text-green-600 text-[9px]">[Code block]</span>')
                  }} />
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#0a180a] border border-green-900/40 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-green-500" />
                  <span className="text-[10px] text-green-600">Calculating...</span>
                </div>
              </div>
            )}

            {roomSchedule && (
              <div className="border border-green-500/30 rounded-lg bg-[#0a180a] p-4">
                <div className="text-[10px] font-bold text-green-300 uppercase tracking-widest mb-3">✓ Room Schedule Confirmed</div>
                {roomSchedule.flats.map(flat => (
                  <div key={flat.id} className="mb-3">
                    <div className="text-[10px] font-bold text-green-200 mb-1.5">{flat.name}</div>
                    {flat.rooms.map(room => (
                      <div key={room.code} className="flex justify-between text-[9px] text-green-600 py-0.5 border-b border-green-950">
                        <span><strong className="text-green-400">{room.code}</strong> — {room.name}</span>
                        <span>{room.w}m × {room.h}m = <strong className="text-green-300">{room.area} sqm</strong></span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="mt-3 pt-2 border-t border-green-900/40 flex justify-between text-[9px]">
                  <span className="text-green-700">Total buildup area</span>
                  <strong className="text-green-300">{roomSchedule.totalBuildupArea} sqm</strong>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-green-900/30 shrink-0">
            <div className="flex gap-2">
              <textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="e.g. fit 3 flats of 2BHK in my plot..."
                rows={2}
                className="flex-1 bg-[#0a180a] border border-green-900/40 text-green-200 placeholder-green-900 text-[11px] rounded px-3 py-2 focus:outline-none focus:border-green-500/60 resize-none"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputText.trim()}
                className="px-4 bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-all"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[8px] text-green-900 mt-1.5 uppercase tracking-wide">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
