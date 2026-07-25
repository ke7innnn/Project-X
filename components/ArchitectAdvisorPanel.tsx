'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Upload, CheckCircle2, ChevronRight, RotateCcw, MousePointer, Sparkles } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number; }

interface PlotData {
  widthM: number;
  lengthM: number;
  areaM2: number;
  shapeDesc: string;
  polygonVertices: { x: number; y: number }[];
}

export interface AdvisorOption {
  id: string;
  label: string;
  footprintShape: string;
  shapeName: string;
  width: string;
  length: string;
  units1BHK: number;
  units2BHK: number;
  units3BHK: number;
  units4BHK: number;
  passengerLifts: number;
  staircases: number;
  guaranteedPct: number;
  totalUnits: number;
  plateArea: number;
  availableArea: number;
  designNotes: string;
  highlights: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  options?: AdvisorOption[];
  isTyping?: boolean;
}

export interface FormParams {
  footprintShape: string;
  overallWidth: string;
  overallLength: string;
  units1BHK: number;
  units2BHK: number;
  units3BHK: number;
  units4BHK: number;
  passengerLifts: number;
  staircases: number;
  customPrompt: string;
}

interface Props {
  onParamsApplied: (params: FormParams) => void;
  onGenerateTrigger: (opts: { tracerImageBase64?: string; canvasW?: number; canvasH?: number }) => void;
}

// ─── Canvas constants ─────────────────────────────────────────────────────────
const CELL_M = 10;
const CELL_PX = 18;

function pxToM(px: number) { return parseFloat((px / CELL_PX * CELL_M).toFixed(1)); }

function polygonAreaM2(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pxToM(pts[i].x) * pxToM(pts[j].y) - pxToM(pts[j].x) * pxToM(pts[i].y);
  }
  return parseFloat(Math.abs(a / 2).toFixed(1));
}

