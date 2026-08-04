'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Upload, CheckCircle2, ChevronRight, RotateCcw, MousePointer, Sparkles, Edit2, Check } from 'lucide-react';

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

export interface ArchitectAdvisorRef {
  exportCanvasBase64: () => string | null;
  getShapeModifiedState: () => boolean;
  getCanvasDimensions: () => { w: number, h: number };
}

interface Props {
  onParamsApplied: (params: FormParams) => void;
  onGenerateTrigger: (opts: { tracerImageBase64?: string; canvasW?: number; canvasH?: number; isShapeModified?: boolean }) => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

// ─── Canvas constants ─────────────────────────────────────────────────────────
const CELL_M = 10;

function polygonBBox(pts: Point[]) {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function polygonCentroid(pts: Point[]) {
  if (!pts.length) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  if (pts.length === 2) return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  let cx = 0, cy = 0, area = 0;
  // If the polygon is open, we implicitly close it by iterating from the last point to the first
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].x * pts[i].y - pts[i].x * pts[j].y;
    cx += (pts[j].x + pts[i].x) * f;
    cy += (pts[j].y + pts[i].y) * f;
    area += f * 3;
  }
  if (area === 0) return { x: pts[0].x, y: pts[0].y };
  return { x: cx / area, y: cy / area };
}

function isPointInPolygon(point: Point, vs: Point[]): boolean {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y;
    let xj = vs[j].x, yj = vs[j].y;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function generateShapeOutlinePoints(shape: Point[], segments: number = 10): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < shape.length; i++) {
    const p1 = shape[i];
    const p2 = shape[(i + 1) % shape.length];
    for (let j = 0; j <= segments; j++) {
      points.push({
        x: p1.x + (p2.x - p1.x) * (j / segments),
        y: p1.y + (p2.y - p1.y) * (j / segments)
      });
    }
  }
  return points;
}

function rotateShape(shape: Point[], cx: number, cy: number, angle: number): Point[] {
  if (angle === 0) return shape;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return shape.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  });
}

