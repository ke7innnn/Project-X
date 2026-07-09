'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Download, RotateCcw, ImageIcon, Sparkles, RefreshCw, Undo2, Redo2, Maximize2, ImagePlus, X, Move } from 'lucide-react';

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

// ─── Canvas Ratio Presets (3 best sizes) ─────────────────────────────────────
const CANVAS_RATIOS = [
  { label: 'Square',    id: 'square',    w: 850, h: 850,  falSize: 'square_hd'    },
  { label: 'Landscape', id: 'landscape', w: 900, h: 600,  falSize: 'landscape_4_3' },
  { label: 'Portrait',  id: 'portrait',  w: 600, h: 850,  falSize: 'portrait_4_3'  },
] as const;
type RatioId = typeof CANVAS_RATIOS[number]['id'];

const CELL_PX = 12;

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
function exportCanvasForAI(plotPts: Point[], sitePts: Point[], canvasW: number, canvasH: number): string {
  const offscreen = document.createElement('canvas');
  offscreen.width = canvasW;
  offscreen.height = canvasH;
  const ctx = offscreen.getContext('2d')!;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Light grid
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= canvasW; x += CELL_PX) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke(); }
  for (let y = 0; y <= canvasH; y += CELL_PX) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke(); }

  // Grid scale labels
  ctx.fillStyle = '#cccccc';
  ctx.font = '8px monospace';
  for (let x = 0; x <= canvasW; x += CELL_PX * 10) ctx.fillText(x / CELL_PX + 'm', x + 2, 10);
  for (let y = CELL_PX * 10; y <= canvasH; y += CELL_PX * 10) ctx.fillText(y / CELL_PX + 'm', 2, y);

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

  // Canvas ratio
  const [ratioId, setRatioId] = useState<RatioId>('square');
  const [showRatioPicker, setShowRatioPicker] = useState(false);
  const currentRatio = CANVAS_RATIOS.find(r => r.id === ratioId) ?? CANVAS_RATIOS[0];
  const CANVAS_W = currentRatio.w;
  const CANVAS_H = currentRatio.h;

  // Background map image (tracing paper)
  const bgInputRef = useRef<HTMLInputElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [bgImageLoaded, setBgImageLoaded] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [bgOffset, setBgOffset] = useState({ x: 0, y: 0 });
  const [bgScale, setBgScale] = useState(1);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const lastMousePos = useRef<Point | null>(null);

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { 
      bgImageRef.current = img; 
      setBgImageLoaded(true); 
      setBgOffset({ x: 0, y: 0 });
      setBgScale(1);
    };
    img.src = url;
    e.target.value = ''; // allow re-upload of same file
  };
  const removeBgImage = () => { bgImageRef.current = null; setBgImageLoaded(false); setBgOffset({ x: 0, y: 0 }); setBgScale(1); setDrawMode(null); };

  // Scale — how many real-world metres each grid cell represents
  const [metersPerCell, setMetersPerCell] = useState(1);
  const SCALE_OPTIONS = [0.5, 1, 2, 5];
  // Convert px distance to metres using the current scale
  const pxToMScaled = (px: number) => +((px / CELL_PX) * metersPerCell).toFixed(1);

  const [drawMode, setDrawMode] = useState<'plot' | 'site' | 'map' | null>(null);
  const [plotPoints, setPlotPoints] = useState<Point[]>([]);
  const [sitePoints, setSitePoints] = useState<Point[]>([]);
  const [plotClosed, setPlotClosed] = useState(false);
  const [siteClosed, setSiteClosed] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // Undo/Redo stacks — each entry is a snapshot of [plotPoints, sitePoints, plotClosed, siteClosed]
  type Snapshot = { plotPts: Point[]; sitePts: Point[]; plotClosed: boolean; siteClosed: boolean };
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);

  const pushUndo = useCallback((snap: Snapshot) => {
    undoStack.current = [...undoStack.current, snap];
    redoStack.current = []; // clear redo on new action
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [{ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed }, ...redoStack.current];
    setPlotPoints(prev.plotPts); setSitePoints(prev.sitePts);
    setPlotClosed(prev.plotClosed); setSiteClosed(prev.siteClosed);
  }, [plotPoints, sitePoints, plotClosed, siteClosed]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, { plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed }];
    setPlotPoints(next.plotPts); setSitePoints(next.sitePts);
    setPlotClosed(next.plotClosed); setSiteClosed(next.siteClosed);
  }, [plotPoints, sitePoints, plotClosed, siteClosed]);

  // Keyboard shortcuts Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

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
  const [compareMode, setCompareMode] = useState(false);
  const generatedImageObjRef = useRef<HTMLImageElement | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    if (generatedImageUrl) {
      const img = new Image();
      img.onload = () => { generatedImageObjRef.current = img; drawCanvas(); };
      img.src = generatedImageUrl;
    } else {
      generatedImageObjRef.current = null;
    }
  }, [generatedImageUrl]);

  const snapToGrid = (v: number) => Math.round(v / CELL_PX) * CELL_PX;

  // ── Canvas Renderer ─────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    
    if (compareMode && generatedImageObjRef.current) {
      ctx.drawImage(generatedImageObjRef.current, 0, 0, CANVAS_W, CANVAS_H);
      // Dark semi-transparent overlay so the neon traces still pop
      ctx.fillStyle = 'rgba(5, 15, 5, 0.4)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#050f05';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // ── Background map image (tracing paper - only when not in compare mode) ──
    if (!compareMode && bgImageRef.current && bgImageLoaded) {
      ctx.save();
      ctx.globalAlpha = bgOpacity;
      
      const imgW = bgImageRef.current.width;
      const imgH = bgImageRef.current.height;
      const defaultScale = Math.min(CANVAS_W / imgW, CANVAS_H / imgH);
      const finalScale = defaultScale * bgScale;
      
      const scaledW = imgW * finalScale;
      const scaledH = imgH * finalScale;
      const cx = (CANVAS_W - scaledW) / 2 + bgOffset.x;
      const cy = (CANVAS_H - scaledH) / 2 + bgOffset.y;
      
      ctx.drawImage(bgImageRef.current, cx, cy, scaledW, scaledH);
      ctx.restore();
    }

    // ── Canvas border (glows based on active mode) ──────────────────────
    const borderColor = drawMode === 'plot' ? '#f97316' : drawMode === 'site' ? '#00f0ff' : '#22c55e44';
    const borderGlow  = drawMode === 'plot' ? '#f9731640' : drawMode === 'site' ? '#00f0ff40' : '#22c55e20';
    ctx.save();
    ctx.shadowColor = borderGlow; ctx.shadowBlur = 16;
    ctx.strokeStyle = borderColor; ctx.lineWidth = drawMode ? 3 : 1.5;
    ctx.setLineDash(drawMode ? [] : [6, 4]);
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
    ctx.setLineDash([]); ctx.restore();

    // Ratio label bottom-right
    ctx.fillStyle = '#22c55e30'; ctx.font = 'bold 10px monospace';
    ctx.fillText(currentRatio.label, CANVAS_W - currentRatio.label.length * 7 - 8, CANVAS_H - 8);

    // ── Grid ──────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#0d1f0d'; ctx.lineWidth = 0.5;
    for (let x = 0; x <= CANVAS_W; x += CELL_PX) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
    for (let y = 0; y <= CANVAS_H; y += CELL_PX) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }

    // Grid axis labels
    ctx.fillStyle = '#2d6b2d'; ctx.font = '9px monospace';
    const step = metersPerCell >= 2 ? CELL_PX * 5 : CELL_PX * 10;
    for (let x = step; x <= CANVAS_W; x += step)
      ctx.fillText(`${+(x / CELL_PX * metersPerCell).toFixed(0)}m`, x + 2, 11);
    for (let y = step; y <= CANVAS_H; y += step)
      ctx.fillText(`${+(y / CELL_PX * metersPerCell).toFixed(0)}m`, 3, y - 2);

    // ── Scale legend (bottom-left) ────────────────────────────────────────
    const lx = 10, ly = CANVAS_H - 46;
    ctx.fillStyle = 'rgba(5,15,5,0.82)';
    ctx.beginPath(); ctx.roundRect(lx - 4, ly - 4, 128, 44, 4); ctx.fill();
    ctx.strokeStyle = '#22c55e30'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#22c55e20'; ctx.fillRect(lx, ly + 4, CELL_PX, CELL_PX);
    ctx.strokeStyle = '#22c55e80'; ctx.lineWidth = 0.8; ctx.strokeRect(lx, ly + 4, CELL_PX, CELL_PX);
    ctx.fillStyle = '#4ade80'; ctx.font = 'bold 11px monospace';
    ctx.fillText(`= ${metersPerCell}m`, lx + CELL_PX + 6, ly + 15);
    ctx.fillStyle = '#22c55e60'; ctx.font = '9px monospace';
    ctx.fillText(`1 cell = ${metersPerCell}m`, lx, ly + 36);
    const totalW = +((CANVAS_W / CELL_PX) * metersPerCell).toFixed(0);
    const totalH = +((CANVAS_H / CELL_PX) * metersPerCell).toFixed(0);
    ctx.fillStyle = '#22c55e40'; ctx.font = '8px monospace';
    ctx.fillText(`Canvas: ${totalW}m × ${totalH}m`, lx + 72, ly + 36);

    // ── Alignment guides (from existing points, when drawing) ────────────
    if (drawMode && hoverPoint) {
      const guidePts = [...plotPoints, ...sitePoints];
      const guideColor = drawMode === 'plot' ? '#f9731640' : '#00f0ff40';
      ctx.save(); ctx.setLineDash([3, 5]); ctx.lineWidth = 0.7;
      for (const pt of guidePts) {
        if (Math.abs(pt.x - hoverPoint.x) < 0.5) {
          ctx.strokeStyle = guideColor;
          ctx.beginPath(); ctx.moveTo(hoverPoint.x, 0); ctx.lineTo(hoverPoint.x, CANVAS_H); ctx.stroke();
        }
        if (Math.abs(pt.y - hoverPoint.y) < 0.5) {
          ctx.strokeStyle = guideColor;
          ctx.beginPath(); ctx.moveTo(0, hoverPoint.y); ctx.lineTo(CANVAS_W, hoverPoint.y); ctx.stroke();
        }
      }
      ctx.setLineDash([]); ctx.restore();
    }

    // ── Plot boundary ─────────────────────────────────────────────────────
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
      // Edge length labels on closed plot polygon
      if (plotClosed) {
        for (let i = 0; i < plotPoints.length; i++) {
          const a = plotPoints[i], b = plotPoints[(i + 1) % plotPoints.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dM = (Math.sqrt(dx*dx + dy*dy) / CELL_PX * metersPerCell).toFixed(1);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.save();
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(`${dM}m`).width;
          ctx.fillStyle = 'rgba(20,10,0,0.85)';
          ctx.fillRect(mx - tw/2 - 3, my - 7, tw + 6, 14);
          ctx.fillStyle = '#fb923c'; ctx.fillText(`${dM}m`, mx, my);
          ctx.restore();
        }
      }
    }

    // ── Site exterior ─────────────────────────────────────────────────────
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
      // Edge length labels on closed site polygon
      if (siteClosed) {
        for (let i = 0; i < sitePoints.length; i++) {
          const a = sitePoints[i], b = sitePoints[(i + 1) % sitePoints.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dM = (Math.sqrt(dx*dx + dy*dy) / CELL_PX * metersPerCell).toFixed(1);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.save();
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(`${dM}m`).width;
          ctx.fillStyle = 'rgba(0,20,20,0.85)';
          ctx.fillRect(mx - tw/2 - 3, my - 7, tw + 6, 14);
          ctx.fillStyle = '#67e8f9'; ctx.fillText(`${dM}m`, mx, my);
          ctx.restore();
        }
      }
    }

    // ── Snap indicator + real-time annotation (while drawing) ─────────────
    if (drawMode && hoverPoint) {
      const pts = drawMode === 'plot' ? plotPoints : sitePoints;
      const color = drawMode === 'plot' ? '#f97316' : '#00f0ff';
      const colorLight = drawMode === 'plot' ? '#fb923c' : '#67e8f9';

      // Concentric snap rings at cursor
      ctx.save();
      ctx.strokeStyle = color + 'cc'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, 5, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = color + '55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, 9, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, 13, 0, Math.PI*2); ctx.stroke();
      ctx.restore();

      // Line length annotation for current segment
      if (pts.length > 0) {
        const lastPt = pts[pts.length - 1];
        const dx = hoverPoint.x - lastPt.x, dy = hoverPoint.y - lastPt.y;
        const distPx = Math.sqrt(dx*dx + dy*dy);

        if (distPx > 3) {
          const distM = (distPx / CELL_PX * metersPerCell).toFixed(1);
          const midX = (lastPt.x + hoverPoint.x) / 2;
          const midY = (lastPt.y + hoverPoint.y) / 2;

          // Detect H/V/diagonal for snap suggestion
          const angleDeg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
          const isH = angleDeg < 6 || angleDeg > 174;
          const isV = Math.abs(angleDeg - 90) < 6;
          const snapHint = isH ? ' ↔ H' : isV ? ' ↕ V' : '';
          const label = `${distM}m${snapHint}`;

          // Offset annotation perpendicularly from line
          const norm = distPx > 0
            ? { x: -dy / distPx * 18, y: dx / distPx * 18 }
            : { x: 0, y: -18 };
          const ox = midX + norm.x, oy = midY + norm.y;

          ctx.save();
          ctx.font = 'bold 11px monospace';
          const tw = ctx.measureText(label).width;
          const bw = tw + 14, bh = 20;
          // Box
          ctx.fillStyle = 'rgba(5,15,5,0.93)';
          ctx.strokeStyle = color; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(ox - bw/2, oy - bh/2, bw, bh, 4);
          ctx.fill(); ctx.stroke();
          // Text
          ctx.fillStyle = colorLight; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, ox, oy);

          // H snap ghost line suggestion
          if (isH) {
            ctx.strokeStyle = color + '50'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(lastPt.x, lastPt.y); ctx.lineTo(hoverPoint.x, lastPt.y); ctx.stroke();
            ctx.setLineDash([]);
          }
          // V snap ghost line suggestion
          if (isV) {
            ctx.strokeStyle = color + '50'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(lastPt.x, lastPt.y); ctx.lineTo(lastPt.x, hoverPoint.y); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        }
      }

      // Coordinate tooltip at cursor (top-right of cursor)
      const cx = (hoverPoint.x / CELL_PX * metersPerCell).toFixed(1);
      const cy = (hoverPoint.y / CELL_PX * metersPerCell).toFixed(1);
      const coordLabel = `${cx}, ${cy}`;
      ctx.save();
      ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const cw = ctx.measureText(coordLabel).width + 8;
      const cpx = Math.min(hoverPoint.x + 14, CANVAS_W - cw - 4);
      const cpy = Math.max(hoverPoint.y - 20, 4);
      ctx.fillStyle = 'rgba(5,15,5,0.8)';
      ctx.fillRect(cpx, cpy, cw, 14);
      ctx.fillStyle = '#22c55e80';
      ctx.fillText(coordLabel, cpx + 4, cpy + 3);
      ctx.restore();
    }

    // ── Status hint bar ───────────────────────────────────────────────────
    if (drawMode) {
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = drawMode === 'plot' ? '#f97316' : drawMode === 'site' ? '#00f0ff' : '#eab308';
      ctx.fillText(
        drawMode === 'plot'
          ? '● Drawing: PLOT BOUNDARY — click to add points, click first point to close'
          : drawMode === 'site' 
          ? '● Drawing: SITE EXTERIOR — click to add points, click first point to close'
          : '● Move Map: Drag on the canvas to pan, scroll to zoom',
        10, CANVAS_H - 12
      );
    }

    // ── AI generating overlay ──────────────────────────────────────────────
    if (isGeneratingImage) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#00f0ff'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
      ctx.fillText('✨ I\'m generating your floor plan...', CANVAS_W / 2, CANVAS_H / 2 - 16);
      ctx.font = '14px monospace'; ctx.fillStyle = '#00f0ffaa';
      ctx.fillText('Creating layout — ~10 seconds', CANVAS_W / 2, CANVAS_H / 2 + 16);
      ctx.textAlign = 'left';
    }
  }, [plotPoints, sitePoints, plotClosed, siteClosed, hoverPoint, drawMode, isGeneratingImage, CANVAS_W, CANVAS_H, currentRatio, metersPerCell, bgImageLoaded, bgOpacity, bgOffset, bgScale, compareMode]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Native wheel event listener for smooth map zoom without page scroll
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleNativeWheel = (e: WheelEvent) => {
      if (drawMode === 'map' && bgImageLoaded) {
        e.preventDefault(); // Stop the whole page from scrolling
        const zoomFactor = 1 - e.deltaY * 0.005;
        setBgScale(prev => Math.max(0.1, Math.min(10, prev * zoomFactor)));
      }
    };
    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleNativeWheel);
  }, [drawMode, bgImageLoaded]);

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
    if (drawMode !== 'plot' && drawMode !== 'site') return;
    const { x, y } = getCanvasCoords(e);

    if (drawMode === 'plot' && !plotClosed) {
      if (plotPoints.length >= 3) {
        const dx = x - plotPoints[0].x, dy = y - plotPoints[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 15) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
          setPlotClosed(true); setDrawMode(null); return;
        }
      }
      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
      setPlotPoints(prev => [...prev, { x, y }]);
    }
    if (drawMode === 'site' && !siteClosed) {
      if (sitePoints.length >= 3) {
        const dx = x - sitePoints[0].x, dy = y - sitePoints[0].y;
        if (Math.sqrt(dx * dx + dy * dy) < 15) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
          setSiteClosed(true); setDrawMode(null); return;
        }
      }
      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
      setSitePoints(prev => [...prev, { x, y }]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode === 'map') {
      setIsDraggingMap(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    setIsDraggingMap(false);
    lastMousePos.current = null;
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawMode === 'map' && isDraggingMap && lastMousePos.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setBgOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (drawMode === 'plot' || drawMode === 'site') {
      setHoverPoint(getCanvasCoords(e));
    }
  };

  const getPlotContext = () => {
    if (!plotClosed || plotPoints.length < 3) return null;
    const plotBB = polygonBoundingBox(plotPoints);
    const plotAreaSqm = +(polygonArea(plotPoints) / (CELL_PX * CELL_PX) * metersPerCell * metersPerCell).toFixed(1);
    let siteW = pxToMScaled(plotBB.maxX - plotBB.minX);
    let siteH = pxToMScaled(plotBB.maxY - plotBB.minY);
    let siteArea = plotAreaSqm;
    if (siteClosed && sitePoints.length >= 3) {
      const siteBB = polygonBoundingBox(sitePoints);
      siteW = pxToMScaled(siteBB.maxX - siteBB.minX);
      siteH = pxToMScaled(siteBB.maxY - siteBB.minY);
      siteArea = +(polygonArea(sitePoints) / (CELL_PX * CELL_PX) * metersPerCell * metersPerCell).toFixed(1);
    }
    return {
      widthM: pxToMScaled(plotBB.maxX - plotBB.minX), heightM: pxToMScaled(plotBB.maxY - plotBB.minY),
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
      // Export using the actual canvas dimensions matching the selected ratio
      const imageBase64 = exportCanvasForAI(plotPts, sitePts, CANVAS_W, CANVAS_H);

      const res = await fetch('/api/generate-floorplan-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          roomSchedule: schedule,
          imageSize: currentRatio.falSize, // match output to canvas ratio
        }),
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
            <div className="flex items-center gap-1 border border-green-700/40 rounded p-1 bg-[#050f05]">
              <button
                onClick={() => { setShowGeneratedImage(!showGeneratedImage); setCompareMode(false); }}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded transition-all ${showGeneratedImage && !compareMode ? 'bg-purple-500/20 text-purple-300' : 'text-green-600 hover:bg-green-900/30'}`}
              >
                <ImageIcon size={11} className="inline mr-1 mb-0.5" /> {showGeneratedImage && !compareMode ? 'Show Traces' : 'Floor Plan'}
              </button>
              <div className="w-px h-4 bg-green-900/50"></div>
              <button
                onClick={() => { setCompareMode(!compareMode); setShowGeneratedImage(false); }}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded transition-all ${compareMode ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-green-600 hover:bg-green-900/30 border border-transparent'}`}
                title="Overlay the generated floor plan behind your traces to verify dimensions"
              >
                <RefreshCw size={11} className="inline mr-1 mb-0.5" /> Compare Traces
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas / Image Panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Mode toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-green-900/30 bg-[#070f07] shrink-0 flex-wrap">
            <span className="text-[9px] tracking-[3px] uppercase text-green-800 mr-1">Canvas:</span>
            <button
              onClick={() => { if (plotClosed) return; setDrawMode(d => d === 'plot' ? null : 'plot'); setSitePoints([]); setSiteClosed(false); }}
              disabled={plotClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold ${drawMode === 'plot' ? 'bg-orange-500/20 border-orange-400 text-orange-300' : plotClosed ? 'border-orange-900/40 text-orange-900 cursor-not-allowed' : 'border-orange-700/40 text-orange-500 hover:bg-orange-500/10'}`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              {plotClosed ? 'Plot ✓' : drawMode === 'plot' ? 'Drawing Plot...' : 'Plot Boundary'}
            </button>
            <button
              onClick={() => setDrawMode(d => d === 'site' ? null : 'site')}
              disabled={!plotClosed || siteClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold ${drawMode === 'site' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : siteClosed ? 'border-cyan-900/40 text-cyan-900 cursor-not-allowed' : !plotClosed ? 'border-gray-800 text-gray-700 cursor-not-allowed' : 'border-cyan-700/40 text-cyan-500 hover:bg-cyan-500/10'}`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              {siteClosed ? 'Site Ext ✓' : drawMode === 'site' ? 'Drawing Site...' : 'Site Exterior'}
            </button>

            {/* Undo / Redo */}
            <button
              onClick={undo}
              disabled={undoStack.current.length === 0}
              title="Undo (Ctrl+Z)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded border border-green-900/30 text-green-700 hover:bg-green-500/10 hover:text-green-400 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              <Undo2 size={12} /> Undo
            </button>
            <button
              onClick={redo}
              disabled={redoStack.current.length === 0}
              title="Redo (Ctrl+Y)"
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded border border-green-900/30 text-green-700 hover:bg-green-500/10 hover:text-green-400 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            >
              <Redo2 size={12} /> Redo
            </button>

            {/* Canvas Ratio Picker */}
            <div className="relative">
              <button
                onClick={() => setShowRatioPicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-green-700/40 text-green-500 hover:bg-green-500/10 transition-all"
              >
                <Maximize2 size={11} /> {currentRatio.label}
              </button>
              {showRatioPicker && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[#0a180a] border border-green-800/50 rounded-lg shadow-2xl shadow-black/50 overflow-hidden min-w-[160px]">
                  {CANVAS_RATIOS.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setRatioId(r.id);
                        setShowRatioPicker(false);
                        // Clear traces when ratio changes — they'd be on wrong canvas
                        setPlotPoints([]); setSitePoints([]);
                        setPlotClosed(false); setSiteClosed(false);
                        undoStack.current = []; redoStack.current = [];
                      }}
                      className={`w-full text-left px-4 py-2.5 text-[10px] flex items-center justify-between gap-4 hover:bg-green-500/10 transition-colors ${
                        r.id === ratioId ? 'text-green-300 bg-green-500/10' : 'text-green-700'
                      }`}
                    >
                      <span>{r.label}</span>
                      {r.id === ratioId && <span className="text-green-400">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Background Map / Tracing Paper */}
            <div className="flex items-center gap-2 border-l border-green-900/30 pl-2 ml-2">
              <input type="file" accept="image/*" ref={bgInputRef} onChange={handleBgUpload} className="hidden" />
              {bgImageLoaded ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDrawMode(d => d === 'map' ? null : 'map')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all ${drawMode === 'map' ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' : 'border-yellow-700/40 text-yellow-500 hover:bg-yellow-500/10'}`}
                    title="Pan and Zoom the background map"
                  >
                    <Move size={11} /> Move Map
                  </button>
                  <span className="text-[9px] text-green-800 ml-1">Opacity:</span>
                  <input
                    type="range" min="0.1" max="1" step="0.1"
                    value={bgOpacity} onChange={e => setBgOpacity(Number(e.target.value))}
                    className="w-16 accent-green-500"
                  />
                  <button onClick={removeBgImage} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-all ml-1" title="Remove Map">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => bgInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-green-700/40 text-green-500 hover:bg-green-500/10 transition-all"
                  title="Upload a map or plot image to trace over"
                >
                  <ImagePlus size={11} /> Trace Map
                </button>
              )}
            </div>
            {/* Scale selector — metres per grid cell */}
            <div className="flex items-center gap-0.5">
              <span className="text-[9px] text-green-800 mr-1">Scale:</span>
              {SCALE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setMetersPerCell(s);
                    // Clear traces — measurements would be wrong on old scale
                    setPlotPoints([]); setSitePoints([]);
                    setPlotClosed(false); setSiteClosed(false);
                    undoStack.current = []; redoStack.current = [];
                  }}
                  className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${
                    s === metersPerCell
                      ? 'bg-green-500/20 border border-green-400/60 text-green-300'
                      : 'border border-green-900/30 text-green-800 hover:text-green-600 hover:bg-green-500/10'
                  }`}
                >
                  {s}m
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isGeneratingImage && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-purple-400 border border-purple-900/40 rounded bg-purple-950/20">
                  <Loader2 size={11} className="animate-spin" />
                  Generating floor plan...
                </div>
              )}
              <button
                onClick={() => { setPlotPoints([]); setSitePoints([]); setPlotClosed(false); setSiteClosed(false); setDrawMode(null); setRoomSchedule(null); setGeneratedImageUrl(null); setShowGeneratedImage(false); setCompareMode(false); setGenerationError(null); undoStack.current = []; redoStack.current = []; }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-red-900/40 text-red-700 hover:bg-red-500/10 hover:text-red-500 transition-all"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <div className="text-[9px] text-green-900 border border-green-950 rounded px-2 py-1">
              1 cell = {metersPerCell}m &nbsp;|&nbsp; {Math.floor(CANVAS_W/CELL_PX * metersPerCell)}m &times; {Math.floor(CANVAS_H/CELL_PX * metersPerCell)}m
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
                className={`block w-full h-full object-contain ${drawMode === 'map' ? (isDraggingMap ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleCanvasMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={(e) => { setHoverPoint(null); handleMouseUp(); }}
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