function polygonBBox(pts: Point[]) {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Simplified shape polygon generators
function getShapePoints(shapeId: string, cx: number, cy: number, w: number, h: number): Point[][] {
  const hw = w / 2, hh = h / 2;
  switch (shapeId) {
    case 'monolithic-rect':
      return [[{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }]];
    case 'h-shape': {
      const arm = hw * 0.35;
      return [[
        { x: cx - hw, y: cy - hh }, { x: cx - hw + arm, y: cy - hh },
        { x: cx - hw + arm, y: cy - hh * 0.35 }, { x: cx + hw - arm, y: cy - hh * 0.35 },
        { x: cx + hw - arm, y: cy - hh }, { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh }, { x: cx + hw - arm, y: cy + hh },
        { x: cx + hw - arm, y: cy + hh * 0.35 }, { x: cx - hw + arm, y: cy + hh * 0.35 },
        { x: cx - hw + arm, y: cy + hh }, { x: cx - hw, y: cy + hh },
      ]];
    }
    case 'curved-x':
    case 'pinwheel': {
      const arm2 = 0.33;
      const pts: Point[] = [];
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([wx, wy]) => {
        const nx = wx === 0 ? 1 : 0, ny = wy === 0 ? 1 : 0;
        pts.push(
          { x: cx + (wx * 0.65 - nx * arm2) * hw, y: cy + (wy * 0.65 - ny * arm2) * hh },
          { x: cx + (wx * 1.0 - nx * arm2) * hw, y: cy + (wy * 1.0 - ny * arm2) * hh },
          { x: cx + (wx * 1.0 + nx * arm2) * hw, y: cy + (wy * 1.0 + ny * arm2) * hh },
          { x: cx + (wx * 0.65 + nx * arm2) * hw, y: cy + (wy * 0.65 + ny * arm2) * hh },
        );
      });
      return [pts];
    }
    case 'tri-foil': {
      const pts3: Point[] = [];
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120 - 90) * Math.PI / 180;
        const armA = (i * 120 - 90 + 30) * Math.PI / 180;
        const armB = (i * 120 - 90 - 30) * Math.PI / 180;
        pts3.push(
          { x: cx + Math.cos(armB) * 0.38 * hw, y: cy + Math.sin(armB) * 0.38 * hh },
          { x: cx + Math.cos(angle) * 0.9 * hw, y: cy + Math.sin(angle) * 0.9 * hh },
          { x: cx + Math.cos(armA) * 0.38 * hw, y: cy + Math.sin(armA) * 0.38 * hh },
        );
      }
      return [pts3];
    }
    case 'stepped-l':
      return [[
        { x: cx - hw, y: cy - hh }, { x: cx + hw * 0.2, y: cy - hh },
        { x: cx + hw * 0.2, y: cy - hh * 0.2 }, { x: cx + hw, y: cy - hh * 0.2 },
        { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh },
      ]];
    case 'crescent-arc':
    case 'elliptical': {
      const pts4: Point[] = [];
      const sides = 16;
      for (let i = 0; i <= sides; i++) {
        const angle = ((i / sides) * (shapeId === 'crescent-arc' ? 180 : 360) - 90) * Math.PI / 180;
        pts4.push({ x: cx + Math.cos(angle) * hw, y: cy + Math.sin(angle) * hh });
      }
      if (shapeId === 'crescent-arc') {
        for (let i = sides; i >= 0; i--) {
          const angle = ((i / sides) * 180 - 90) * Math.PI / 180;
          pts4.push({ x: cx + Math.cos(angle) * hw * 0.4, y: cy + Math.sin(angle) * hh * 0.6 + hh * 0.3 });
        }
      }
      return [pts4];
    }
    case 'courtyard-ring':
    case 'circular-atrium': {
      const sides2 = shapeId === 'courtyard-ring' ? 4 : 12;
      const outerPts: Point[] = [];
      for (let i = 0; i < sides2; i++) {
        const angle = ((i / sides2) * 360 - 45) * Math.PI / 180;
        outerPts.push({ x: cx + Math.cos(angle) * hw, y: cy + Math.sin(angle) * hh });
      }
      return [outerPts];
    }
    case 'hexagonal': {
      const hexPts: Point[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 30) * Math.PI / 180;
        hexPts.push({ x: cx + Math.cos(angle) * hw, y: cy + Math.sin(angle) * hh });
      }
      return [hexPts];
    }
    case 'curved-s':
      return [[
        { x: cx - hw, y: cy - hh }, { x: cx + hw * 0.1, y: cy - hh },
        { x: cx + hw * 0.5, y: cy - hh * 0.3 }, { x: cx + hw, y: cy - hh * 0.3 },
        { x: cx + hw, y: cy + hh * 0.3 }, { x: cx + hw * 0.5, y: cy + hh * 0.3 },
        { x: cx - hw * 0.1, y: cy + hh }, { x: cx - hw, y: cy + hh },
        { x: cx - hw, y: cy + hh * 0.3 }, { x: cx - hw * 0.5, y: cy + hh * 0.3 },
        { x: cx - hw * 0.5, y: cy - hh * 0.3 }, { x: cx - hw, y: cy - hh * 0.3 },
      ]];
    default:
      return [[{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }]];
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ArchitectAdvisorPanel({ onParamsApplied, onGenerateTrigger }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const CANVAS_W = 420;
  const CANVAS_H = 260;

  const [polygon, setPolygon] = useState<Point[]>([]);
  const [isTracingClosed, setIsTracingClosed] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [hoverPt, setHoverPt] = useState<Point | null>(null);
  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [suggestedShape, setSuggestedShape] = useState<string | null>(null);
  const [appliedOptionId, setAppliedOptionId] = useState<string | null>(null);

  // Output canvas dimensions (for AI generation image size)
  const [outputW, setOutputW] = useState(1024);
  const [outputH, setOutputH] = useState(1024);

  const OUTPUT_PRESETS = [
    { label: '1024×1024 (Square)', w: 1024, h: 1024 },
    { label: '1024×768 (Landscape)', w: 1024, h: 768 },
    { label: '768×1024 (Portrait)', w: 768, h: 1024 },
    { label: '1280×960 (Wide)', w: 1280, h: 960 },
    { label: '1024×576 (Cinema)', w: 1024, h: 576 },
  ];

  // Export tracer canvas as clean AI input image
  // Renders the traced polygon (white filled) centered on a white canvas at outputW×outputH
  // with the suggested building shape overlay in a soft gray
  const exportForAI = useCallback((): string | null => {
    if (polygon.length < 3 || !isTracingClosed) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = outputW;
    offscreen.height = outputH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputW, outputH);

    // Calculate polygon bounding box in canvas coords
    const bbox = polygonBBox(polygon);
    const polyW = bbox.w;
    const polyH = bbox.h;

    // Scale polygon to fit inside outputW × outputH with 6% margin
    const margin = 0.06;
    const availW = outputW * (1 - margin * 2);
    const availH = outputH * (1 - margin * 2);
    const scale = Math.min(availW / polyW, availH / polyH);

    const scaledPolyW = polyW * scale;
    const scaledPolyH = polyH * scale;
    const offsetX = (outputW - scaledPolyW) / 2 - bbox.minX * scale;
    const offsetY = (outputH - scaledPolyH) / 2 - bbox.minY * scale;

    const scalePt = (p: Point) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY });

    // Draw plot boundary fill (very light grey = site area)
    const scaledPts = polygon.map(scalePt);
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
    scaledPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();

    // Draw plot boundary stroke (black, thick = site boundary wall)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(3, outputW / 200);
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
    scaledPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    // Draw suggested building shape inside plot (centered, ~85% of plot bbox, with margin)
    if (suggestedShape) {
      const shapePad = 0.08; // 8% inset from plot edge
      const shapeCx = (scaledPts.reduce((s, p) => s + p.x, 0) / scaledPts.length);
      const shapeCy = (scaledPts.reduce((s, p) => s + p.y, 0) / scaledPts.length);
      const shapeW = scaledPolyW * (1 - shapePad * 2);
      const shapeH = scaledPolyH * (1 - shapePad * 2);

      const shapePolygons = getShapePoints(suggestedShape, shapeCx, shapeCy, shapeW, shapeH);
      shapePolygons.forEach(shapePts => {
        if (shapePts.length < 3) return;
        ctx.fillStyle = '#d0e8ff'; // light blue = building footprint
        ctx.strokeStyle = '#1a6eb5';
        ctx.lineWidth = Math.max(2, outputW / 300);
        ctx.beginPath();
        ctx.moveTo(shapePts[0].x, shapePts[0].y);
        shapePts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });

      // Label
      ctx.fillStyle = '#1a6eb5';
      ctx.font = `bold ${Math.max(12, outputW / 60)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(suggestedShape.toUpperCase().replace(/-/g, ' '), shapeCx, shapeCy);
      ctx.textAlign = 'left';
    }

    // Return base64 (strip the data:image/png;base64, prefix)
    return offscreen.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  }, [polygon, isTracingClosed, suggestedShape, outputW, outputH]);

  const handleGenerateTrigger = useCallback(() => {
    const base64 = exportForAI();
    onGenerateTrigger({ tracerImageBase64: base64 || undefined, canvasW: outputW, canvasH: outputH });
  }, [exportForAI, onGenerateTrigger, outputW, outputH]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi! I'm **ARIA**, your AI Senior Architect. 🏗️\n\n**To get started:**\n1. Upload your site plan image above (optional)\n2. Click on the 10m grid to trace your plot boundary\n3. Close the polygon — I'll instantly calculate the best tower configurations!\n\nOr just type your plot dimensions: e.g. *"100m × 80m rectangular plot, max 2BHK and 3BHK"*`,
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [paramsApplied, setParamsApplied] = useState(false);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    if (bgImage) {
      ctx.globalAlpha = 0.28;
      ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.09)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= CANVAS_W; x += CELL_PX) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_H; y += CELL_PX) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }

    // Grid dots
    ctx.fillStyle = 'rgba(0, 240, 255, 0.22)';
    for (let x = 0; x <= CANVAS_W; x += CELL_PX) {
      for (let y = 0; y <= CANVAS_H; y += CELL_PX) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Scale label
    ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.font = '7px monospace';
    ctx.fillText('GRID: 1 CELL = 10M', 6, 11);

    // Draw polygon
    if (polygon.length > 0) {
      if (isTracingClosed && polygon.length >= 3) {
        // Fill
        ctx.fillStyle = 'rgba(0, 240, 255, 0.07)';
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        polygon.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();

        // Border
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        polygon.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Suggested shape overlay
        if (suggestedShape) {
          const bbox = polygonBBox(polygon);
          const shapeCx = (bbox.minX + bbox.maxX) / 2;
          const shapeCy = (bbox.minY + bbox.maxY) / 2;
          const pad = 8;
          const shapePolygons = getShapePoints(suggestedShape, shapeCx, shapeCy, bbox.w - pad * 2, bbox.h - pad * 2);
          shapePolygons.forEach(shapePts => {
            if (shapePts.length < 3) return;
            ctx.fillStyle = 'rgba(255, 165, 0, 0.18)';
            ctx.strokeStyle = '#FFB000';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(shapePts[0].x, shapePts[0].y);
            shapePts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          });
          ctx.fillStyle = 'rgba(255,165,0,0.85)';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          const bbox2 = polygonBBox(polygon);
          ctx.fillText('BUILDING SHAPE', (bbox2.minX + bbox2.maxX) / 2, (bbox2.minY + bbox2.maxY) / 2);
          ctx.textAlign = 'left';
        }

        // Dimension labels
        const bbox = polygonBBox(polygon);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.9)';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${pxToM(bbox.w)}m`, (bbox.minX + bbox.maxX) / 2, bbox.maxY + 13);
        ctx.save();
        ctx.translate(bbox.minX - 13, (bbox.minY + bbox.maxY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${pxToM(bbox.h)}m`, 0, 0);
        ctx.restore();
        ctx.textAlign = 'left';

      } else {
        // In-progress trace
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(polygon[0].x, polygon[0].y);
        polygon.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        if (hoverPt) ctx.lineTo(hoverPt.x, hoverPt.y);
        ctx.stroke();
      }

      // Vertex dots
      polygon.forEach((p, i) => {
        ctx.fillStyle = i === 0 && polygon.length > 2 ? '#00ff88' : '#00f0ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Hover crosshair
    if (hoverPt && !isTracingClosed) {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(hoverPt.x, 0); ctx.lineTo(hoverPt.x, CANVAS_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hoverPt.y); ctx.lineTo(CANVAS_W, hoverPt.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,240,255,0.7)';
      ctx.font = '7px monospace';
      ctx.fillText(`${pxToM(hoverPt.x)}m, ${pxToM(hoverPt.y)}m`, hoverPt.x + 6, hoverPt.y - 3);
    }
  }, [polygon, hoverPt, isTracingClosed, bgImage, suggestedShape]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const snapToGrid = (px: number, py: number): Point => ({
    x: Math.round(px / CELL_PX) * CELL_PX,
    y: Math.round(py / CELL_PX) * CELL_PX,
  });

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const raw = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    setHoverPt(snapToGrid(raw.x, raw.y));
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isTracingClosed) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const raw = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    const snapped = snapToGrid(raw.x, raw.y);

    if (polygon.length >= 3) {
      const first = polygon[0];
      if (Math.hypot(snapped.x - first.x, snapped.y - first.y) < CELL_PX) {
        closePlot();
        return;
      }
    }
    setPolygon(prev => [...prev, snapped]);
  };

  const closePlot = useCallback(() => {
    if (polygon.length < 3) return;
    setIsTracingClosed(true);
    const bbox = polygonBBox(polygon);
    const widthM = pxToM(bbox.w);
    const lengthM = pxToM(bbox.h);
    const areaM2 = polygonAreaM2(polygon);
    const vertices = polygon.map(p => ({ x: Math.round(pxToM(p.x)), y: Math.round(pxToM(p.y)) }));
    const pd: PlotData = { widthM, lengthM, areaM2, shapeDesc: 'User-traced polygon on 10m grid', polygonVertices: vertices };
    setPlotData(pd);
    const analysisMsg = `Plot traced! Dimensions: **${widthM}m × ${lengthM}m**, Area: **${areaM2}m²**. Please analyze and give me 3 building configurations with maximum flats and proper ventilation.`;
    triggerAI(analysisMsg, pd);
  }, [polygon]);

  const resetTrace = () => {
    setPolygon([]);
    setIsTracingClosed(false);
    setPlotData(null);
    setSuggestedShape(null);
    setAppliedOptionId(null);
    setParamsApplied(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => setBgImage(img);
    img.src = URL.createObjectURL(file);
  };

  const triggerAI = async (text: string, pd?: PlotData | null) => {
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, { role: 'assistant', content: '', isTyping: true }]);
    setInputValue('');
    setIsLoading(true);

    try {
      const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/plot-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, plotData: pd !== undefined ? pd : plotData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');

      const assistantMsg: ChatMessage = { role: 'assistant', content: data.message, options: data.options || undefined };
      setMessages(prev => [...prev.filter(m => !m.isTyping), assistantMsg]);

      if (data.options && data.options.length > 0) {
        setSuggestedShape(data.options[0].footprintShape);
      }
    } catch (err: any) {
      setMessages(prev => [...prev.filter(m => !m.isTyping), { role: 'assistant', content: `⚠️ Error: ${err.message}. Please try again.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;
    triggerAI(msg);
  };

  const applyOption = (opt: AdvisorOption) => {
    const params: FormParams = {
      footprintShape: opt.footprintShape,
      overallWidth: opt.width,
      overallLength: opt.length,
      units1BHK: opt.units1BHK,
      units2BHK: opt.units2BHK,
      units3BHK: opt.units3BHK,
      units4BHK: opt.units4BHK,
      passengerLifts: opt.passengerLifts,
      staircases: opt.staircases,
      customPrompt: opt.designNotes,
    };
    onParamsApplied(params);
    setSuggestedShape(opt.footprintShape);
    setAppliedOptionId(opt.id);
    setParamsApplied(true);

    const mixParts = [
      opt.units1BHK > 0 ? `${opt.units1BHK}×1BHK` : '',
      opt.units2BHK > 0 ? `${opt.units2BHK}×2BHK` : '',
      opt.units3BHK > 0 ? `${opt.units3BHK}×3BHK` : '',
      opt.units4BHK > 0 ? `${opt.units4BHK}×4BHK` : '',
    ].filter(Boolean).join(', ');

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `✅ **Option ${opt.id} applied!**\n- Shape: **${opt.shapeName}**\n- Mix: ${mixParts} = **${opt.totalUnits} flats total**\n- Core: ${opt.passengerLifts} lifts + ${opt.staircases} stairs\n- Guarantee: **${opt.guaranteedPct}%**\n\nAll parameters auto-filled! Click **GENERATE FLOOR PLAN** below. 👇`,
    }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const renderContent = (content: string) => {
    return content.split('\n').map((line, i, arr) => {
      const html = line
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      return <span key={i} dangerouslySetInnerHTML={{ __html: html + (i < arr.length - 1 ? '<br/>' : '') }} />;
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">

      {/* ── Plot Tracer Canvas ──────────────────────────────────────── */}
      <div className="flex flex-col bg-slate-900/30 backdrop-blur border border-cyan-500/20 rounded-xl overflow-hidden shrink-0" style={{ maxHeight: '46%' }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/15 select-none">
          <div className="flex items-center gap-2">
            <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">PLOT TRACER — 10M GRID</span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isTracingClosed && polygon.length >= 3 && (
              <button
                onClick={closePlot}
                className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 border border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 cursor-pointer tracking-wider"
              >
                CLOSE & ANALYZE
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-cyan-500/70 border border-cyan-500/20 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer transition-colors"
            >
              <Upload className="w-3 h-3" /> SITE PLAN
            </button>
            {polygon.length > 0 && (
              <button
                onClick={resetTrace}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-red-400/70 border border-red-500/20 hover:border-red-400 hover:text-red-400 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> RESET
              </button>
            )}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

        {!isTracingClosed && (
          <div className="px-3 py-1 text-[9px] text-cyan-500/45 select-none">
            {polygon.length === 0 ? 'Click on grid to trace your plot. Each cell = 10×10 meters.' :
             polygon.length < 3 ? `${polygon.length} point(s). Need at least 3 to close.` :
             `${polygon.length} points. Click near first point (green dot) to close & analyze.`}
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
          onMouseLeave={() => setHoverPt(null)}
          className="w-full cursor-crosshair"
        />

        {isTracingClosed && plotData && (
          <div className="flex items-center justify-between px-3 py-1.5 text-[9px] font-mono border-t border-white/5">
            <span className="text-cyan-400/70">PLOT: <strong className="text-cyan-300">{plotData.widthM}m × {plotData.lengthM}m</strong></span>
            <span className="text-cyan-400/70">AREA: <strong className="text-cyan-300">{plotData.areaM2}m²</strong></span>
            {suggestedShape && <span className="text-amber-400/80">SHAPE: <strong className="text-amber-300">{suggestedShape.replace(/-/g,'·').toUpperCase()}</strong></span>}
          </div>
        )}
      </div>

      {/* ── AI Chat Panel ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 bg-slate-900/30 backdrop-blur border border-cyan-500/20 rounded-xl overflow-hidden min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/15 select-none shrink-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">ARIA — AI ARCHITECT</span>
          {isLoading && <span className="ml-auto text-[9px] text-amber-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> ANALYZING</span>}
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,240,255,0.2) transparent' }}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 rounded-br-none'
                  : 'bg-white/5 border border-white/10 text-slate-200 rounded-bl-none'
              }`}>
                {msg.isTyping ? (
                  <span className="flex gap-1 items-center py-1">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : renderContent(msg.content)}
              </div>

              {msg.options && msg.options.length > 0 && (
                <div className="w-full flex flex-col gap-2">
                  {msg.options.map(opt => (
                    <div key={opt.id} className={`rounded-xl border p-3 text-left transition-all ${
                      appliedOptionId === opt.id ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_15px_rgba(0,240,255,0.2)]' :
                      opt.guaranteedPct >= 100 ? 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-400' :
                      opt.guaranteedPct >= 90 ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-400' :
                      'border-white/15 bg-white/5 hover:border-white/30'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            opt.guaranteedPct >= 100 ? 'bg-emerald-500/20 text-emerald-300' :
                            opt.guaranteedPct >= 90 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white/70'
                          }`}>OPT {opt.id}</span>
                          <span className="text-[10px] font-bold text-white truncate max-w-[120px]">{opt.shapeName}</span>
                        </div>
                        <span className={`text-[11px] font-bold ${
                          opt.guaranteedPct >= 100 ? 'text-emerald-400' :
                          opt.guaranteedPct >= 90 ? 'text-amber-400' : 'text-orange-400'
                        }`}>{opt.guaranteedPct}%✓</span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <div className="bg-black/30 rounded p-1.5 text-center">
                          <div className="text-sm font-bold text-white">{opt.totalUnits}</div>
                          <div className="text-[8px] text-slate-400">FLATS</div>
                        </div>
                        <div className="bg-black/30 rounded p-1.5 text-center">
                          <div className="text-sm font-bold text-cyan-300">{opt.plateArea}</div>
                          <div className="text-[8px] text-slate-400">PLATE m²</div>
                        </div>
                        <div className="bg-black/30 rounded p-1.5 text-center">
                          <div className="text-sm font-bold text-amber-300">{opt.availableArea}</div>
                          <div className="text-[8px] text-slate-400">AVAIL m²</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 mb-2">
                        {opt.units1BHK > 0 && <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-mono">{opt.units1BHK}×1BHK</span>}
                        {opt.units2BHK > 0 && <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded font-mono">{opt.units2BHK}×2BHK</span>}
                        {opt.units3BHK > 0 && <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded font-mono">{opt.units3BHK}×3BHK</span>}
                        {opt.units4BHK > 0 && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono">{opt.units4BHK}×4BHK</span>}
                        <span className="text-[9px] px-1.5 py-0.5 bg-white/10 text-white/60 rounded font-mono">{opt.passengerLifts}L+{opt.staircases}S</span>
                      </div>

                      {opt.highlights && opt.highlights.slice(0, 2).map((h, i) => (
                        <div key={i} className="flex items-center gap-1 text-[9px] text-slate-400 mb-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5 text-cyan-500/60 shrink-0" />{h}
                        </div>
                      ))}

                      {appliedOptionId === opt.id ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-cyan-400 py-1.5 mt-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> APPLIED TO FORM
                        </div>
                      ) : (
                        <button
                          onClick={() => applyOption(opt)}
                          className="w-full py-1.5 rounded font-bold text-[10px] tracking-wider flex items-center justify-center gap-1.5 bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30 hover:border-cyan-400 transition-all cursor-pointer mt-2"
                        >
                          <ChevronRight className="w-3.5 h-3.5" /> APPLY THIS OPTION
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {paramsApplied && (
          <div className="px-3 pb-2 shrink-0 flex flex-col gap-2">
            
            {/* Resolution Selector */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <span className="text-[9px] font-bold text-cyan-500/60 uppercase tracking-wider shrink-0 mr-1">OUTPUT SIZE:</span>
              {OUTPUT_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => { setOutputW(preset.w); setOutputH(preset.h); }}
                  className={`px-2 py-1 rounded-md text-[9px] whitespace-nowrap transition-colors ${
                    outputW === preset.w && outputH === preset.h
                      ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400 font-bold shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                      : 'bg-black/30 text-slate-400 border border-white/5 hover:border-cyan-500/30'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerateTrigger}
              className="w-full py-2.5 rounded-lg font-bold text-sm tracking-wider flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500/30 to-purple-500/20 border border-cyan-400 text-white hover:from-cyan-500/40 hover:to-purple-500/30 transition-all cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.3)] animate-pulse-slow"
            >
              <Sparkles className="w-4 h-4" />
              GENERATE FLOOR PLAN
            </button>
          </div>
        )}

        <div className="px-3 pb-3 shrink-0 border-t border-white/5 pt-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 120m × 80m plot, max 3BHK..."
              disabled={isLoading}
              className="flex-1 bg-black/40 border border-cyan-500/20 focus:border-cyan-400 focus:outline-none rounded-lg px-3 py-2 text-[11px] text-cyan-300 placeholder-cyan-500/30 transition-colors font-mono"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 hover:border-cyan-400 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