function getShapePoints(shapeId: string, cx: number, cy: number, w: number, h: number): Point[][] {
  const hw = w / 2, hh = h / 2;
  const id = shapeId.toLowerCase();
  
  if (id.includes('monolithic') || id.includes('rect')) {
      return [[{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }]];
  } else if (id.includes('h-shape') || id === 'h') {
      const arm = hw * 0.35;
      return [[
        { x: cx - hw, y: cy - hh }, { x: cx - hw + arm, y: cy - hh },
        { x: cx - hw + arm, y: cy - hh * 0.35 }, { x: cx + hw - arm, y: cy - hh * 0.35 },
        { x: cx + hw - arm, y: cy - hh }, { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh }, { x: cx + hw - arm, y: cy + hh },
        { x: cx + hw - arm, y: cy + hh * 0.35 }, { x: cx - hw + arm, y: cy + hh * 0.35 },
        { x: cx - hw + arm, y: cy + hh }, { x: cx - hw, y: cy + hh },
      ]];
  } else if (id.includes('x-shape') || id.includes('cross') || (id.includes('curved') && id.includes('x')) || id.includes('pinwheel')) {
      // Clean Architectural Cross / X-Shape
      const armThickness = 0.35; // thickness of the arms
      const core = 0.35; // size of the center core where arms meet
      return [[
        // Top arm
        { x: cx - hw * armThickness, y: cy - hh },
        { x: cx + hw * armThickness, y: cy - hh },
        { x: cx + hw * armThickness, y: cy - hh * core },
        // Right arm
        { x: cx + hw, y: cy - hh * core },
        { x: cx + hw, y: cy + hh * core },
        { x: cx + hw * armThickness, y: cy + hh * core },
        // Bottom arm
        { x: cx + hw * armThickness, y: cy + hh },
        { x: cx - hw * armThickness, y: cy + hh },
        { x: cx - hw * armThickness, y: cy + hh * core },
        // Left arm
        { x: cx - hw, y: cy + hh * core },
        { x: cx - hw, y: cy - hh * core },
        { x: cx - hw * armThickness, y: cy - hh * core },
      ]];
  } else if (id.includes('tri-foil') || id.includes('y-shape')) {
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
  } else if (id.includes('stepped') || id.includes('l-shape') || id.match(/\bl\b/)) {
      return [[
        { x: cx - hw, y: cy - hh }, { x: cx + hw * 0.2, y: cy - hh },
        { x: cx + hw * 0.2, y: cy - hh * 0.2 }, { x: cx + hw, y: cy - hh * 0.2 },
        { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh },
      ]];
  } else if (id.includes('arc') || id.includes('crescent') || id.includes('elliptical')) {
      const pts4: Point[] = [];
      const sides = 16;
      for (let i = 0; i <= sides; i++) {
        const angle = ((i / sides) * (id.includes('crescent') ? 180 : 360) - 90) * Math.PI / 180;
        pts4.push({ x: cx + Math.cos(angle) * hw, y: cy + Math.sin(angle) * hh });
      }
      if (id.includes('crescent')) {
        for (let i = sides; i >= 0; i--) {
          const angle = ((i / sides) * 180 - 90) * Math.PI / 180;
          pts4.push({ x: cx + Math.cos(angle) * hw * 0.4, y: cy + Math.sin(angle) * hh * 0.8 });
        }
      }
      return [pts4];
  } else if (id.includes('ring') || id.includes('atrium') || id.includes('courtyard')) {
      if (id.includes('oval') || id.includes('circular') || id.includes('atrium')) {
         const pts: Point[] = [];
         const sides = 24;
         for (let i = 0; i <= sides; i++) {
           const angle = ((i / sides) * 359 - 90) * Math.PI / 180;
           pts.push({ x: cx + Math.cos(angle) * hw, y: cy + Math.sin(angle) * hh });
         }
         for (let i = sides; i >= 0; i--) {
           const angle = ((i / sides) * 359 - 90) * Math.PI / 180;
           pts.push({ x: cx + Math.cos(angle) * hw * 0.45, y: cy + Math.sin(angle) * hh * 0.45 });
         }
         return [pts];
      } else {
         // Rectangular ring with a slit on the right to form a valid non-intersecting polygon hole
         const ir = 0.45; // inner courtyard size ratio
         const slit = 0.1; // tiny slit offset
         return [[
           // Outer path
           { x: cx + hw, y: cy - slit },
           { x: cx + hw, y: cy - hh },
           { x: cx - hw, y: cy - hh },
           { x: cx - hw, y: cy + hh },
           { x: cx + hw, y: cy + hh },
           { x: cx + hw, y: cy + slit },
           // Inner path (backwards)
           { x: cx + hw * ir, y: cy + slit },
           { x: cx + hw * ir, y: cy + hh * ir },
           { x: cx - hw * ir, y: cy + hh * ir },
           { x: cx - hw * ir, y: cy - hh * ir },
           { x: cx + hw * ir, y: cy - hh * ir },
           { x: cx + hw * ir, y: cy - slit },
         ]];
      }
  } else if (id.includes('hex')) {
      const hexPts: Point[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 30) * Math.PI / 180;
        hexPts.push({ x: cx + Math.cos(angle) * hw, y: cy + Math.sin(angle) * hh });
      }
      return [hexPts];
  } else if (id.includes('s-shape') || id.includes('z-shape') || (id.includes('curved') && id.includes('s'))) {
      // Clean Architectural Z/S-Shape footprint
      const barH = 0.25; // thickness of the horizontal bars
      const stemW = 0.25; // thickness of the vertical stem
      return [[
        // Top horizontal bar
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy - hh + hh * barH * 2 },
        // Inner cut leftwards to the stem
        { x: cx + hw * stemW, y: cy - hh + hh * barH * 2 },
        // Vertical stem down
        { x: cx + hw * stemW, y: cy + hh - hh * barH * 2 },
        // Bottom horizontal bar
        { x: cx + hw, y: cy + hh - hh * barH * 2 },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh },
        { x: cx - hw, y: cy + hh - hh * barH * 2 },
        // Inner cut rightwards to the stem
        { x: cx - hw * stemW, y: cy + hh - hh * barH * 2 },
        // Vertical stem up
        { x: cx - hw * stemW, y: cy - hh + hh * barH * 2 },
        // Top horizontal bar (left side completion)
        { x: cx - hw, y: cy - hh + hh * barH * 2 },
      ]];
  } else {
      return [[{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }]];
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
import { forwardRef, useImperativeHandle } from 'react';

const ArchitectAdvisorPanel = forwardRef<ArchitectAdvisorRef, Props>(({ onParamsApplied, onGenerateTrigger, selectedModel, onModelChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const buildingAreaRef = useRef<number | null>(null);
  const finalShapePolygonsRef = useRef<Point[][] | null>(null);

  const [canvasW, setCanvasW] = useState(1260);
  const [canvasH, setCanvasH] = useState(780);
  const [cellPx, setCellPx] = useState(54);

  const pxToM = useCallback((px: number) => parseFloat((px / cellPx * CELL_M).toFixed(1)), [cellPx]);

  const polygonAreaM2 = useCallback((pts: Point[]): number => {
    if (pts.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pxToM(pts[i].x) * pxToM(pts[j].y) - pxToM(pts[j].x) * pxToM(pts[i].y);
    }
    return parseFloat(Math.abs(a / 2).toFixed(1));
  }, [pxToM]);

  const [polygon, setPolygon] = useState<Point[]>([]);
  const [isTracingClosed, setIsTracingClosed] = useState(false);
  const [isGridSet, setIsGridSet] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [imgBounds, setImgBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragMode, setDragMode] = useState<'move' | 'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const [dragStartRaw, setDragStartRaw] = useState<{ x: number; y: number } | null>(null);
  const [initialBounds, setInitialBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [hasDraggedImg, setHasDraggedImg] = useState(false);
  const [hoverPt, setHoverPt] = useState<Point | null>(null);
  const [plotData, setPlotData] = useState<PlotData | null>(null);
  const [suggestedShape, setSuggestedShape] = useState<string | null>(null);
  const [appliedOptionId, setAppliedOptionId] = useState<string | null>(null);

  // ── Shape Vertex Editing State ────────────────────────────────────────────
  const [isEditingShape, setIsEditingShape] = useState(false);
  const [editablePolygons, setEditablePolygons] = useState<Point[][] | null>(null);
  const [shapeDragIdx, setShapeDragIdx] = useState<{ polyIdx: number; ptIdx: number } | null>(null);
  const [shapeDragStart, setShapeDragStart] = useState<Point | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ polyIdx: number; edgeIdx: number; insertPt: Point } | null>(null);
  const [isRotatingShape, setIsRotatingShape] = useState(false);
  const [shapeRotationAngle, setShapeRotationAngle] = useState(0);
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  const [shapeWasModified, setShapeWasModified] = useState(false);
  const [shapeGeometryAnalysis, setShapeGeometryAnalysis] = useState<string | null>(null);

  // Helper: check if a point is inside the traced plot polygon
  const isPointInPlot = useCallback((pt: Point): boolean => {
    if (polygon.length < 3) return true;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }, [polygon]);

  // Helper: get centroid of all editable polygons
  const getShapeCentroid = useCallback((polys: Point[][]): Point => {
    const allPts = polys.flat();
    const cx = allPts.reduce((s, p) => s + p.x, 0) / allPts.length;
    const cy = allPts.reduce((s, p) => s + p.y, 0) / allPts.length;
    return { x: cx, y: cy };
  }, []);

  // Helper: rotate a point around a center
  const rotatePoint = useCallback((pt: Point, center: Point, angle: number): Point => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
  }, []);

  // Output canvas dimensions (for AI generation image size)
  const [outputW, setOutputW] = useState(1024);
  const [outputH, setOutputH] = useState(1024);
  
  // Custom plot dimensions input
  const [plotInputW, setPlotInputW] = useState('');
  const [plotInputH, setPlotInputH] = useState('');

  // Custom architectural dimensions (meters)
  const [customW, setCustomW] = useState<string>('');
  const [customH, setCustomH] = useState<string>('');
  

  const applyCustomRatio = useCallback((wM: number, hM: number) => {
    if (!wM || !hM || wM <= 0 || hM <= 0) return;
    const maxPx = 1024;
    let pxW, pxH;
    
    // Scale largest dimension to maxPx
    if (wM >= hM) {
      pxW = maxPx;
      pxH = Math.round((hM / wM) * maxPx);
    } else {
      pxH = maxPx;
      pxW = Math.round((wM / hM) * maxPx);
    }
    
    // Snap to nearest 64 (required by diffusion models)
    pxW = Math.max(512, Math.round(pxW / 64) * 64);
    pxH = Math.max(512, Math.round(pxH / 64) * 64);
    
    setOutputW(pxW);
    setOutputH(pxH);
  }, []);

  const OUTPUT_PRESETS = [
    { label: '1024×1024 (Square)', w: 1024, h: 1024 },
    { label: '1024×768 (Landscape)', w: 1024, h: 768 },
    { label: '768×1024 (Portrait)', w: 768, h: 1024 },
    { label: '1280×960 (Wide)', w: 1280, h: 960 },
    { label: '1024×576 (Cinema)', w: 1024, h: 576 },
  ];

  // Export tracer canvas as clean black/white trace for AI
  // Uses the same technique as the Concept Generator: black background + white polygon fill
  // This format is proven to give AI models the most accurate shape recognition
  const exportForAI = useCallback((): string | null => {
    if (polygon.length < 3 || !isTracingClosed) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = outputW;
    offscreen.height = outputH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    // 1. Solid BLACK background (AI knows: black = don't touch)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outputW, outputH);

    // Determine which polygon to export
    let activePts: Point[];
    if (suggestedShape && finalShapePolygonsRef.current) {
      // Use the shape polygons (flatten multi-polygon into single polygon for simplicity)
      activePts = finalShapePolygonsRef.current.flat();
    } else {
      // Use the traced plot boundary
      activePts = polygon;
    }

    if (activePts.length < 3) return null;

    // 2. Scale and center the polygon using zoom-to-fit (same as concept generator)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    activePts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const ptsW = maxX - minX;
    const ptsH = maxY - minY;
    const padding = 24; // 24px margin — same as concept generator
    const targetW = Math.max(1, outputW - padding * 2);
    const targetH = Math.max(1, outputH - padding * 2);

    const scale = Math.min(targetW / (ptsW || 1), targetH / (ptsH || 1));
    const offsetX = (outputW / 2) - ((minX + maxX) / 2) * scale;
    const offsetY = (outputH / 2) - ((minY + maxY) / 2) * scale;

    const scaledPts = activePts.map(p => ({
      x: Math.round(p.x * scale + offsetX),
      y: Math.round(p.y * scale + offsetY)
    }));

    // 3. Fill polygon with WHITE (AI knows: white = draw floor plan here)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
    for (let i = 1; i < scaledPts.length; i++) {
      ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // 4. Draw room-hint grid boxes inside the polygon (same technique as concept generator)
    // These tiny boxes give the AI a visual cue that small rooms are expected
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
    for (let i = 1; i < scaledPts.length; i++) {
      ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // Calculate grid cell size — aim for ~50px cells (room-sized hints)
    let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
    scaledPts.forEach(p => {
      if (p.x < sMinX) sMinX = p.x;
      if (p.x > sMaxX) sMaxX = p.x;
      if (p.y < sMinY) sMinY = p.y;
      if (p.y > sMaxY) sMaxY = p.y;
    });
    const gridCellSize = 50;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 0.5;

    for (let gy = Math.floor(sMinY / gridCellSize) * gridCellSize; gy <= sMaxY; gy += gridCellSize) {
      const rowOffset = (Math.random() - 0.5) * gridCellSize;
      for (let gx = Math.floor(sMinX / gridCellSize) * gridCellSize; gx <= sMaxX; gx += gridCellSize) {
        const w = gridCellSize * (0.6 + Math.random() * 1.0);
        const h = gridCellSize * (0.6 + Math.random() * 1.0);
        const yScatter = (Math.random() - 0.5) * 10;
        ctx.strokeRect(gx + rowOffset, gy + yScatter, w, h);
      }
    }
    ctx.restore();

    // Return full data URL (NOT stripped — the API route handles stripping)
    return offscreen.toDataURL('image/png');
  }, [polygon, isTracingClosed, suggestedShape, outputW, outputH]);

  const handleGenerateTrigger = useCallback(() => {
    const base64 = exportForAI();
    onGenerateTrigger({ tracerImageBase64: base64 || undefined, canvasW: outputW, canvasH: outputH, isShapeModified: shapeWasModified });
  }, [exportForAI, onGenerateTrigger, outputW, outputH, shapeWasModified]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi! I'm **ARIA**, your AI Senior Architect. 🏗️\n\n**To get started:**\n1. Upload your site plan image above (optional)\n2. Click on the 10m grid to trace your plot boundary\n3. Close the polygon — I'll instantly calculate the best tower configurations!\n\nOr just type your plot dimensions: e.g. *"100m × 80m rectangular plot, max 2BHK and 3BHK"*`,
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [paramsApplied, setParamsApplied] = useState(false);

  useImperativeHandle(ref, () => ({
    exportCanvasBase64: () => exportForAI(),
    getShapeModifiedState: () => shapeWasModified,
    getCanvasDimensions: () => ({ w: outputW, h: outputH })
  }));

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (bgImage && imgBounds) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(bgImage, imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h);
      ctx.globalAlpha = 1;

      // Draw transform bounding box & corner handles
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h);
      ctx.setLineDash([]);

      const handles = [
        { x: imgBounds.x, y: imgBounds.y }, // TL
        { x: imgBounds.x + imgBounds.w, y: imgBounds.y }, // TR
        { x: imgBounds.x, y: imgBounds.y + imgBounds.h }, // BL
        { x: imgBounds.x + imgBounds.w, y: imgBounds.y + imgBounds.h }, // BR
      ];

      handles.forEach(h => {
        ctx.fillStyle = '#00f0ff';
        ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
      });
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= canvasW; x += cellPx) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke();
    }
    for (let y = 0; y <= canvasH; y += cellPx) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke();
    }

    // 1m subdivision dots
    ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
    const mPx = cellPx / 10;
    for (let x = 0; x <= canvasW; x += mPx) {
      for (let y = 0; y <= canvasH; y += mPx) {
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }

    // 10m Grid dots
    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
    for (let x = 0; x <= canvasW; x += cellPx) {
      for (let y = 0; y <= canvasH; y += cellPx) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Scale label
    ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('GRID: 1 CELL = 10M', 16, 24);

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
          let shapePolygons: Point[][] = [];
          let textCx = 0;
          let textCy = 0;
          
          if (!shapeWasModified) {
            const bbox = polygonBBox(polygon);
            let bestArea = 0;
            let bestScale = 0.15;
            let bestCx = polygonCentroid(polygon).x;
            let bestCy = polygonCentroid(polygon).y;
            let bestAngle = 0;
            let bestRatio = { rw: 1.0, rh: 1.0 };
            
            const baseSize = Math.max(bbox.w, bbox.h) * 0.85;
            const aspectRatios = [
              { rw: 1.0, rh: 1.0 },   { rw: 1.25, rh: 1.0 },
              { rw: 1.5, rh: 1.0 },   { rw: 1.75, rh: 1.0 },
              { rw: 2.0, rh: 1.0 }
            ];
            
            const stepsX = 15;
            const stepsY = 15;
            for (let ix = 1; ix < stepsX; ix++) {
              for (let iy = 1; iy < stepsY; iy++) {
                const testCx = bbox.minX + (bbox.w * ix) / stepsX;
                const testCy = bbox.minY + (bbox.h * iy) / stepsY;
                if (!isPointInPolygon({ x: testCx, y: testCy }, polygon)) continue;
                
                for (const ratio of aspectRatios) {
                  const maxW = baseSize * ratio.rw;
                  const maxH = baseSize * ratio.rh;
                  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
                    const minRequiredScale = Math.sqrt(bestArea / (ratio.rw * ratio.rh));
                    if (minRequiredScale >= 1.0) continue;
                    
                    let localMaxScale = 0;
                    for (let scale = 1.0; scale > minRequiredScale; scale -= 0.02) {
                      const testShapes = getShapePoints(suggestedShape, testCx, testCy, maxW * scale, maxH * scale);
                      let allInside = true;
                      for (const pts of testShapes) {
                        const rotatedPts = rotateShape(pts, testCx, testCy, angle);
                        const outlinePts = generateShapeOutlinePoints(rotatedPts, 6);
                        for (const pt of outlinePts) {
                          if (!isPointInPolygon(pt, polygon)) { allInside = false; break; }
                        }
                        if (!allInside) break;
                      }
                      if (allInside) { localMaxScale = scale; break; }
                    }
                    const localArea = ratio.rw * ratio.rh * localMaxScale * localMaxScale;
                    if (localArea > bestArea) {
                      bestArea = localArea; bestScale = localMaxScale; bestCx = testCx; bestCy = testCy; bestAngle = angle; bestRatio = ratio;
                    }
                  }
                }
              }
            }
            
            const finalScale = bestScale * 0.90;
            const finalW = baseSize * bestRatio.rw * finalScale;
            const finalH = baseSize * bestRatio.rh * finalScale;
            
            shapePolygons = getShapePoints(suggestedShape, bestCx, bestCy, finalW, finalH);
            shapePolygons = shapePolygons.map(pts => rotateShape(pts, bestCx, bestCy, bestAngle));
            
            let totalBuildingAreaM2 = 0;
            shapePolygons.forEach(pts => { totalBuildingAreaM2 += polygonAreaM2(pts); });
            buildingAreaRef.current = totalBuildingAreaM2;
            finalShapePolygonsRef.current = shapePolygons;
            textCx = bestCx;
            textCy = bestCy;
          } else {
            shapePolygons = finalShapePolygonsRef.current || [];
            if (shapePolygons.length > 0) {
               const centroid = getShapeCentroid(shapePolygons);
               textCx = centroid.x;
               textCy = centroid.y;
            }
          }
          
          ctx.save();
          
          if (!isEditingShape) {
            shapePolygons.forEach(shapePts => {
              if (shapePts.length < 3) return;
              ctx.fillStyle = 'rgba(255, 165, 0, 0.25)';
              ctx.strokeStyle = '#FFB000';
              ctx.lineWidth = 2.0;
              ctx.beginPath();
              ctx.moveTo(shapePts[0].x, shapePts[0].y);
              shapePts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            });
          }
          
          ctx.fillStyle = 'rgba(255,165,0,0.85)';
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          
          // Rotate text to match building orientation if needed (optional, keeping horizontal for readability)
          ctx.fillText('BUILDING SHAPE', textCx, textCy);
          ctx.textAlign = 'left';
          
          ctx.restore();
          
          // ── Shape Editing Overlay ───────────────────────────────────────
          if (isEditingShape && editablePolygons) {
            // Draw the editable shape (overrides the static one)
            editablePolygons.forEach(shapePts => {
              if (shapePts.length < 3) return;
              ctx.fillStyle = 'rgba(255, 165, 0, 0.30)';
              ctx.strokeStyle = '#FF6B00';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(shapePts[0].x, shapePts[0].y);
              shapePts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            });
            
            // Draw vertex handles
            editablePolygons.forEach(shapePts => {
              shapePts.forEach(pt => {
                ctx.fillStyle = '#FF6B00';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              });
            });
            
            // Draw hovered edge insert point
            if (hoveredEdge) {
              ctx.fillStyle = '#00ff88';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(hoveredEdge.insertPt.x, hoveredEdge.insertPt.y, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              // Draw a "+" label
              ctx.fillStyle = '#00ff88';
              ctx.font = 'bold 10px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('+', hoveredEdge.insertPt.x, hoveredEdge.insertPt.y - 10);
              ctx.textAlign = 'left';
            }
            
            // Draw rotation handle
            const centroid = getShapeCentroid(editablePolygons);
            const rotHandleY = centroid.y - 50;
            
            // Dashed line from centroid to rotation handle
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(centroid.x, centroid.y);
            ctx.lineTo(centroid.x, rotHandleY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Rotation circle
            ctx.fillStyle = '#8B5CF6';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centroid.x, rotHandleY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Rotation icon (↻)
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('↻', centroid.x, rotHandleY + 3);
            ctx.textAlign = 'left';
            
            // Real-time area display
            let editArea = 0;
            editablePolygons.forEach(pts => { editArea += polygonAreaM2(pts); });
            ctx.fillStyle = 'rgba(255, 107, 0, 0.9)';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${editArea.toFixed(0)} m²`, centroid.x, centroid.y + 4);
            ctx.textAlign = 'left';
          }
          
          // Re-draw polygon outline to ensure it stays crisp
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(polygon[0].x, polygon[0].y);
          polygon.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.stroke();
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
      ctx.beginPath(); ctx.moveTo(hoverPt.x, 0); ctx.lineTo(hoverPt.x, canvasH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, hoverPt.y); ctx.lineTo(canvasW, hoverPt.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,240,255,0.7)';
      ctx.font = '7px monospace';
      ctx.fillText(`${pxToM(hoverPt.x)}m, ${pxToM(hoverPt.y)}m`, hoverPt.x + 6, hoverPt.y - 3);
    }
  }, [polygon, hoverPt, isTracingClosed, bgImage, imgBounds, suggestedShape, canvasW, canvasH, cellPx, pxToM]);

  useEffect(() => {
    // Smooth scroll the closest scrollable container (the page wrapper) instead of using scrollIntoView
    // which breaks the body's overflow-hidden layout in Next.js
    if (chatEndRef.current) {
      const scrollContainer = chatEndRef.current.closest('.overflow-y-auto');
      if (scrollContainer) {
        // Use a slight delay to ensure DOM has expanded after state update
        setTimeout(() => {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  }, [messages]);

  const snapToGrid = (px: number, py: number): Point => {
    const mPx = cellPx / 10;
    return {
      x: Math.round(px / mPx) * mPx,
      y: Math.round(py / mPx) * mPx,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const raw = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };

    // ── Shape editing intercept ─────────────────────────────────────────────
    if (isEditingShape && editablePolygons) {
      const HANDLE_R = 8;
      
      // Check rotation handle (circle above centroid)
      const centroid = getShapeCentroid(editablePolygons);
      const rotHandleY = centroid.y - 50;
      if (Math.hypot(raw.x - centroid.x, raw.y - rotHandleY) <= HANDLE_R + 4) {
        setIsRotatingShape(true);
        setRotationStartAngle(Math.atan2(raw.y - centroid.y, raw.x - centroid.x) - shapeRotationAngle);
        return;
      }

      // Check vertex handles
      for (let pi = 0; pi < editablePolygons.length; pi++) {
        for (let vi = 0; vi < editablePolygons[pi].length; vi++) {
          const pt = editablePolygons[pi][vi];
          if (Math.hypot(raw.x - pt.x, raw.y - pt.y) <= HANDLE_R) {
            setShapeDragIdx({ polyIdx: pi, ptIdx: vi });
            setShapeDragStart(raw);
            return;
          }
        }
      }

      // Check if clicking on an edge (insert vertex)
      if (hoveredEdge) {
        const { polyIdx, edgeIdx, insertPt } = hoveredEdge;
        // Only insert if the point is inside the plot
        if (isPointInPlot(insertPt)) {
          setEditablePolygons(prev => {
            if (!prev) return prev;
            const newPolys = prev.map(p => [...p]);
            newPolys[polyIdx].splice(edgeIdx + 1, 0, { ...insertPt });
            return newPolys;
          });
          setShapeWasModified(true);
          setHoveredEdge(null);
        }
        return;
      }
      return;
    }


    if (!bgImage || !imgBounds) return;

    const handleRadius = 12;
    const { x, y, w, h } = imgBounds;

    if (Math.hypot(raw.x - x, raw.y - y) <= handleRadius) {
      setDragMode('tl');
    } else if (Math.hypot(raw.x - (x + w), raw.y - y) <= handleRadius) {
      setDragMode('tr');
    } else if (Math.hypot(raw.x - x, raw.y - (y + h)) <= handleRadius) {
      setDragMode('bl');
    } else if (Math.hypot(raw.x - (x + w), raw.y - (y + h)) <= handleRadius) {
      setDragMode('br');
    } else if (raw.x >= x && raw.x <= x + w && raw.y >= y && raw.y <= y + h) {
      setDragMode('move');
    } else {
      setDragMode(null);
      return;
    }

    setDragStartRaw(raw);
    setInitialBounds({ ...imgBounds });
    setHasDraggedImg(false);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const raw = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };

    // ── Shape editing intercept ─────────────────────────────────────────────
    if (isEditingShape && editablePolygons) {
      // Handle rotation
      if (isRotatingShape) {
        const centroid = getShapeCentroid(editablePolygons);
        const currentAngle = Math.atan2(raw.y - centroid.y, raw.x - centroid.x);
        const newAngle = currentAngle - rotationStartAngle;
        const deltaAngle = newAngle - shapeRotationAngle;
        
        // Rotate all points
        const rotated = editablePolygons.map(poly =>
          poly.map(p => rotatePoint(p, centroid, deltaAngle))
        );
        
        // Check all points are inside plot
        const allInside = rotated.flat().every(p => isPointInPlot(p));
        if (allInside) {
          setEditablePolygons(rotated);
          setShapeRotationAngle(newAngle);
          setShapeWasModified(true);
        }
        return;
      }
      
      // Handle vertex dragging
      if (shapeDragIdx && shapeDragStart) {
        const dx = raw.x - shapeDragStart.x;
        const dy = raw.y - shapeDragStart.y;
        const newPt = {
          x: editablePolygons[shapeDragIdx.polyIdx][shapeDragIdx.ptIdx].x + dx,
          y: editablePolygons[shapeDragIdx.polyIdx][shapeDragIdx.ptIdx].y + dy,
        };
        
        // Constrain to plot boundary
        if (isPointInPlot(newPt)) {
          setEditablePolygons(prev => {
            if (!prev) return prev;
            const newPolys = prev.map(poly => poly.map(p => ({ ...p })));
            newPolys[shapeDragIdx.polyIdx][shapeDragIdx.ptIdx] = newPt;
            return newPolys;
          });
          setShapeDragStart(raw);
          setShapeWasModified(true);
        }
        return;
      }
      
      // Detect edge hover for vertex insertion
      const EDGE_DIST = 10;
      let foundEdge: typeof hoveredEdge = null;
      for (let pi = 0; pi < editablePolygons.length && !foundEdge; pi++) {
        const pts = editablePolygons[pi];
        for (let ei = 0; ei < pts.length; ei++) {
          const a = pts[ei];
          const b = pts[(ei + 1) % pts.length];
          // Distance from raw to line segment a-b
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) continue;
          let t = ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / lenSq;
          t = Math.max(0.1, Math.min(0.9, t)); // clamp to avoid inserting on top of existing vertices
          const proj = { x: a.x + t * dx, y: a.y + t * dy };
          const dist = Math.hypot(raw.x - proj.x, raw.y - proj.y);
          if (dist <= EDGE_DIST) {
            foundEdge = { polyIdx: pi, edgeIdx: ei, insertPt: proj };
            break;
          }
        }
      }
      setHoveredEdge(foundEdge);
      
      if (canvasRef.current) {
        if (shapeDragIdx) canvasRef.current.style.cursor = 'grabbing';
        else if (foundEdge) canvasRef.current.style.cursor = 'cell';
        else canvasRef.current.style.cursor = 'default';
      }
      return;
    }

    if (dragMode && dragStartRaw && initialBounds) {
      const dx = raw.x - dragStartRaw.x;
      const dy = raw.y - dragStartRaw.y;

      if (Math.hypot(dx, dy) > 3) setHasDraggedImg(true);

      let { x, y, w, h } = initialBounds;

      if (dragMode === 'move') {
        x += dx;
        y += dy;
      } else {
        // Proportional Canva-style scaling
        const aspect = initialBounds.w / initialBounds.h;
        if (dragMode === 'br') {
          w = Math.max(30, initialBounds.w + dx);
          h = w / aspect;
        } else if (dragMode === 'bl') {
          w = Math.max(30, initialBounds.w - dx);
          h = w / aspect;
          x = initialBounds.x + (initialBounds.w - w);
        } else if (dragMode === 'tr') {
          w = Math.max(30, initialBounds.w + dx);
          h = w / aspect;
          y = initialBounds.y + (initialBounds.h - h);
        } else if (dragMode === 'tl') {
          w = Math.max(30, initialBounds.w - dx);
          h = w / aspect;
          x = initialBounds.x + (initialBounds.w - w);
          y = initialBounds.y + (initialBounds.h - h);
        }
      }

      setImgBounds({ x, y, w, h });
      return;
    }

    // Dynamic Cursors on Hover over handles/image
    if (bgImage && imgBounds && canvasRef.current) {
      const handleRadius = 10;
      const { x, y, w, h } = imgBounds;
      if (Math.hypot(raw.x - x, raw.y - y) <= handleRadius || Math.hypot(raw.x - (x + w), raw.y - (y + h)) <= handleRadius) {
        canvasRef.current.style.cursor = 'nwse-resize';
      } else if (Math.hypot(raw.x - (x + w), raw.y - y) <= handleRadius || Math.hypot(raw.x - x, raw.y - (y + h)) <= handleRadius) {
        canvasRef.current.style.cursor = 'nesw-resize';
      } else if (raw.x >= x && raw.x <= x + w && raw.y >= y && raw.y <= y + h) {
        canvasRef.current.style.cursor = 'grab';
      } else {
        canvasRef.current.style.cursor = 'crosshair';
      }
    }

    setHoverPt(snapToGrid(raw.x, raw.y));
  };

  const handleCanvasMouseUp = () => {
    setDragMode(null);
    setDragStartRaw(null);
    setInitialBounds(null);
    // Shape editing
    setShapeDragIdx(null);
    setShapeDragStart(null);
    setIsRotatingShape(false);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEditingShape) return; // editing mode handles its own clicks in mouseDown
    if (hasDraggedImg) {
      setHasDraggedImg(false);
      return;
    }
    if (!isGridSet) {
      alert("Please enter the Overall Width and Length and click 'SET' before tracing.");
      return;
    }
    if (isTracingClosed) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const raw = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    const snapped = snapToGrid(raw.x, raw.y);

    if (polygon.length >= 3) {
      const first = polygon[0];
      if (Math.hypot(snapped.x - first.x, snapped.y - first.y) < cellPx) {
        closePlot();
        return;
      }
    }
    setPolygon(prev => [...prev, snapped]);
  };

  // Right-click to delete a vertex in shape edit mode
  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isEditingShape || !editablePolygons) return;
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const raw = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    
    const HANDLE_R = 10;
    for (let pi = 0; pi < editablePolygons.length; pi++) {
      for (let vi = 0; vi < editablePolygons[pi].length; vi++) {
        const pt = editablePolygons[pi][vi];
        if (Math.hypot(raw.x - pt.x, raw.y - pt.y) <= HANDLE_R) {
          // Don't allow deleting if polygon would have < 3 vertices
          if (editablePolygons[pi].length <= 3) return;
          setEditablePolygons(prev => {
            if (!prev) return prev;
            const newPolys = prev.map(poly => [...poly]);
            newPolys[pi].splice(vi, 1);
            return newPolys;
          });
          setShapeWasModified(true);
          return;
        }
      }
    }
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
    setHasAnalyzed(false);
  }, [polygon]);

  const handleAnalyzePlot = () => {
    if (!plotData || hasAnalyzed) return;
    setHasAnalyzed(true);
    if (isFullscreen) setIsFullscreen(false); // exit fullscreen on analyze to view chat
    const analysisMsg = `Plot closed! Dimensions: **${plotData.widthM}m × ${plotData.lengthM}m**, Area: **${plotData.areaM2}m²**. Please analyze the dimensions and ask me what building shape I want, or offer to suggest the best shape.`;
    triggerAI(analysisMsg, plotData);
  };

  const resetTrace = () => {
    setPolygon([]);
    setIsTracingClosed(false);
    setHasAnalyzed(false);
    setPlotData(null);
    setSuggestedShape(null);
    setAppliedOptionId(null);
    setParamsApplied(false);
    setBgImage(null);
    setImgBounds(null);
    setIsEditingShape(false);
    setEditablePolygons(null);
    setShapeWasModified(false);
    setShapeGeometryAnalysis(null);
    setShapeRotationAngle(0);
  };

  // ── Shape Editing Functions ─────────────────────────────────────────────────
  const enterShapeEditMode = useCallback(() => {
    if (!finalShapePolygonsRef.current) return;
    // Deep clone the shape polygons so edits don't affect the original until "Done"
    const cloned = finalShapePolygonsRef.current.map(poly => poly.map(p => ({ ...p })));
    setEditablePolygons(cloned);
    setIsEditingShape(true);
    setShapeRotationAngle(0);
  }, []);

  const computeGeometryAnalysis = useCallback((polys: Point[][]): string => {
    const allPts = polys.flat();
    if (allPts.length < 3) return '';

    // Bounding box in meters
    const minX = Math.min(...allPts.map(p => p.x));
    const maxX = Math.max(...allPts.map(p => p.x));
    const minY = Math.min(...allPts.map(p => p.y));
    const maxY = Math.max(...allPts.map(p => p.y));
    const bbWidthM = pxToM(maxX - minX);
    const bbHeightM = pxToM(maxY - minY);

    // Total footprint area
    let totalArea = 0;
    polys.forEach(pts => { totalArea += polygonAreaM2(pts); });

    // Perimeter
    let totalPerimeter = 0;
    polys.forEach(pts => {
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        totalPerimeter += Math.hypot(pxToM(pts[j].x - pts[i].x), pxToM(pts[j].y - pts[i].y));
      }
    });
    const perimeterToArea = totalArea > 0 ? parseFloat((totalPerimeter / totalArea).toFixed(3)) : 0;

    // Wing width analysis: sample horizontal and vertical slices through the shape
    // to find the narrowest and widest passable widths
    const sampleCount = 20;
    const widths: number[] = [];
    
    polys.forEach(pts => {
      for (let s = 0; s < sampleCount; s++) {
        const y = minY + (maxY - minY) * (s + 0.5) / sampleCount;
        // Find horizontal intersections at this Y
        const intersections: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          const y1 = pts[i].y, y2 = pts[j].y;
          if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
            const t = (y - y1) / (y2 - y1);
            intersections.push(pts[i].x + t * (pts[j].x - pts[i].x));
          }
        }
        intersections.sort((a, b) => a - b);
        // Pair consecutive intersections for wing widths
        for (let k = 0; k < intersections.length - 1; k += 2) {
          const w = pxToM(intersections[k + 1] - intersections[k]);
          if (w > 2) widths.push(w); // ignore slivers < 2m
        }
      }
    });

    const narrowestWidth = widths.length > 0 ? Math.min(...widths) : 0;
    const widestWidth = widths.length > 0 ? Math.max(...widths) : 0;

    // Determine what fits in narrowest wing
    let narrowFit = 'studio only';
    if (narrowestWidth >= 18) narrowFit = 'up to 4BHK';
    else if (narrowestWidth >= 15) narrowFit = 'up to 3BHK';
    else if (narrowestWidth >= 12) narrowFit = '1BHK or 2BHK';
    else if (narrowestWidth >= 8) narrowFit = '1BHK only';

    let wideFit = 'studio only';
    if (widestWidth >= 18) wideFit = 'up to 4BHK';
    else if (widestWidth >= 15) wideFit = 'up to 3BHK';
    else if (widestWidth >= 12) wideFit = '1BHK or 2BHK';
    else if (widestWidth >= 8) wideFit = '1BHK only';

    return `[SHAPE GEOMETRY ANALYSIS:
- Modified footprint area: ${totalArea.toFixed(1)} m²
- Bounding box: ${bbWidthM}m × ${bbHeightM}m
- Narrowest wing: ${narrowestWidth.toFixed(1)}m (can fit: ${narrowFit})
- Widest wing: ${widestWidth.toFixed(1)}m (can fit: ${wideFit})
- Perimeter-to-area ratio: ${perimeterToArea} (${perimeterToArea > 0.15 ? 'good facade exposure' : 'compact, fewer windows'})
- Shape type: ${suggestedShape ? suggestedShape.toUpperCase() + (shapeWasModified ? ' (EDITED)' : '') : 'CUSTOM'}
Use these measurements to determine which apartment types can physically fit in each wing. Do NOT place apartment types wider than the wing allows.]`;
  }, [pxToM, polygonAreaM2, suggestedShape, shapeWasModified]);

  const exitShapeEditMode = useCallback(() => {
    if (!editablePolygons) return;
    
    // Save edited polygons back to the ref
    finalShapePolygonsRef.current = editablePolygons;
    
    // Recalculate building area
    let totalArea = 0;
    editablePolygons.forEach(pts => { totalArea += polygonAreaM2(pts); });
    buildingAreaRef.current = totalArea;
    
    // Mark as modified if any changes were made
    if (shapeWasModified && suggestedShape) {
      // Label stays as original + "(Edited)" — handled in display
    }
    
    // Compute geometry analysis for chatbot
    const analysis = computeGeometryAnalysis(editablePolygons);
    setShapeGeometryAnalysis(analysis);
    
    finalShapePolygonsRef.current = editablePolygons;
    
    setIsEditingShape(false);
    setEditablePolygons(null);
    setShapeDragIdx(null);
    setHoveredEdge(null);
    setIsRotatingShape(false);
  }, [editablePolygons, polygonAreaM2, computeGeometryAnalysis, suggestedShape, shapeWasModified]);

  const handleSetExactPlot = () => {
    const w = parseFloat(plotInputW);
    const h = parseFloat(plotInputH);
    if (!w || !h || w <= 0 || h <= 0) return;
    
    // Default canvas maximum extents
    const maxW = 1260;
    const maxH = 780;
    
    let newCanvasW, newCanvasH;
    
    // Scale canvas to match exactly the aspect ratio of the inputs, up to the maximum extents
    if (w / h > maxW / maxH) {
       newCanvasW = maxW;
       newCanvasH = maxW * (h / w);
    } else {
       newCanvasH = maxH;
       newCanvasW = maxH * (w / h);
    }
    
    // Calculate the grid cell size (cellPx) so that the physical px distance represents 'w' meters
    // Formula: pxToM(newCanvasW) = w  =>  newCanvasW / newCellPx * CELL_M = w
    const newCellPx = (newCanvasW * CELL_M) / w;
    
    setCanvasW(newCanvasW);
    setCanvasH(newCanvasH);
    setCellPx(newCellPx);
    
    // Clear any existing tracing so the user can trace their own shape on the newly scaled canvas
    setPolygon([]);
    setIsTracingClosed(false);
    setHasAnalyzed(false);
    setPlotData(null);
    setSuggestedShape(null);
    setAppliedOptionId(null);
    setParamsApplied(false);
    setIsGridSet(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setBgImage(img);
      const aspect = img.width / img.height;
      let w = canvasW * 0.75;
      let h = w / aspect;
      if (h > canvasH * 0.75) {
        h = canvasH * 0.75;
        w = h * aspect;
      }
      setImgBounds({
        x: (canvasW - w) / 2,
        y: (canvasH - h) / 2,
        w,
        h
      });
    };
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
      
      // Geometric Feedback Loop: Silently inject the exact footprint area into the prompt
      if (buildingAreaRef.current && suggestedShape && apiMessages.length > 0) {
        const lastMsg = apiMessages[apiMessages.length - 1];
        if (lastMsg.role === 'user') {
          lastMsg.content += `\n\n[SYSTEM LOG: The UI currently has the shape '${suggestedShape}' placed with a physical footprint area of ${buildingAreaRef.current} m². If the user is asking to change the shape, you MUST output a new \`\`\`shape-suggestion\`\`\` block. If the user is proceeding with unit mix for the current shape, you MUST use ${buildingAreaRef.current} m² as your starting footprint (plateArea) for calculations instead of estimating.]`;
          
          if (shapeGeometryAnalysis) {
            lastMsg.content += `\n\n${shapeGeometryAnalysis}`;
          }
        }
      }

      const res = await fetch('/api/plot-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, plotData: pd !== undefined ? pd : plotData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');

      const assistantMsg: ChatMessage = { role: 'assistant', content: data.message, options: data.options || undefined };
      setMessages(prev => [...prev.filter(m => !m.isTyping), assistantMsg]);

      if (data.shapeSuggestion && data.shapeSuggestion.shapeId) {
        setSuggestedShape(data.shapeSuggestion.shapeId);
      }

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
    <div className="flex flex-col gap-4 w-full h-full min-h-0">

      {/* ── Plot Tracer Canvas ──────────────────────────────────────── */}
      <div className={`flex flex-col bg-slate-900/30 backdrop-blur border border-cyan-500/20 overflow-hidden shrink-0 transition-all ${
        isFullscreen 
          ? 'fixed inset-4 z-[100] rounded-2xl shadow-[0_0_50px_rgba(0,240,255,0.2)]' 
          : 'rounded-xl relative'
      }`}>
        
        <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/15 select-none shrink-0">
          <div className="flex items-center gap-2">
            <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">PLOT TRACER</span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isTracingClosed && polygon.length >= 3 && (
              <button
                onClick={closePlot}
                className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 border border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 cursor-pointer tracking-wider"
              >
                CLOSE PLOT
              </button>
            )}
            {isTracingClosed && plotData && !hasAnalyzed && (
              <button
                onClick={handleAnalyzePlot}
                className="px-2 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-emerald-500/30 to-teal-500/20 border border-emerald-400 text-emerald-300 hover:from-emerald-500/40 cursor-pointer tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.2)]"
              >
                ANALYZE SHAPE
              </button>
            )}
            
            <div className="flex items-center ml-2 border-l border-cyan-500/20 pl-2 gap-1">
              <input 
                type="text" 
                placeholder="W" 
                value={plotInputW}
                onChange={e => setPlotInputW(e.target.value)}
                className="w-10 h-5 bg-black/40 border border-cyan-500/30 text-cyan-400 text-[9px] px-1 focus:outline-none focus:border-cyan-400 text-center rounded"
              />
              <span className="text-cyan-500/50 text-[9px]">×</span>
              <input 
                type="text" 
                placeholder="H" 
                value={plotInputH}
                onChange={e => setPlotInputH(e.target.value)}
                className="w-10 h-5 bg-black/40 border border-cyan-500/30 text-cyan-400 text-[9px] px-1 focus:outline-none focus:border-cyan-400 text-center rounded"
              />
              <button
                onClick={handleSetExactPlot}
                className="px-1.5 py-0.5 ml-1 rounded text-[9px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 cursor-pointer"
              >
                SET
              </button>
            </div>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-cyan-500/70 border border-cyan-500/20 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer transition-colors"
            >
              {isFullscreen ? 'COLLAPSE' : 'FULLSCREEN'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-cyan-500/70 border border-cyan-500/20 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer transition-colors"
            >
              <Upload className="w-3 h-3" /> IMAGE
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
            {!isGridSet ? 'Enter W × H and click SET before tracing.' :
             polygon.length === 0 ? 'Click on grid to trace your plot. Each cell = 10×10 meters.' :
             polygon.length < 3 ? `${polygon.length} point(s). Need at least 3 to close.` :
             `${polygon.length} points. Click near first point (green dot) to close & analyze.`}
          </div>
        )}

        <div className={`flex flex-col relative flex-1 min-h-0 ${isFullscreen ? 'items-center justify-center p-4' : 'items-center justify-center'}`}>
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { setHoverPt(null); setDragMode(null); }}
            onClick={handleCanvasClick}
            className={`cursor-crosshair ${isFullscreen ? 'w-auto h-full max-w-full object-contain bg-black/50 rounded-xl border border-white/10' : 'w-full max-h-[300px] object-contain'}`}
          />
          {bgImage && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded pointer-events-none shadow">
              <span className="text-[8px] font-bold text-cyan-400/80 uppercase">Drag corners to resize • Drag image to shift</span>
            </div>
          )}
        </div>

        {isTracingClosed && plotData && (
          <div className="flex items-center justify-between px-3 py-1.5 text-[9px] font-mono border-t border-white/5">
            <div className="flex items-center gap-3">
              <span className="text-cyan-400/70">PLOT: <strong className="text-cyan-300">{plotData.widthM}m × {plotData.lengthM}m</strong></span>
              <span className="text-cyan-400/70">AREA: <strong className="text-cyan-300">{buildingAreaRef.current ? buildingAreaRef.current.toFixed(1) : plotData.areaM2}m²</strong></span>
              {suggestedShape && (
                <span className="text-amber-400/80 flex items-center gap-1.5">
                  SHAPE: <strong className="text-amber-300">{suggestedShape.replace(/-/g,'·').toUpperCase()}{shapeWasModified ? ' (EDITED)' : ''}</strong>
                  
                  {!isEditingShape ? (
                    <button onClick={enterShapeEditMode} className="ml-2 px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded border border-amber-500/30 transition-colors flex items-center gap-1">
                      <Edit2 className="w-2.5 h-2.5" /> Edit Vertices
                    </button>
                  ) : (
                    <button onClick={exitShapeEditMode} className="ml-2 px-2 py-0.5 bg-green-500/20 hover:bg-green-500/40 text-green-300 rounded border border-green-500/30 transition-colors flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Done Editing
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── AI Chat Panel ───────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 bg-slate-900/30 backdrop-blur border border-cyan-500/20 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/15 select-none shrink-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">ARIA — AI ARCHITECT</span>
          {isLoading && <span className="ml-auto text-[9px] text-amber-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> ANALYZING</span>}
        </div>

        <div className="p-3 flex flex-col gap-3 flex-1 overflow-y-auto no-scrollbar">
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
            <div className="flex flex-col gap-2 bg-black/20 p-2 rounded-lg border border-white/5">
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
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-bold text-cyan-500/60 uppercase tracking-wider shrink-0 mr-1">CUSTOM (METERS):</span>
                <input
                  type="number"
                  value={customW}
                  onChange={(e) => {
                    setCustomW(e.target.value);
                    if (e.target.value && customH) applyCustomRatio(parseFloat(e.target.value), parseFloat(customH));
                  }}
                  className="w-14 bg-black/40 border border-cyan-500/20 focus:border-cyan-400 focus:outline-none rounded px-2 py-1 text-[10px] text-cyan-300 font-mono text-center"
                  placeholder="W"
                />
                <span className="text-cyan-500/50 text-[10px]">×</span>
                <input
                  type="number"
                  value={customH}
                  onChange={(e) => {
                    setCustomH(e.target.value);
                    if (customW && e.target.value) applyCustomRatio(parseFloat(customW), parseFloat(e.target.value));
                  }}
                  className="w-14 bg-black/40 border border-cyan-500/20 focus:border-cyan-400 focus:outline-none rounded px-2 py-1 text-[10px] text-cyan-300 font-mono text-center"
                  placeholder="L"
                />
                {(customW && customH) ? (
                  <span className="text-[9px] font-bold text-emerald-400/90 ml-2 tracking-wider">→ {outputW}×{outputH} px</span>
                ) : (
                  <span className="text-[9px] text-slate-500 ml-1">(Calculates optimal AI pixels)</span>
                )}
              </div>
            </div>

            {/* AI Workflow Pipeline Selector */}
            <div className="flex flex-col gap-1 bg-black/20 p-2 rounded-lg border border-white/5">
              <span className="text-[9px] font-bold text-cyan-500/60 uppercase tracking-wider block">AI PIPELINE:</span>
              <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full bg-black/40 border border-white/10 focus:border-cyan-400 focus:outline-none rounded px-2 py-1.5 text-[11px] text-cyan-400 cursor-pointer"
              >
                <optgroup label="2-Stage Pipelines (Recommended)" className="bg-[#0a0a0f]">
                  <option value="grok-gpt" className="bg-[#0a0a0f] text-cyan-400">Grok → GPT Image 2 (Best)</option>
                  <option value="grok-nano" className="bg-[#0a0a0f] text-cyan-400">Grok → Nano Banana Pro</option>
                  <option value="grok-kontext" className="bg-[#0a0a0f] text-cyan-400">Grok → FLUX Kontext</option>
                  <option value="flux-klein-gpt" className="bg-[#0a0a0f] text-cyan-400">FLUX Klein → GPT Image 2</option>
                  <option value="flux-kontext-gpt" className="bg-[#0a0a0f] text-cyan-400">FLUX Kontext → GPT Image 2</option>
                </optgroup>
                <optgroup label="Single Model" className="bg-[#0a0a0f]">
                  <option value="grok-solo" className="bg-[#0a0a0f] text-cyan-400">Grok Only (Fast)</option>
                  <option value="gpt-solo" className="bg-[#0a0a0f] text-cyan-400">GPT Image 2 Only</option>
                  <option value="flux-klein-solo" className="bg-[#0a0a0f] text-cyan-400">FLUX Klein Only</option>
                  <option value="gemini-solo" className="bg-[#0a0a0f] text-cyan-400">Gemini Only</option>
                </optgroup>
              </select>
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
});

export default ArchitectAdvisorPanel;
