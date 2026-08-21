'use client';

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Send, Loader2, Upload, CheckCircle2, ChevronRight, RotateCcw, MousePointer, Sparkles, Edit2, Check, Search, X, Layers, ChevronDown, Scissors, Tag, Type, Box, LayoutGrid } from 'lucide-react';
import { MASTER_SHAPES_50, ShapeDefinition } from '@/lib/shapeLibrary50';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number; }

export interface ZoneLabel {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface RoomBlock {
  id: string;
  type: 'B' | 'K' | 'L' | 'C' | 'T' | 'BAL';
  label: string; // "B", "K", "L", "C", "T", "BAL"
  x: number;     // canvas px top-left x
  y: number;     // canvas px top-left y
  w: number;     // canvas px width
  h: number;     // canvas px height
  rotation?: number; // rotation in degrees (0, 45, 90, etc.)
}

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
  onGenerateTrigger: (opts: {
    tracerImageBase64?: string;
    canvasW?: number;
    canvasH?: number;
    shapeW?: number;
    shapeH?: number;
    isShapeModified?: boolean;
    hasDividers?: boolean;
    numDividers?: number;
    customLabels?: string[];
    roomBlocks?: Array<{ type: string; label: string; xM: number; yM: number; wM: number; hM: number }>;
    hasRoomSketch?: boolean;
    numRoomSketchLines?: number;
  }) => void;
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

// Finds the optimal rotation angle that yields the MAXIMUM bounding scale in a 1:1 square canvas
function getOptimalScaleRotation(polys: Point[][], targetBox: number = 976): { rotatedPolys: Point[][]; bestAngle: number; scale: number } {
  const allPts = polys.flat();
  if (allPts.length < 3) return { rotatedPolys: polys, bestAngle: 0, scale: 1 };

  const centroid = polygonCentroid(allPts);
  let bestScale = 0;
  let bestAngle = 0;
  let bestPolys = polys;

  // Search across 0 to 360 in 2 degree increments
  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    const testPolys = polys.map(poly => rotateShape(poly, centroid.x, centroid.y, rad));
    const testPts = testPolys.flat();
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < testPts.length; i++) {
      const p = testPts[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = Math.min(targetBox / w, targetBox / h);
    
    if (scale > bestScale) {
      bestScale = scale;
      bestAngle = rad;
      bestPolys = testPolys;
    }
  }

  return { rotatedPolys: bestPolys, bestAngle, scale: bestScale };
}

function getShapePoints(shapeId: string, cx: number, cy: number, w: number, h: number): Point[][] {
  const id = shapeId.toLowerCase().trim();
  
  // 1. Direct ID match in MASTER_SHAPES_50
  const match = MASTER_SHAPES_50.find(s => s.id.toLowerCase() === id);
  if (match) {
    const mainPoly = match.getPolygon(cx, cy, w, h);
    if (match.getHoles) {
      const holes = match.getHoles(cx, cy, w, h);
      return [mainPoly, ...holes];
    }
    return [mainPoly];
  }

  // 2. Exact or fuzzy name / tag / alias match in MASTER_SHAPES_50
  const fuzzyMatch = MASTER_SHAPES_50.find(s => 
    s.name.toLowerCase().includes(id) || 
    id.includes(s.id.toLowerCase()) || 
    s.tags.some(t => t.toLowerCase().includes(id) || id.includes(t.toLowerCase())) ||
    (id.includes('batman') && s.id === 'batman-insignia') ||
    (id.includes('droplet') && s.id === 'water-droplet') ||
    (id.includes('leaf') && s.id === 'botanical-leaf') ||
    (id.includes('lotus') && s.id === 'lotus-blossom') ||
    (id.includes('l-shape') && s.id === 'stepped-l') ||
    (id.includes('hex') && s.id === 'hexagonal') ||
    (id.includes('cross') && s.id === 'greek-cross')
  );
  if (fuzzyMatch) {
    const mainPoly = fuzzyMatch.getPolygon(cx, cy, w, h);
    if (fuzzyMatch.getHoles) {
      const holes = fuzzyMatch.getHoles(cx, cy, w, h);
      return [mainPoly, ...holes];
    }
    return [mainPoly];
  }

  // 3. Fallback standard rectangular
  const hw = w / 2, hh = h / 2;
  return [[{ x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }]];
}

// ─── Main Component ───────────────────────────────────────────────────────────
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

  // Deterministic calculation of auto-fitted, rotated shape polygons inside plot setbacks
  const getAutoFittedShapePolygons = useCallback((shapeId: string, plot: Point[]): { polygons: Point[][]; areaM2: number; cx: number; cy: number } => {
    if (plot.length < 3) {
      const defaultPolys = getShapePoints(shapeId, canvasW / 2, canvasH / 2, 400, 400);
      let area = 0;
      defaultPolys.forEach(pts => { area += polygonAreaM2(pts); });
      return { polygons: defaultPolys, areaM2: area, cx: canvasW / 2, cy: canvasH / 2 };
    }

    const bbox = polygonBBox(plot);
    let bestArea = 0;
    let bestScale = 0.15;
    let bestCx = polygonCentroid(plot).x;
    let bestCy = polygonCentroid(plot).y;
    let bestAngle = 0;
    
    // Strict 1:1 proportional scaling — zero stretching or squeezing
    const baseSize = Math.max(bbox.w, bbox.h) * 0.90;
    
    const stepsX = 15;
    const stepsY = 15;
    for (let ix = 1; ix < stepsX; ix++) {
      for (let iy = 1; iy < stepsY; iy++) {
        const testCx = bbox.minX + (bbox.w * ix) / stepsX;
        const testCy = bbox.minY + (bbox.h * iy) / stepsY;
        if (!isPointInPolygon({ x: testCx, y: testCy }, plot)) continue;
        
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
          const minRequiredScale = Math.sqrt(bestArea);
          if (minRequiredScale >= 1.0) continue;
          
          let localMaxScale = 0;
          for (let scale = 1.0; scale > minRequiredScale; scale -= 0.02) {
            const testShapes = getShapePoints(shapeId, testCx, testCy, baseSize * scale, baseSize * scale);
            let allInside = true;
            for (const pts of testShapes) {
              const rotatedPts = rotateShape(pts, testCx, testCy, angle);
              const outlinePts = generateShapeOutlinePoints(rotatedPts, 6);
              for (const pt of outlinePts) {
                if (!isPointInPolygon(pt, plot)) { allInside = false; break; }
              }
              if (!allInside) break;
            }
            if (allInside) { localMaxScale = scale; break; }
          }
          const localArea = localMaxScale * localMaxScale;
          if (localArea > bestArea) {
            bestArea = localArea; bestScale = localMaxScale; bestCx = testCx; bestCy = testCy; bestAngle = angle;
          }
        }
      }
    }
    
    const finalScale = bestScale * 0.92;
    const finalSize = baseSize * finalScale;
    
    let shapePolygons = getShapePoints(shapeId, bestCx, bestCy, finalSize, finalSize);
    shapePolygons = shapePolygons.map(pts => rotateShape(pts, bestCx, bestCy, bestAngle));
    
    let totalArea = 0;
    shapePolygons.forEach(pts => { totalArea += polygonAreaM2(pts); });

    return { polygons: shapePolygons, areaM2: totalArea, cx: bestCx, cy: bestCy };
  }, [canvasW, canvasH, polygonAreaM2]);

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

  // ── Custom Footprint Drawing State ──────────────────────────────────────────
  const [isDrawingCustomFootprint, setIsDrawingCustomFootprint] = useState(false);
  const [customFootprintPts, setCustomFootprintPts] = useState<Point[]>([]);
  
  // ── 50-Shape Selector Modal / Dropdown State ──────────────────────────────
  const [isShapePickerOpen, setIsShapePickerOpen] = useState(false);
  const [shapePickerCategory, setShapePickerCategory] = useState<'all' | 'architectural' | 'geometric' | 'biophilic'>('all');
  const [shapePickerSearch, setShapePickerSearch] = useState('');

  // Escape key closes modals and exits fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isShapePickerOpen) {
          setIsShapePickerOpen(false);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShapePickerOpen, isFullscreen]);

  const filteredShapes = MASTER_SHAPES_50
    .filter(s => shapePickerCategory === 'all' || s.category === shapePickerCategory)
    .filter(s => {
      if (!shapePickerSearch.trim()) return true;
      const q = shapePickerSearch.toLowerCase().trim();
      return (
        s.name.toLowerCase().includes(q) ||
        s.inspiration.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q))
      );
    });

  // ── Shape Vertex Editing State ────────────────────────────────────────────
  const [isEditingShape, setIsEditingShape] = useState(false);
  const [editablePolygons, setEditablePolygons] = useState<Point[][] | null>(null);
  const [shapeDragIdx, setShapeDragIdx] = useState<{ polyIdx: number; ptIdx: number } | null>(null);
  const [isDraggingWholeShape, setIsDraggingWholeShape] = useState(false);
  const [shapeDragStart, setShapeDragStart] = useState<Point | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ polyIdx: number; edgeIdx: number; insertPt: Point } | null>(null);
  const [isRotatingShape, setIsRotatingShape] = useState(false);
  const [shapeRotationAngle, setShapeRotationAngle] = useState(0);
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  const [shapeWasModified, setShapeWasModified] = useState(false);
  const [shapeGeometryAnalysis, setShapeGeometryAnalysis] = useState<string | null>(null);

  // ── Live Partition Divider State ───────────────────────────────────────────
  const [isDividingMode, setIsDividingMode] = useState(false);
  const [dividerLines, setDividerLines] = useState<Array<{ p1: Point; p2: Point }>>([]);
  const [activeDividerStart, setActiveDividerStart] = useState<Point | null>(null);

  // ── Room Sketch Mode (freeform room partition lines for rough sketch → CAD workflow) ──
  const [isRoomSketchMode, setIsRoomSketchMode] = useState(false);
  const [roomSketchLines, setRoomSketchLines] = useState<Array<{ p1: Point; p2: Point }>>([]);
  const [activeRoomSketchStart, setActiveRoomSketchStart] = useState<Point | null>(null);

  // ── Zone Text Labeling State (F1, F2, F3, etc.) ───────────────────────────
  const [isLabelingMode, setIsLabelingMode] = useState(false);
  const [zoneLabels, setZoneLabels] = useState<ZoneLabel[]>([]);
  const [selectedLabelText, setSelectedLabelText] = useState<string>('F1');
  const [labelDragId, setLabelDragId] = useState<string | null>(null);

  // ── Interactive Room Block Overlay State (B, K, L, C, T, BAL) ─────────────
  const [isRoomBlockMode, setIsRoomBlockMode] = useState(false);
  const [roomBlocks, setRoomBlocks] = useState<RoomBlock[]>([]);
  const [selectedBlockType, setSelectedBlockType] = useState<'B' | 'K' | 'L' | 'C' | 'T' | 'BAL'>('L');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [blockDragState, setBlockDragState] = useState<{
    id: string;
    mode: 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'e' | 's' | 'rotate';
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initW: number;
    initH: number;
    initRot: number;
    centerX: number;
    centerY: number;
    startAngle: number;
  } | null>(null);

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
  // Automatically rotates the shape to achieve MAXIMUM scaling inside 1:1 square canvas (1024x1024)
  const exportForAI = useCallback((): string | null => {
    // Determine active polygons and bounding box
    let activePolys: Point[][];
    if (suggestedShape) {
      if (editablePolygons && editablePolygons.length > 0) {
        activePolys = editablePolygons;
      } else if (finalShapePolygonsRef.current && finalShapePolygonsRef.current.length > 0) {
        activePolys = finalShapePolygonsRef.current;
      } else {
        const fitted = getAutoFittedShapePolygons(suggestedShape, polygon);
        activePolys = fitted.polygons;
        finalShapePolygonsRef.current = fitted.polygons;
      }
    } else if (polygon.length >= 3 && isTracingClosed) {
      activePolys = [polygon];
    } else {
      return null;
    }

    const allPts = activePolys.flat();
    if (allPts.length < 3) return null;

    const expW = 1024;
    const expH = 1024;
    const padding = 24;
    const targetBox = expW - padding * 2; // 976px

    // 1. If user edited/stretched vertices, PRESERVE their exact custom shape and orientation!
    // If not edited, find optimal rotation to maximize bounding scale in 1:1 canvas.
    let targetPolys = activePolys;
    let scale = 1;

    if (!shapeWasModified) {
      const opt = getOptimalScaleRotation(activePolys, targetBox);
      targetPolys = opt.rotatedPolys;
      scale = opt.scale;
    } else {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      allPts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      const ptsW = Math.max(1, maxX - minX);
      const ptsH = Math.max(1, maxY - minY);
      scale = Math.min(targetBox / ptsW, targetBox / ptsH);
    }

    const targetPts = targetPolys.flat();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    targetPts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const offscreen = document.createElement('canvas');
    offscreen.width = expW;
    offscreen.height = expH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    // 1. Solid BLACK background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, expW, expH);

    // 2. Center the max-scaled shape onto the 1024x1024 canvas
    const offsetX = (expW / 2) - ((minX + maxX) / 2) * scale;
    const offsetY = (expH / 2) - ((minY + maxY) / 2) * scale;

    const scaledPolys = targetPolys.map(poly => poly.map(p => ({
      x: Math.round(p.x * scale + offsetX),
      y: Math.round(p.y * scale + offsetY)
    })));

    // 3. Fill outer polygon with WHITE (AI knows: white = draw floor plan here)
    if (scaledPolys.length > 0 && scaledPolys[0].length >= 3) {
      const outer = scaledPolys[0];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(outer[0].x, outer[0].y);
      for (let i = 1; i < outer.length; i++) {
        ctx.lineTo(outer[i].x, outer[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // 4. Fill any inner void/hole polygons with solid BLACK
      for (let h = 1; h < scaledPolys.length; h++) {
        const hole = scaledPolys[h];
        if (hole.length >= 3) {
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.moveTo(hole[0].x, hole[0].y);
          for (let i = 1; i < hole.length; i++) {
            ctx.lineTo(hole[i].x, hole[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      // 5. Draw room-hint grid boxes inside the outer polygon
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(outer[0].x, outer[0].y);
      for (let i = 1; i < outer.length; i++) {
        ctx.lineTo(outer[i].x, outer[i].y);
      }
      ctx.closePath();
      ctx.clip();

      const gridCellSize = 50;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 0.5;

      for (let gy = 0; gy <= expH; gy += gridCellSize) {
        const rowOffset = (Math.random() - 0.5) * gridCellSize;
        for (let gx = 0; gx <= expW; gx += gridCellSize) {
          const w = gridCellSize * (0.6 + Math.random() * 1.0);
          const h = gridCellSize * (0.6 + Math.random() * 1.0);
          const yScatter = (Math.random() - 0.5) * 10;
          ctx.strokeRect(gx + rowOffset, gy + yScatter, w, h);
        }
      }
      ctx.restore();

      // 6. Draw custom user-drawn divider lines across the white footprint mask in solid black!
      if (dividerLines.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 6.0;
        ctx.lineCap = 'round';
        dividerLines.forEach(line => {
          const sx1 = Math.round(line.p1.x * scale + offsetX);
          const sy1 = Math.round(line.p1.y * scale + offsetY);
          const sx2 = Math.round(line.p2.x * scale + offsetX);
          const sy2 = Math.round(line.p2.y * scale + offsetY);
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        });
        ctx.restore();
      }

      // 6b. Draw user room-sketch lines in ORANGE so AI distinguishes them from flat dividers
      if (roomSketchLines.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 4.0;
        ctx.lineCap = 'round';
        roomSketchLines.forEach(line => {
          const sx1 = Math.round(line.p1.x * scale + offsetX);
          const sy1 = Math.round(line.p1.y * scale + offsetY);
          const sx2 = Math.round(line.p2.x * scale + offsetX);
          const sy2 = Math.round(line.p2.y * scale + offsetY);
          ctx.beginPath();
          ctx.moveTo(sx1, sy1);
          ctx.lineTo(sx2, sy2);
          ctx.stroke();
        });
        ctx.restore();
      }

      // 7. Draw custom user zone labels (F1, F2, F3, CORE...) in solid black on mask!
      if (zoneLabels.length > 0) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        zoneLabels.forEach(lbl => {
          const sx = Math.round(lbl.x * scale + offsetX);
          const sy = Math.round(lbl.y * scale + offsetY);
          ctx.fillText(lbl.text, sx, sy);
        });
        ctx.restore();
      }

      // 8. Draw custom user-placed room blocks (B, K, L, C, T, BAL) in solid black on mask!
      if (roomBlocks.length > 0) {
        roomBlocks.forEach(blk => {
          ctx.save();
          const cx = Math.round((blk.x + blk.w / 2) * scale + offsetX);
          const cy = Math.round((blk.y + blk.h / 2) * scale + offsetY);
          const sw = Math.round(blk.w * scale);
          const sh = Math.round(blk.h * scale);
          const rad = (((blk.rotation || 0) * Math.PI) / 180);

          ctx.translate(cx, cy);
          if (rad !== 0) ctx.rotate(rad);

          // Draw thick room rectangle boundary
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4.0;
          ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);

          // Draw room label (B, K, L, C, T, BAL) inside room box
          ctx.fillStyle = '#000000';
          const fontSize = Math.min(28, Math.max(14, Math.floor(Math.min(sw, sh) * 0.45)));
          ctx.font = `bold ${fontSize}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(blk.label, 0, 0);
          ctx.restore();
        });
      }
    }

    // Return full data URL (the API route handles stripping)
    return offscreen.toDataURL('image/png');
  }, [polygon, isTracingClosed, suggestedShape, canvasW, canvasH, dividerLines, zoneLabels, roomBlocks, roomSketchLines]);

  const handleGenerateTrigger = useCallback(() => {
    const base64 = exportForAI();

    // Compute the actual shape bounding box from polygon vertices
    // This tells the API whether the shape is portrait, landscape, or square
    let shapeW: number | undefined;
    let shapeH: number | undefined;
    const activePts = (suggestedShape && finalShapePolygonsRef.current)
      ? finalShapePolygonsRef.current.flat()
      : polygon;
    if (activePts && activePts.length >= 3) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      activePts.forEach((p: Point) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      shapeW = maxX - minX;
      shapeH = maxY - minY;
    }

    onGenerateTrigger({
      tracerImageBase64: base64 || undefined,
      canvasW: outputW,
      canvasH: outputH,
      shapeW,
      shapeH,
      isShapeModified: shapeWasModified,
      hasDividers: dividerLines.length > 0,
      numDividers: dividerLines.length,
      customLabels: zoneLabels.map(l => l.text),
      roomBlocks: roomBlocks.map(b => ({
        type: b.type,
        label: b.label,
        xM: pxToM(b.x),
        yM: pxToM(b.y),
        wM: pxToM(b.w),
        hM: pxToM(b.h),
      })),
      hasRoomSketch: roomSketchLines.length > 0,
      numRoomSketchLines: roomSketchLines.length,
    });
  }, [exportForAI, onGenerateTrigger, outputW, outputH, shapeWasModified, polygon, suggestedShape, dividerLines, zoneLabels, roomBlocks, pxToM, roomSketchLines]);

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

        // Draw in-progress custom footprint polygon
        if (isDrawingCustomFootprint && customFootprintPts.length > 0) {
          ctx.save();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(customFootprintPts[0].x, customFootprintPts[0].y);
          customFootprintPts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          if (hoverPt) ctx.lineTo(hoverPt.x, hoverPt.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw vertex handles
          customFootprintPts.forEach((pt, idx) => {
            ctx.fillStyle = idx === 0 ? '#10b981' : '#00f0ff';
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, idx === 0 ? 7 : 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          });
          ctx.restore();
        }

        // Suggested shape overlay
        if (suggestedShape) {
          let shapePolygons: Point[][] = [];
          let textCx = 0;
          let textCy = 0;
          
          if (!shapeWasModified) {
            if (!finalShapePolygonsRef.current || finalShapePolygonsRef.current.length === 0) {
              const fitted = getAutoFittedShapePolygons(suggestedShape, polygon);
              finalShapePolygonsRef.current = fitted.polygons;
              buildingAreaRef.current = fitted.areaM2;
            }
            shapePolygons = finalShapePolygonsRef.current || [];
            if (shapePolygons.length > 0) {
              const centroid = getShapeCentroid(shapePolygons);
              textCx = centroid.x;
              textCy = centroid.y;
            }
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
          ctx.fillText(suggestedShape === 'custom-footprint' ? 'CUSTOM FOOTPRINT' : 'BUILDING SHAPE', textCx, textCy);
          ctx.textAlign = 'left';
          
          ctx.restore();
          
          // ── Shape Editing Overlay ───────────────────────────────────────
          if (isEditingShape && editablePolygons) {
            // Draw the editable shape (overrides the static one)
            editablePolygons.forEach(shapePts => {
              if (shapePts.length < 3) return;
              ctx.fillStyle = 'rgba(255, 120, 0, 0.35)';
              ctx.strokeStyle = '#FF7A00';
              ctx.lineWidth = 3.0;
              ctx.beginPath();
              ctx.moveTo(shapePts[0].x, shapePts[0].y);
              shapePts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            });
            
            // Draw vertex handles (large, crisp, glowing)
            editablePolygons.forEach((shapePts, pi) => {
              shapePts.forEach((pt, vi) => {
                const isSelected = shapeDragIdx?.polyIdx === pi && shapeDragIdx?.ptIdx === vi;
                
                ctx.save();
                ctx.shadowColor = isSelected ? '#00f0ff' : '#FF6B00';
                ctx.shadowBlur = isSelected ? 12 : 8;
                
                ctx.fillStyle = isSelected ? '#00f0ff' : '#FF7A00';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, isSelected ? 10 : 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // Inner white center dot
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.restore();
              });
            });
            
            // Draw hovered edge insert point with clear "+" badge
            if (hoveredEdge) {
              ctx.save();
              ctx.shadowColor = '#00ff88';
              ctx.shadowBlur = 10;
              
              ctx.fillStyle = '#00ff88';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.arc(hoveredEdge.insertPt.x, hoveredEdge.insertPt.y, 9, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              
              // Plus symbol
              ctx.fillStyle = '#000000';
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText('+', hoveredEdge.insertPt.x, hoveredEdge.insertPt.y);
              
              // Tooltip badge
              ctx.fillStyle = 'rgba(0,0,0,0.85)';
              ctx.fillRect(hoveredEdge.insertPt.x - 45, hoveredEdge.insertPt.y - 28, 90, 18);
              ctx.strokeStyle = '#00ff88';
              ctx.lineWidth = 1;
              ctx.strokeRect(hoveredEdge.insertPt.x - 45, hoveredEdge.insertPt.y - 28, 90, 18);
              
              ctx.fillStyle = '#00ff88';
              ctx.font = 'bold 8px sans-serif';
              ctx.fillText('CLICK TO ADD VERTEX', hoveredEdge.insertPt.x, hoveredEdge.insertPt.y - 19);
              
              ctx.restore();
            }
            
            // Draw rotation handle
            const centroid = getShapeCentroid(editablePolygons);
            const rotHandleY = centroid.y - 55;
            
            // Dashed line from centroid to rotation handle
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(centroid.x, centroid.y);
            ctx.lineTo(centroid.x, rotHandleY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Rotation circle
            ctx.save();
            ctx.shadowColor = '#a855f7';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#a855f7';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(centroid.x, rotHandleY, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Rotation icon (↻)
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('↻', centroid.x, rotHandleY);
            ctx.restore();
            
            // Real-time area display and controls badge
            let editArea = 0;
            editablePolygons.forEach(pts => { editArea += polygonAreaM2(pts); });
            
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.strokeStyle = 'rgba(255, 122, 0, 0.6)';
            ctx.lineWidth = 1;
            ctx.fillRect(centroid.x - 70, centroid.y - 14, 140, 28);
            ctx.strokeRect(centroid.x - 70, centroid.y - 14, 140, 28);
            
            ctx.fillStyle = '#FF9D00';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${editArea.toFixed(0)} m²`, centroid.x, centroid.y - 3);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.font = '8px sans-serif';
            ctx.fillText('Drag body to move • Right-click vertex to delete', centroid.x, centroid.y + 8);
            ctx.restore();
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

        // ── Render User-Drawn Divider Partition Lines ──────────────────────────
        if (dividerLines.length > 0) {
          dividerLines.forEach((line, idx) => {
            ctx.save();
            // Outer cyan/amber glow
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(line.p1.x, line.p1.y);
            ctx.lineTo(line.p2.x, line.p2.y);
            ctx.stroke();

            // Inner gold structural wall line
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            ctx.moveTo(line.p1.x, line.p1.y);
            ctx.lineTo(line.p2.x, line.p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Terminal dots
            [line.p1, line.p2].forEach(p => {
              ctx.fillStyle = '#00f0ff';
              ctx.beginPath();
              ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            });

            // Cut Tag badge at midpoint
            const midX = (line.p1.x + line.p2.x) / 2;
            const midY = (line.p1.y + line.p2.y) / 2;
            const distM = pxToM(Math.hypot(line.p2.x - line.p1.x, line.p2.y - line.p1.y));
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(midX - 32, midY - 10, 64, 20);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1;
            ctx.strokeRect(midX - 32, midY - 10, 64, 20);

            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`CUT #${idx + 1} (${distM}m)`, midX, midY);
            ctx.restore();
          });
        }

        // ── Render Room Sketch Lines (orange — rough interior room partitions) ────
        if (roomSketchLines.length > 0) {
          roomSketchLines.forEach((line, idx) => {
            ctx.save();
            // Outer orange glow
            ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(line.p1.x, line.p1.y);
            ctx.lineTo(line.p2.x, line.p2.y);
            ctx.stroke();

            // Inner orange room wall line
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(line.p1.x, line.p1.y);
            ctx.lineTo(line.p2.x, line.p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Terminal dots
            [line.p1, line.p2].forEach(p => {
              ctx.fillStyle = '#f97316';
              ctx.beginPath();
              ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            });

            // Room sketch tag badge at midpoint
            const midX = (line.p1.x + line.p2.x) / 2;
            const midY = (line.p1.y + line.p2.y) / 2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(midX - 38, midY - 10, 76, 20);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1;
            ctx.strokeRect(midX - 38, midY - 10, 76, 20);
            ctx.fillStyle = '#fb923c';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`ROOM WALL #${idx + 1}`, midX, midY);
            ctx.restore();
          });
        }

        // ── In-progress Room Sketch Laser Line ─────────────────────────────────
        if (isRoomSketchMode && activeRoomSketchStart && hoverPt) {
          ctx.save();
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(activeRoomSketchStart.x, activeRoomSketchStart.y);
          ctx.lineTo(hoverPt.x, hoverPt.y);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(activeRoomSketchStart.x, activeRoomSketchStart.y, 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(hoverPt.x, hoverPt.y, 6, 0, Math.PI * 2);
          ctx.fill();

          const curLenM = pxToM(Math.hypot(hoverPt.x - activeRoomSketchStart.x, hoverPt.y - activeRoomSketchStart.y));
          const midX = (activeRoomSketchStart.x + hoverPt.x) / 2;
          const midY = (activeRoomSketchStart.y + hoverPt.y) / 2;
          ctx.fillStyle = 'rgba(0,0,0,0.9)';
          ctx.fillRect(midX - 26, midY - 12, 52, 18);
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - 26, midY - 12, 52, 18);
          ctx.fillStyle = '#fb923c';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${curLenM}m`, midX, midY - 3);
          ctx.restore();
        }

        // In-progress Divider Laser Line
        if (isDividingMode && activeDividerStart && hoverPt) {
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.moveTo(activeDividerStart.x, activeDividerStart.y);
          ctx.lineTo(hoverPt.x, hoverPt.y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Start node
          ctx.fillStyle = '#10b981';
          ctx.beginPath();
          ctx.arc(activeDividerStart.x, activeDividerStart.y, 6, 0, Math.PI * 2);
          ctx.fill();

          // End node
          ctx.fillStyle = '#00f0ff';
          ctx.beginPath();
          ctx.arc(hoverPt.x, hoverPt.y, 6, 0, Math.PI * 2);
          ctx.fill();

          // Live length readout
          const curLenM = pxToM(Math.hypot(hoverPt.x - activeDividerStart.x, hoverPt.y - activeDividerStart.y));
          const midX = (activeDividerStart.x + hoverPt.x) / 2;
          const midY = (activeDividerStart.y + hoverPt.y) / 2;
          ctx.fillStyle = 'rgba(0,0,0,0.9)';
          ctx.fillRect(midX - 26, midY - 12, 52, 18);
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - 26, midY - 12, 52, 18);

          ctx.fillStyle = '#00f0ff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${curLenM}m`, midX, midY - 3);
          ctx.restore();
        }

        // ── Render Zone Text Labels (F1, F2, F3, etc.) ─────────────────────────
        if (zoneLabels.length > 0) {
          zoneLabels.forEach((lbl) => {
            ctx.save();
            const isBeingDragged = labelDragId === lbl.id;
            const text = lbl.text;
            const labelW = Math.max(36, text.length * 10 + 16);
            const labelH = 22;

            // Background pill with cyan/emerald glow
            ctx.shadowColor = isBeingDragged ? '#10b981' : '#00f0ff';
            ctx.shadowBlur = isBeingDragged ? 14 : 8;
            ctx.fillStyle = isBeingDragged ? 'rgba(6, 78, 59, 0.95)' : 'rgba(8, 15, 30, 0.9)';
            ctx.strokeStyle = isBeingDragged ? '#10b981' : 'rgba(0, 240, 255, 0.9)';
            ctx.lineWidth = 1.5;

            // Rounded rectangle pill
            const rx = lbl.x - labelW / 2;
            const ry = lbl.y - labelH / 2;
            const radius = 6;
            ctx.beginPath();
            ctx.moveTo(rx + radius, ry);
            ctx.lineTo(rx + labelW - radius, ry);
            ctx.quadraticCurveTo(rx + labelW, ry, rx + labelW, ry + radius);
            ctx.lineTo(rx + labelW, ry + labelH - radius);
            ctx.quadraticCurveTo(rx + labelW, ry + labelH, rx + labelW - radius, ry + labelH);
            ctx.lineTo(rx + radius, ry + labelH);
            ctx.quadraticCurveTo(rx, ry + labelH, rx, ry + labelH - radius);
            ctx.lineTo(rx, ry + radius);
            ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Label text
            ctx.shadowBlur = 0;
            ctx.fillStyle = isBeingDragged ? '#a7f3d0' : '#ffffff';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, lbl.x, lbl.y);

            // Anchor point dot
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.arc(lbl.x, lbl.y + labelH / 2 + 3, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        }

        // In-progress Label Placement Ghost Preview
        if (isLabelingMode && hoverPt && !labelDragId) {
          ctx.save();
          const text = selectedLabelText;
          const labelW = Math.max(36, text.length * 10 + 16);
          const labelH = 22;

          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 2]);

          const rx = hoverPt.x - labelW / 2;
          const ry = hoverPt.y - labelH / 2;
          const radius = 6;
          ctx.beginPath();
          ctx.moveTo(rx + radius, ry);
          ctx.lineTo(rx + labelW - radius, ry);
          ctx.quadraticCurveTo(rx + labelW, ry, rx + labelW, ry + radius);
          ctx.lineTo(rx + labelW, ry + labelH - radius);
          ctx.quadraticCurveTo(rx + labelW, ry + labelH, rx + labelW - radius, ry + labelH);
          ctx.lineTo(rx + radius, ry + labelH);
          ctx.quadraticCurveTo(rx, ry + labelH, rx, ry + labelH - radius);
          ctx.lineTo(rx, ry + radius);
          ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#00f0ff';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`+ ${text}`, hoverPt.x, hoverPt.y);
          ctx.restore();
        }

        // ── Render Interactive Room Blocks (B, K, L, C, T, BAL) ───────────────
        if (roomBlocks.length > 0) {
          roomBlocks.forEach(blk => {
            ctx.save();
            const isSelected = activeBlockId === blk.id;
            const cx = blk.x + blk.w / 2;
            const cy = blk.y + blk.h / 2;
            const rad = (((blk.rotation || 0) * Math.PI) / 180);

            ctx.translate(cx, cy);
            if (rad !== 0) ctx.rotate(rad);

            // Room palette configuration
            let fillStyle = 'rgba(16, 185, 129, 0.3)'; // L: Emerald
            let strokeStyle = '#10b981';
            if (blk.type === 'B') {
              fillStyle = 'rgba(59, 130, 246, 0.35)'; strokeStyle = '#3b82f6';
            } else if (blk.type === 'K') {
              fillStyle = 'rgba(249, 115, 22, 0.35)'; strokeStyle = '#f97316';
            } else if (blk.type === 'C') {
              fillStyle = 'rgba(234, 179, 8, 0.35)'; strokeStyle = '#eab308';
            } else if (blk.type === 'T') {
              fillStyle = 'rgba(168, 85, 247, 0.35)'; strokeStyle = '#a855f7';
            } else if (blk.type === 'BAL') {
              fillStyle = 'rgba(6, 182, 212, 0.35)'; strokeStyle = '#06b6d4';
            }

            // Outer box fill
            ctx.fillStyle = fillStyle;
            ctx.fillRect(-blk.w / 2, -blk.h / 2, blk.w, blk.h);

            // Border stroke
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = isSelected ? 2.5 : 1.5;
            ctx.setLineDash(blk.type === 'C' ? [6, 3] : []);
            ctx.strokeRect(-blk.w / 2, -blk.h / 2, blk.w, blk.h);
            ctx.setLineDash([]);

            // Dimensions in meters
            const wM = pxToM(blk.w);
            const hM = pxToM(blk.h);

            // Centered room label badge
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(blk.label, 0, -4);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.font = 'bold 8px monospace';
            const rotBadge = blk.rotation ? ` • ${Math.round(blk.rotation)}°` : '';
            ctx.fillText(`${wM}m × ${hM}m${rotBadge}`, 0, 7);

            // Corner resize & rotation handles if in room block mode
            if (isRoomBlockMode) {
              const handleR = 3.5;
              ctx.fillStyle = isSelected ? '#ffffff' : strokeStyle;
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 1;

              const halfW = blk.w / 2;
              const halfH = blk.h / 2;

              const corners = [
                { x: -halfW, y: -halfH },
                { x: halfW, y: -halfH },
                { x: halfW, y: halfH },
                { x: -halfW, y: halfH },
              ];
              corners.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, handleR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
              });

              // Top Rotation Stem & Lever Handle
              const rotHandleY = -halfH - 20;
              ctx.strokeStyle = isSelected ? '#00f0ff' : 'rgba(255, 255, 255, 0.6)';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(0, -halfH);
              ctx.lineTo(0, rotHandleY);
              ctx.stroke();

              // Rotation Knob
              ctx.fillStyle = isSelected ? '#00f0ff' : '#a855f7';
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(0, rotHandleY, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
            ctx.restore();
          });
        }

        // In-progress Room Block Placement Ghost Preview
        if (isRoomBlockMode && hoverPt && !blockDragState) {
          ctx.save();
          let defWM = 4.5, defHM = 3.5;
          let previewColor = '#10b981';
          if (selectedBlockType === 'L') { defWM = 6.0; defHM = 3.8; previewColor = '#10b981'; }
          else if (selectedBlockType === 'C') { defWM = 8.0; defHM = 1.6; previewColor = '#eab308'; }
          else if (selectedBlockType === 'K') { defWM = 3.6; defHM = 2.8; previewColor = '#f97316'; }
          else if (selectedBlockType === 'B') { defWM = 4.5; defHM = 3.5; previewColor = '#3b82f6'; }
          else if (selectedBlockType === 'T') { defWM = 2.4; defHM = 1.8; previewColor = '#a855f7'; }
          else if (selectedBlockType === 'BAL') { defWM = 4.5; defHM = 1.6; previewColor = '#06b6d4'; }

          const defWPx = Math.round((defWM / CELL_M) * cellPx);
          const defHPx = Math.round((defHM / CELL_M) * cellPx);
          const gx = Math.round(hoverPt.x - defWPx / 2);
          const gy = Math.round(hoverPt.y - defHPx / 2);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.fillRect(gx, gy, defWPx, defHPx);
          ctx.strokeStyle = previewColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(gx, gy, defWPx, defHPx);
          ctx.setLineDash([]);

          ctx.fillStyle = previewColor;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`+ ${selectedBlockType} (${defWM}m × ${defHM}m)`, hoverPt.x, hoverPt.y);
          ctx.restore();
        }

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
      ctx.fillText(`${pxToM(hoverPt.x)}m, ${pxToM(hoverPt.y)}m`, hoverPt.x + 6, hoverPt.y - 3);
    }
  }, [polygon, hoverPt, isTracingClosed, bgImage, imgBounds, suggestedShape, canvasW, canvasH, cellPx, pxToM, isEditingShape, editablePolygons, hoveredEdge, shapeDragIdx, isRotatingShape, isDraggingWholeShape, shapeWasModified, isDividingMode, dividerLines, activeDividerStart, isLabelingMode, zoneLabels, selectedLabelText, labelDragId, isRoomBlockMode, roomBlocks, selectedBlockType, activeBlockId, blockDragState, isRoomSketchMode, roomSketchLines, activeRoomSketchStart]);

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

  const getCanvasCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const elemW = rect.width;
    const elemH = rect.height;

    // Calculate actual rendered canvas box under CSS object-contain
    const canvasAspect = canvasW / canvasH;
    const elemAspect = elemW / elemH;

    let renderW = elemW;
    let renderH = elemH;
    let offsetX = 0;
    let offsetY = 0;

    if (elemAspect > canvasAspect) {
      // Letterboxed horizontally (black bars on left/right)
      renderW = elemH * canvasAspect;
      offsetX = (elemW - renderW) / 2;
    } else {
      // Letterboxed vertically (black bars on top/bottom)
      renderH = elemW / canvasAspect;
      offsetY = (elemH - renderH) / 2;
    }

    const clientX = e.clientX - rect.left - offsetX;
    const clientY = e.clientY - rect.top - offsetY;

    const x = Math.max(0, Math.min(canvasW, (clientX / renderW) * canvasW));
    const y = Math.max(0, Math.min(canvasH, (clientY / renderH) * canvasH));

    return { x, y };
  }, [canvasW, canvasH]);

  const snapToGrid = (px: number, py: number): Point => {
    const mPx = cellPx / 10;
    return {
      x: Math.round(px / mPx) * mPx,
      y: Math.round(py / mPx) * mPx,
    };
  };

  const toBlockLocal = useCallback((px: number, py: number, blk: RoomBlock) => {
    const cx = blk.x + blk.w / 2;
    const cy = blk.y + blk.h / 2;
    const rad = (((blk.rotation || 0) * Math.PI) / 180);
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    return {
      localX: dx * cos - dy * sin,
      localY: dx * sin + dy * cos,
      cx,
      cy,
    };
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const raw = getCanvasCoords(e);
    const snapped = snapToGrid(raw.x, raw.y);

    // ── Room Sketch Mode Intercept ────────────────────────────────────────────
    if (isRoomSketchMode) {
      setActiveRoomSketchStart(snapped);
      return;
    }

    // ── Live Dividing Mode Intercept ─────────────────────────────────────────
    if (isDividingMode) {
      setActiveDividerStart(snapped);
      return;
    }

    // ── Zone Labeling Mode Intercept ─────────────────────────────────────────
    if (isLabelingMode) {
      // Check if clicked near an existing label to drag it
      const clickedLabel = zoneLabels.find(lbl => Math.hypot(raw.x - lbl.x, raw.y - lbl.y) <= 22);
      if (clickedLabel) {
        setLabelDragId(clickedLabel.id);
        return;
      }

      // Drop new label at clicked position
      const newLabel: ZoneLabel = {
        id: `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: selectedLabelText,
        x: snapped.x,
        y: snapped.y,
      };
      setZoneLabels(prev => [...prev, newLabel]);

      // Auto-advance F1 -> F2 -> F3 ... or F1 (2BHK) -> F2 (2BHK)
      const matchCompound = selectedLabelText.match(/^F(\d+)\s*\((.+)\)$/i);
      if (matchCompound) {
        setSelectedLabelText(`F${parseInt(matchCompound[1]) + 1} (${matchCompound[2]})`);
      } else {
        const match = selectedLabelText.match(/^F(\d+)$/i);
        if (match) {
          setSelectedLabelText(`F${parseInt(match[1]) + 1}`);
        }
      }
      return;
    }

    // ── Interactive Room Block Mode Intercept (B, K, L, C, T, BAL) ───────────
    if (isRoomBlockMode) {
      const HANDLE_DIST = 14;

      // 1. Check top rotation handle on room blocks
      for (let i = roomBlocks.length - 1; i >= 0; i--) {
        const blk = roomBlocks[i];
        const { localX, localY, cx, cy } = toBlockLocal(raw.x, raw.y, blk);
        const rotHandleY = -blk.h / 2 - 20;
        if (Math.hypot(localX, localY - rotHandleY) <= 14) {
          setActiveBlockId(blk.id);
          setBlockDragState({
            id: blk.id,
            mode: 'rotate',
            startX: raw.x,
            startY: raw.y,
            initX: blk.x,
            initY: blk.y,
            initW: blk.w,
            initH: blk.h,
            initRot: blk.rotation || 0,
            centerX: cx,
            centerY: cy,
            startAngle: Math.atan2(raw.y - cy, raw.x - cx),
          });
          return;
        }
      }

      // 2. Check corner resize handles in rotated local space
      for (let i = roomBlocks.length - 1; i >= 0; i--) {
        const blk = roomBlocks[i];
        const { localX, localY, cx, cy } = toBlockLocal(raw.x, raw.y, blk);
        const halfW = blk.w / 2;
        const halfH = blk.h / 2;

        if (Math.hypot(localX - halfW, localY - halfH) <= HANDLE_DIST) {
          setActiveBlockId(blk.id);
          setBlockDragState({ id: blk.id, mode: 'se', startX: raw.x, startY: raw.y, initX: blk.x, initY: blk.y, initW: blk.w, initH: blk.h, initRot: blk.rotation || 0, centerX: cx, centerY: cy, startAngle: 0 });
          return;
        }
        if (Math.hypot(localX - (-halfW), localY - halfH) <= HANDLE_DIST) {
          setActiveBlockId(blk.id);
          setBlockDragState({ id: blk.id, mode: 'sw', startX: raw.x, startY: raw.y, initX: blk.x, initY: blk.y, initW: blk.w, initH: blk.h, initRot: blk.rotation || 0, centerX: cx, centerY: cy, startAngle: 0 });
          return;
        }
        if (Math.hypot(localX - halfW, localY - (-halfH)) <= HANDLE_DIST) {
          setActiveBlockId(blk.id);
          setBlockDragState({ id: blk.id, mode: 'ne', startX: raw.x, startY: raw.y, initX: blk.x, initY: blk.y, initW: blk.w, initH: blk.h, initRot: blk.rotation || 0, centerX: cx, centerY: cy, startAngle: 0 });
          return;
        }
        if (Math.hypot(localX - (-halfW), localY - (-halfH)) <= HANDLE_DIST) {
          setActiveBlockId(blk.id);
          setBlockDragState({ id: blk.id, mode: 'nw', startX: raw.x, startY: raw.y, initX: blk.x, initY: blk.y, initW: blk.w, initH: blk.h, initRot: blk.rotation || 0, centerX: cx, centerY: cy, startAngle: 0 });
          return;
        }
      }

      // 3. Check clicking inside room block body to move it
      for (let i = roomBlocks.length - 1; i >= 0; i--) {
        const blk = roomBlocks[i];
        const { localX, localY, cx, cy } = toBlockLocal(raw.x, raw.y, blk);
        if (Math.abs(localX) <= blk.w / 2 && Math.abs(localY) <= blk.h / 2) {
          setActiveBlockId(blk.id);
          setBlockDragState({ id: blk.id, mode: 'move', startX: raw.x, startY: raw.y, initX: blk.x, initY: blk.y, initW: blk.w, initH: blk.h, initRot: blk.rotation || 0, centerX: cx, centerY: cy, startAngle: 0 });
          return;
        }
      }

      // 4. Drop new room block at cursor with realistic initial dimensions
      let defWM = 4.5;
      let defHM = 3.5;
      if (selectedBlockType === 'L') { defWM = 6.0; defHM = 3.8; }
      else if (selectedBlockType === 'C') { defWM = 8.0; defHM = 1.6; }
      else if (selectedBlockType === 'K') { defWM = 3.6; defHM = 2.8; }
      else if (selectedBlockType === 'B') { defWM = 4.5; defHM = 3.5; }
      else if (selectedBlockType === 'T') { defWM = 2.4; defHM = 1.8; }
      else if (selectedBlockType === 'BAL') { defWM = 4.5; defHM = 1.6; }

      const defWPx = Math.round((defWM / CELL_M) * cellPx);
      const defHPx = Math.round((defHM / CELL_M) * cellPx);

      const newBlk: RoomBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: selectedBlockType,
        label: selectedBlockType,
        x: Math.round(snapped.x - defWPx / 2),
        y: Math.round(snapped.y - defHPx / 2),
        w: defWPx,
        h: defHPx,
        rotation: 0,
      };

      setRoomBlocks(prev => [...prev, newBlk]);
      setActiveBlockId(newBlk.id);
      return;
    }

    // ── Shape editing intercept ─────────────────────────────────────────────
    if (isEditingShape && editablePolygons && editablePolygons.length > 0) {
      const HANDLE_R = 16;
      
      // 1. Check rotation handle (purple circle above centroid)
      const centroid = getShapeCentroid(editablePolygons);
      const rotHandleY = centroid.y - 55;
      if (Math.hypot(raw.x - centroid.x, raw.y - rotHandleY) <= HANDLE_R + 6) {
        setIsRotatingShape(true);
        setRotationStartAngle(Math.atan2(raw.y - centroid.y, raw.x - centroid.x) - shapeRotationAngle);
        return;
      }

      // 2. Check vertex handles (orange circles)
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

      // 3. Check if clicking on an edge (insert vertex and immediately start dragging it)
      if (hoveredEdge) {
        const { polyIdx, edgeIdx, insertPt } = hoveredEdge;
        const newPolys = editablePolygons.map(p => [...p]);
        newPolys[polyIdx].splice(edgeIdx + 1, 0, { ...insertPt });
        
        setEditablePolygons(newPolys);
        finalShapePolygonsRef.current = newPolys;
        setShapeWasModified(true);
        setShapeDragIdx({ polyIdx, ptIdx: edgeIdx + 1 });
        setShapeDragStart(raw);
        setHoveredEdge(null);
        return;
      }

      // 4. Check clicking inside the shape body (move / shift whole building shape)
      if (editablePolygons[0] && isPointInPolygon(raw, editablePolygons[0])) {
        setIsDraggingWholeShape(true);
        setShapeDragStart(raw);
        return;
      }

      return;
    }


    if (!bgImage || !imgBounds) return;

    const handleRadius = 14;
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
    const raw = getCanvasCoords(e);

    // ── Shape editing intercept ─────────────────────────────────────────────
    if (isEditingShape && editablePolygons && editablePolygons.length > 0) {
      // 1. Handle rotation
      if (isRotatingShape) {
        const centroid = getShapeCentroid(editablePolygons);
        const currentAngle = Math.atan2(raw.y - centroid.y, raw.x - centroid.x);
        const newAngle = currentAngle - rotationStartAngle;
        const deltaAngle = newAngle - shapeRotationAngle;
        
        const rotated = editablePolygons.map(poly =>
          poly.map(p => rotatePoint(p, centroid, deltaAngle))
        );
        
        setEditablePolygons(rotated);
        finalShapePolygonsRef.current = rotated;
        setShapeRotationAngle(newAngle);
        setShapeWasModified(true);
        return;
      }
      
      // 2. Handle vertex dragging / stretching
      if (shapeDragIdx && shapeDragStart) {
        const dx = raw.x - shapeDragStart.x;
        const dy = raw.y - shapeDragStart.y;
        const currentPt = editablePolygons[shapeDragIdx.polyIdx][shapeDragIdx.ptIdx];
        const newPt = {
          x: Math.max(10, Math.min(canvasW - 10, currentPt.x + dx)),
          y: Math.max(10, Math.min(canvasH - 10, currentPt.y + dy)),
        };
        
        const newPolys = editablePolygons.map(poly => poly.map(p => ({ ...p })));
        newPolys[shapeDragIdx.polyIdx][shapeDragIdx.ptIdx] = newPt;
        
        setEditablePolygons(newPolys);
        finalShapePolygonsRef.current = newPolys;
        setShapeDragStart(raw);
        setShapeWasModified(true);
        return;
      }

      // 3. Handle whole shape translation / shifting
      if (isDraggingWholeShape && shapeDragStart) {
        const dx = raw.x - shapeDragStart.x;
        const dy = raw.y - shapeDragStart.y;
        
        const shiftedPolys = editablePolygons.map(poly =>
          poly.map(p => ({
            x: Math.max(10, Math.min(canvasW - 10, p.x + dx)),
            y: Math.max(10, Math.min(canvasH - 10, p.y + dy)),
          }))
        );

        setEditablePolygons(shiftedPolys);
        finalShapePolygonsRef.current = shiftedPolys;
        setShapeDragStart(raw);
        setShapeWasModified(true);
        return;
      }
      
      // 4. Detect edge hover for vertex insertion
      const EDGE_DIST = 16;
      let foundEdge: typeof hoveredEdge = null;
      for (let pi = 0; pi < editablePolygons.length && !foundEdge; pi++) {
        const pts = editablePolygons[pi];
        for (let ei = 0; ei < pts.length; ei++) {
          const a = pts[ei];
          const b = pts[(ei + 1) % pts.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          if (lenSq === 0) continue;
          let t = ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / lenSq;
          t = Math.max(0.08, Math.min(0.92, t));
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
        if (shapeDragIdx || isDraggingWholeShape) canvasRef.current.style.cursor = 'grabbing';
        else if (foundEdge) canvasRef.current.style.cursor = 'crosshair';
        else if (editablePolygons[0] && isPointInPolygon(raw, editablePolygons[0])) canvasRef.current.style.cursor = 'move';
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

    if (isRoomBlockMode) {
      if (blockDragState) {
        const dx = raw.x - blockDragState.startX;
        const dy = raw.y - blockDragState.startY;
        const snapM = cellPx / 10;

        setRoomBlocks(prev => prev.map(blk => {
          if (blk.id !== blockDragState.id) return blk;

          if (blockDragState.mode === 'rotate') {
            const currAngle = Math.atan2(raw.y - blockDragState.centerY, raw.x - blockDragState.centerX);
            const deltaDeg = ((currAngle - blockDragState.startAngle) * 180) / Math.PI;
            let newRot = (blockDragState.initRot + deltaDeg) % 360;
            if (newRot < 0) newRot += 360;

            // Snap to 15° increments when close to standard angles
            if (Math.abs(newRot % 45) < 3.5) newRot = Math.round(newRot / 45) * 45;
            else if (Math.abs(newRot % 15) < 2.5) newRot = Math.round(newRot / 15) * 15;

            return { ...blk, rotation: Math.round(newRot) };
          }

          let { initX, initY, initW, initH, initRot } = blockDragState;

          if (blockDragState.mode === 'move') {
            const nx = Math.round((initX + dx) / snapM) * snapM;
            const ny = Math.round((initY + dy) / snapM) * snapM;
            return { ...blk, x: nx, y: ny };
          } else {
            // Local rotated resize delta
            const rad = ((initRot * Math.PI) / 180);
            const cos = Math.cos(-rad);
            const sin = Math.sin(-rad);
            const localDx = dx * cos - dy * sin;
            const localDy = dx * sin + dy * cos;

            if (blockDragState.mode === 'se') {
              const nw = Math.max(20, Math.round((initW + localDx) / snapM) * snapM);
              const nh = Math.max(16, Math.round((initH + localDy) / snapM) * snapM);
              return { ...blk, w: nw, h: nh };
            } else if (blockDragState.mode === 'sw') {
              const nw = Math.max(20, Math.round((initW - localDx) / snapM) * snapM);
              const nh = Math.max(16, Math.round((initH + localDy) / snapM) * snapM);
              return { ...blk, w: nw, h: nh };
            } else if (blockDragState.mode === 'ne') {
              const nw = Math.max(20, Math.round((initW + localDx) / snapM) * snapM);
              const nh = Math.max(16, Math.round((initH - localDy) / snapM) * snapM);
              return { ...blk, w: nw, h: nh };
            } else if (blockDragState.mode === 'nw') {
              const nw = Math.max(20, Math.round((initW - localDx) / snapM) * snapM);
              const nh = Math.max(16, Math.round((initH - localDy) / snapM) * snapM);
              return { ...blk, w: nw, h: nh };
            }
          }
          return blk;
        }));

        if (canvasRef.current) {
          if (blockDragState.mode === 'rotate') canvasRef.current.style.cursor = 'grab';
          else if (blockDragState.mode === 'move') canvasRef.current.style.cursor = 'grabbing';
          else canvasRef.current.style.cursor = 'nwse-resize';
        }
      } else {
        // Dynamic cursor on hover over rotate handle, corner, or body
        let cursor = 'crosshair';
        for (const blk of roomBlocks) {
          const { localX, localY } = toBlockLocal(raw.x, raw.y, blk);
          const rotHandleY = -blk.h / 2 - 20;
          if (Math.hypot(localX, localY - rotHandleY) <= 14) {
            cursor = 'grab';
            break;
          }
          const halfW = blk.w / 2;
          const halfH = blk.h / 2;
          if (Math.hypot(localX - halfW, localY - halfH) <= 14 || Math.hypot(localX - (-halfW), localY - (-halfH)) <= 14) {
            cursor = 'nwse-resize';
            break;
          }
          if (Math.hypot(localX - (-halfW), localY - halfH) <= 14 || Math.hypot(localX - halfW, localY - (-halfH)) <= 14) {
            cursor = 'nesw-resize';
            break;
          }
          if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
            cursor = 'grab';
            break;
          }
        }
        if (canvasRef.current) canvasRef.current.style.cursor = cursor;
      }
      setHoverPt(snapToGrid(raw.x, raw.y));
      return;
    }

    if (isRoomSketchMode) {
      setHoverPt(snapToGrid(raw.x, raw.y));
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
      return;
    }

    if (isDividingMode) {
      setHoverPt(snapToGrid(raw.x, raw.y));
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
      return;
    }

    if (isLabelingMode) {
      const snapped = snapToGrid(raw.x, raw.y);
      if (labelDragId) {
        setZoneLabels(prev => prev.map(l => l.id === labelDragId ? { ...l, x: snapped.x, y: snapped.y } : l));
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      } else {
        const hoverExisting = zoneLabels.some(lbl => Math.hypot(raw.x - lbl.x, raw.y - lbl.y) <= 22);
        if (canvasRef.current) canvasRef.current.style.cursor = hoverExisting ? 'grab' : 'cell';
      }
      setHoverPt(snapped);
      return;
    }

    setHoverPt(snapToGrid(raw.x, raw.y));
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRoomBlockMode) {
      setBlockDragState(null);
      return;
    }

    // ── Room Sketch Mode Mouse Up ─────────────────────────────────────────────
    if (isRoomSketchMode && activeRoomSketchStart) {
      const raw = getCanvasCoords(e);
      const snapped = snapToGrid(raw.x, raw.y);
      if (Math.hypot(snapped.x - activeRoomSketchStart.x, snapped.y - activeRoomSketchStart.y) > 12) {
        setRoomSketchLines(prev => [...prev, { p1: activeRoomSketchStart, p2: snapped }]);
      }
      setActiveRoomSketchStart(null);
      return;
    }

    if (isDividingMode && activeDividerStart) {
      const raw = getCanvasCoords(e);
      const snapped = snapToGrid(raw.x, raw.y);
      if (Math.hypot(snapped.x - activeDividerStart.x, snapped.y - activeDividerStart.y) > 12) {
        setDividerLines(prev => [...prev, { p1: activeDividerStart, p2: snapped }]);
      }
      setActiveDividerStart(null);
      return;
    }

    if (isLabelingMode) {
      setLabelDragId(null);
      return;
    }

    setDragMode(null);
    setDragStartRaw(null);
    setInitialBounds(null);
    // Shape editing
    setShapeDragIdx(null);
    setShapeDragStart(null);
    setIsDraggingWholeShape(false);
    setIsRotatingShape(false);
    if (editablePolygons) {
      finalShapePolygonsRef.current = editablePolygons;
      let editArea = 0;
      editablePolygons.forEach(pts => { editArea += polygonAreaM2(pts); });
      buildingAreaRef.current = editArea;
    }
  };

  const finishCustomFootprint = useCallback(() => {
    if (customFootprintPts.length < 3) return;
    setIsDrawingCustomFootprint(false);
    finalShapePolygonsRef.current = [customFootprintPts];
    setSuggestedShape('custom-footprint');
    setShapeWasModified(true);
    const area = polygonAreaM2(customFootprintPts);
    buildingAreaRef.current = area;
  }, [customFootprintPts, polygonAreaM2]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRoomBlockMode) return; // room block mode uses mouseDown/drag
    if (isDividingMode) return; // divider mode uses mousedown/mouseup drag
    if (isLabelingMode) return; // labeling mode handled via mouseDown
    if (isEditingShape) return; // editing mode handles its own clicks in mouseDown
    if (hasDraggedImg) {
      setHasDraggedImg(false);
      return;
    }
    if (!isGridSet) {
      alert("Please enter the Overall Width and Length and click 'SET' before tracing.");
      return;
    }

    const raw = getCanvasCoords(e);
    const snapped = snapToGrid(raw.x, raw.y);

    if (isDrawingCustomFootprint) {
      if (customFootprintPts.length >= 3) {
        const first = customFootprintPts[0];
        if (Math.hypot(snapped.x - first.x, snapped.y - first.y) < cellPx * 0.8) {
          finishCustomFootprint();
          return;
        }
      }
      setCustomFootprintPts(prev => [...prev, snapped]);
      return;
    }

    if (isTracingClosed) return;

    if (polygon.length >= 3) {
      const first = polygon[0];
      if (Math.hypot(snapped.x - first.x, snapped.y - first.y) < cellPx) {
        closePlot();
        return;
      }
    }
    setPolygon(prev => [...prev, snapped]);
  };

  // Right-click to delete a vertex in shape edit mode or delete a room block
  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isRoomBlockMode) {
      e.preventDefault();
      const raw = getCanvasCoords(e);
      const clickedIdx = roomBlocks.findIndex(blk => {
        const { localX, localY } = toBlockLocal(raw.x, raw.y, blk);
        return Math.abs(localX) <= blk.w / 2 && Math.abs(localY) <= blk.h / 2;
      });
      if (clickedIdx !== -1) {
        setRoomBlocks(prev => prev.filter((_, i) => i !== clickedIdx));
        return;
      }
    }

    if (!isEditingShape || !editablePolygons) return;
    e.preventDefault();
    const raw = getCanvasCoords(e);
    
    const HANDLE_R = 16;
    for (let pi = 0; pi < editablePolygons.length; pi++) {
      for (let vi = 0; vi < editablePolygons[pi].length; vi++) {
        const pt = editablePolygons[pi][vi];
        if (Math.hypot(raw.x - pt.x, raw.y - pt.y) <= HANDLE_R) {
          // Don't allow deleting if polygon would have < 3 vertices
          if (editablePolygons[pi].length <= 3) return;
          const newPolys = editablePolygons.map(poly => [...poly]);
          newPolys[pi].splice(vi, 1);
          setEditablePolygons(newPolys);
          finalShapePolygonsRef.current = newPolys;
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
    setIsDrawingCustomFootprint(false);
    setCustomFootprintPts([]);
    setHasAnalyzed(false);
    setPlotData(null);
    setSuggestedShape(null);
    setAppliedOptionId(null);
    setIsEditingShape(false);
    setEditablePolygons(null);
    setShapeWasModified(false);
    setShapeRotationAngle(0);
    setIsDividingMode(false);
    setDividerLines([]);
    setActiveDividerStart(null);
    setIsLabelingMode(false);
    setZoneLabels([]);
    setSelectedLabelText('F1');
    setLabelDragId(null);
    setIsRoomBlockMode(false);
    setRoomBlocks([]);
    setActiveBlockId(null);
    setBlockDragState(null);
  };

  // ── Shape Editing Functions ─────────────────────────────────────────────────
  const enterShapeEditMode = useCallback(() => {
    let basePolys = finalShapePolygonsRef.current;
    if (!basePolys || basePolys.length === 0) {
      if (suggestedShape) {
        const fitted = getAutoFittedShapePolygons(suggestedShape, polygon);
        basePolys = fitted.polygons;
        finalShapePolygonsRef.current = fitted.polygons;
        buildingAreaRef.current = fitted.areaM2;
      } else if (polygon.length >= 3) {
        basePolys = [polygon];
      }
    }
    if (!basePolys || basePolys.length === 0) return;

    // Deep clone the shape polygons so edits don't affect the original until modified
    const cloned = basePolys.map(poly => poly.map(p => ({ ...p })));
    setEditablePolygons(cloned);
    setIsEditingShape(true);
    setShapeRotationAngle(0);
  }, [suggestedShape, polygon, getAutoFittedShapePolygons]);

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
    if (!editablePolygons || editablePolygons.length === 0) {
      setIsEditingShape(false);
      return;
    }
    
    // Deep clone edited polygons back to ref so they persist indefinitely
    const saved = editablePolygons.map(poly => poly.map(p => ({ ...p })));
    finalShapePolygonsRef.current = saved;
    
    // Recalculate building area
    let totalArea = 0;
    saved.forEach(pts => { totalArea += polygonAreaM2(pts); });
    buildingAreaRef.current = totalArea;
    
    setShapeWasModified(true);
    
    // Compute geometry analysis for chatbot
    const analysis = computeGeometryAnalysis(saved);
    setShapeGeometryAnalysis(analysis);
    
    setIsEditingShape(false);
    setEditablePolygons(null);
    setShapeDragIdx(null);
    setHoveredEdge(null);
    setIsRotatingShape(false);
    setIsDraggingWholeShape(false);
  }, [editablePolygons, polygonAreaM2, computeGeometryAnalysis]);

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

      // User Custom Drawing / Partition Labels Feedback Loop
      if ((zoneLabels.length > 0 || dividerLines.length > 0) && apiMessages.length > 0) {
        const lastMsg = apiMessages[apiMessages.length - 1];
        if (lastMsg.role === 'user') {
          const flatLabelsOnly = zoneLabels.filter(l => l.text.toUpperCase().startsWith('F')).map(l => l.text);
          const totalUnitsCount = flatLabelsOnly.length || zoneLabels.length;
          lastMsg.content += `\n\n[USER DRAWING & LABELS CONTEXT: The user has actively partitioned the building on the canvas with ${dividerLines.length} cut line(s) and placed ${zoneLabels.length} custom label(s): ${zoneLabels.map(l => l.text).join(', ')}. If the user asks to add or configure units according to their labels (e.g. ${totalUnitsCount} units for ${zoneLabels.map(l => l.text).join(', ')}), you MUST honor this exact count (${totalUnitsCount} total units) across your 3 recommended options (distributed logically into 1BHK, 2BHK, 3BHK, 4BHK) so each labeled pod gets a corresponding unit!]`;
        }
      }

      // User Room Blocks Spatial Overlay Context
      if (roomBlocks.length > 0 && apiMessages.length > 0) {
        const lastMsg = apiMessages[apiMessages.length - 1];
        if (lastMsg.role === 'user') {
          const counts: Record<string, number> = {};
          roomBlocks.forEach(b => { counts[b.label] = (counts[b.label] || 0) + 1; });
          const summary = Object.entries(counts).map(([k, v]) => `${v}×${k}`).join(', ');
          lastMsg.content += `\n\n[USER ROOM BLOCKS OVERLAY: The user has placed ${roomBlocks.length} spatial room composition blocks on the floor plan (${summary}) where B=Bedrooms, K=Kitchen, L=Living Room, C=Corridor, T=Toilet, BAL=Balcony. Respect these custom room spatial placements in your analysis and notes!]`;
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

      if (data.shapeSuggestion && data.shapeSuggestion.shapeId && !shapeWasModified) {
        const shapeId = data.shapeSuggestion.shapeId;
        setSuggestedShape(shapeId);
        setShapeWasModified(false);
        setEditablePolygons(null);
        const fitted = getAutoFittedShapePolygons(shapeId, polygon);
        finalShapePolygonsRef.current = fitted.polygons;
        buildingAreaRef.current = fitted.areaM2;
      }

      if (data.options && data.options.length > 0 && !shapeWasModified) {
        const shapeId = data.options[0].footprintShape;
        setSuggestedShape(shapeId);
        setShapeWasModified(false);
        setEditablePolygons(null);
        const fitted = getAutoFittedShapePolygons(shapeId, polygon);
        finalShapePolygonsRef.current = fitted.polygons;
        buildingAreaRef.current = fitted.areaM2;
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
      footprintShape: shapeWasModified ? (suggestedShape || 'custom') : opt.footprintShape,
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

    if (!shapeWasModified) {
      setSuggestedShape(opt.footprintShape);
      setShapeWasModified(false);
      setEditablePolygons(null);
      const fitted = getAutoFittedShapePolygons(opt.footprintShape, polygon);
      finalShapePolygonsRef.current = fitted.polygons;
      buildingAreaRef.current = fitted.areaM2;
    }

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

  const handleSelectShapeFromPicker = (shape: ShapeDefinition) => {
    setSuggestedShape(shape.id);
    setShapeWasModified(false);
    setEditablePolygons(null);
    setIsShapePickerOpen(false);

    // Compute optimal auto-fitted polygons synchronously
    const fitted = getAutoFittedShapePolygons(shape.id, polygon);
    finalShapePolygonsRef.current = fitted.polygons;
    buildingAreaRef.current = fitted.areaM2;

    // Sync with parent floor plan generator form
    const wM = plotData ? Math.round(plotData.widthM * 0.85).toString() : '80';
    const lM = plotData ? Math.round(plotData.lengthM * 0.85).toString() : '80';
    onParamsApplied({
      footprintShape: shape.id,
      overallWidth: wM,
      overallLength: lM,
      units1BHK: 0,
      units2BHK: 2,
      units3BHK: 2,
      units4BHK: 0,
      passengerLifts: 4,
      staircases: 2,
      customPrompt: `Spacious layout inside iconic ${shape.name} tower footprint with attached living room balconies and ample natural light.`
    });

    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `📐 **${shape.name}** placed on the plot!\n- Inspiration: *${shape.inspiration}*\n- Efficiency: **${shape.efficiency}%**\n\nThe footprint has been auto-scaled, rotated, and fitted inside your plot setbacks. How many flats and what mix (1BHK, 2BHK, 3BHK, etc.) would you like to fit on this typical floor?`,
    }]);
  };

  return (
    <div className="flex flex-col gap-4 w-full h-full min-h-0">

      {/* ── 50-Shape Selector Modal Dialog (Top Level, Fixed Centered) ── */}
      {isShapePickerOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-xl p-4 sm:p-6 md:p-10 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-gradient-to-b from-slate-900/98 to-slate-950/98 border border-cyan-500/40 rounded-2xl shadow-[0_0_80px_rgba(0,240,255,0.25)] w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden text-white">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-cyan-950/20 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/50 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
                  <Sparkles className="w-5 h-5 text-cyan-300 animate-pulse" />
                </div>
                <div>
                  <h2 className="text-base font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-cyan-400 uppercase">
                    MASTER SHAPE STUDIO — 50 ARCHITECTURAL FOOTPRINTS
                  </h2>
                  <p className="text-xs text-cyan-400/70">
                    Select an iconic tower, geometric plate, or biophilic footprint to auto-fit inside your plot
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsShapePickerOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-400 text-slate-400 hover:text-red-300 transition-all cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="px-6 py-3.5 border-b border-white/10 bg-black/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Search */}
              <div className="relative flex-1 min-w-[260px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400/60" />
                <input
                  type="text"
                  placeholder="Search 50 shapes (e.g. Batman, Burj Khalifa, Leaf, Water Droplet, Zaha, Hexagon)..."
                  value={shapePickerSearch}
                  onChange={e => setShapePickerSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-900/80 border border-cyan-500/30 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
                  autoFocus
                />
                {shapePickerSearch && (
                  <button
                    onClick={() => setShapePickerSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Tabs */}
              <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-white/10">
                {(['all', 'architectural', 'geometric', 'biophilic'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setShapePickerCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                      shapePickerCategory === cat
                        ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 border border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.25)]'
                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {cat === 'all' && <span>🌐 ALL (50)</span>}
                    {cat === 'architectural' && <span>🏛️ TOWERS (20)</span>}
                    {cat === 'geometric' && <span>📐 GEOMETRIC (15)</span>}
                    {cat === 'biophilic' && <span>🌿 BIOPHILIC (15)</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid of Shapes with Live SVG Previews */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 p-6 overflow-y-auto max-h-[60vh] no-scrollbar">
              {filteredShapes.map(shape => {
                const pts = shape.getPolygon(50, 50, 68, 68);
                const pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const holes = shape.getHoles ? shape.getHoles(50, 50, 68, 68) : [];

                return (
                  <button
                    key={shape.id}
                    onClick={() => handleSelectShapeFromPicker(shape)}
                    className={`flex flex-col p-3.5 rounded-xl border transition-all text-left group cursor-pointer relative overflow-hidden ${
                      suggestedShape === shape.id
                        ? 'bg-gradient-to-b from-cyan-950/60 to-slate-900 border-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.3)] ring-1 ring-cyan-400'
                        : 'bg-slate-900/70 hover:bg-cyan-950/30 border-slate-800 hover:border-cyan-500/60 hover:shadow-[0_0_20px_rgba(0,240,255,0.15)] hover:scale-[1.02]'
                    }`}
                  >
                    {/* Top Row: Category & Efficiency */}
                    <div className="flex items-center justify-between w-full mb-2.5">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                        {shape.category}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {shape.efficiency}% EFF
                      </span>
                    </div>

                    {/* Vector Blueprint SVG Silhouette */}
                    <div className="w-full h-28 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center p-2 mb-3 group-hover:border-cyan-500/40 transition-colors">
                      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                        <polygon
                          points={pointsStr}
                          fill="rgba(0, 240, 255, 0.15)"
                          stroke="#00f0ff"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        {holes.map((hPts, hIdx) => (
                          <polygon
                            key={hIdx}
                            points={hPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                            fill="#070b14"
                            stroke="#00f0ff"
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                          />
                        ))}
                      </svg>
                    </div>

                    {/* Title & Description */}
                    <div className="flex flex-col flex-1">
                      <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1 mb-0.5">
                        {shape.name}
                      </div>
                      <div className="text-[11px] text-cyan-400/80 line-clamp-1 mb-1 font-medium">
                        {shape.inspiration}
                      </div>
                      <div className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                        {shape.description}
                      </div>
                    </div>

                    {/* Selected Pill Indicator */}
                    {suggestedShape === shape.id && (
                      <div className="mt-2.5 pt-2 border-t border-cyan-500/30 flex items-center justify-between text-[10px] text-cyan-300 font-bold">
                        <span>ACTIVE ON CANVAS</span>
                        <Check className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-white/10 bg-slate-950 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span>Showing {filteredShapes.length} of 50 shapes</span>
              <button
                onClick={() => setIsShapePickerOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Plot Tracer Canvas ──────────────────────────────────────── */}
      <div className={`flex flex-col bg-slate-900/30 backdrop-blur border border-cyan-500/20 overflow-hidden shrink-0 transition-all ${
        isFullscreen 
          ? 'fixed inset-0 z-[99990] bg-[#070b14]/98 backdrop-blur-2xl p-4 sm:p-6 flex flex-col shadow-[0_0_80px_rgba(0,240,255,0.3)]' 
          : 'rounded-xl relative'
      }`}>
        
        {/* Tier 1: Main Title, Shape Button & View Controls */}
        <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-cyan-500/15 select-none gap-2 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <MousePointer className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
              {isFullscreen ? 'FULLSCREEN PLOT TRACER & SHAPE ENGINE' : 'PLOT TRACER'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {/* Shape Selector Button */}
            <button
              onClick={() => setIsShapePickerOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold bg-gradient-to-r from-emerald-500/25 to-teal-500/25 border border-emerald-400 text-emerald-200 hover:from-emerald-500/40 hover:to-teal-500/40 cursor-pointer tracking-wider shadow-[0_0_12px_rgba(16,185,129,0.25)] transition-all"
              title="Choose from 50 architectural, geometric & biophilic footprints"
            >
              <Sparkles className="w-3 h-3 text-emerald-300 animate-pulse" />
              <span>📐 SELECT SHAPE (50)</span>
              <ChevronDown className="w-3 h-3 text-emerald-300" />
            </button>

            {/* Custom Footprint Drawing Tool Button */}
            {isTracingClosed && (
              <button
                onClick={() => {
                  if (isDrawingCustomFootprint) {
                    if (customFootprintPts.length >= 3) finishCustomFootprint();
                    else setIsDrawingCustomFootprint(false);
                  } else {
                    setIsDrawingCustomFootprint(true);
                    setCustomFootprintPts([]);
                  }
                }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold border cursor-pointer tracking-wider transition-all ${
                  isDrawingCustomFootprint
                    ? 'bg-gradient-to-r from-cyan-500/40 to-emerald-500/40 border-cyan-300 text-white shadow-[0_0_15px_rgba(0,240,255,0.4)] animate-pulse'
                    : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400'
                }`}
                title="Click vertices directly on the canvas to draw your own custom building shape"
              >
                <span>{isDrawingCustomFootprint ? (customFootprintPts.length >= 3 ? '✓ FINISH FOOTPRINT' : '✕ CANCEL') : '✏️ DRAW FOOTPRINT'}</span>
              </button>
            )}

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border cursor-pointer transition-colors ${
                isFullscreen
                  ? 'bg-red-500/20 border-red-400 text-red-300 hover:bg-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                  : 'text-cyan-400/80 border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 bg-cyan-950/30'
              }`}
            >
              {isFullscreen ? '✕ COLLAPSE (Esc)' : '⛶ FULLSCREEN'}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[9px] text-cyan-400/80 border border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-200 bg-cyan-950/30 cursor-pointer transition-colors"
              title="Upload reference site image"
            >
              <Upload className="w-3 h-3" /> IMAGE
            </button>

            {polygon.length > 0 && (
              <button
                onClick={resetTrace}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[9px] font-bold text-red-400 border border-red-500/40 hover:border-red-400 hover:bg-red-500/20 bg-red-950/30 cursor-pointer transition-all shadow-sm"
                title="Reset plot trace"
              >
                <RotateCcw className="w-3 h-3 text-red-400" /> RESET
              </button>
            )}
          </div>
        </div>

        {/* Tier 2: Dimension Setup, Tracing Guidance & Action Triggers */}
        <div className="flex flex-wrap items-center justify-between px-3 py-1.5 border-b border-cyan-500/10 bg-black/50 text-[9px] gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-400/60 font-semibold uppercase text-[8px]">PLOT DIMENSIONS:</span>
            <input 
              type="text" 
              placeholder="W" 
              value={plotInputW}
              onChange={e => setPlotInputW(e.target.value)}
              className="w-9 h-5 bg-slate-900 border border-cyan-500/40 text-cyan-300 text-[9px] px-1 focus:outline-none focus:border-cyan-300 text-center rounded"
            />
            <span className="text-cyan-500/50 text-[9px]">×</span>
            <input 
              type="text" 
              placeholder="H" 
              value={plotInputH}
              onChange={e => setPlotInputH(e.target.value)}
              className="w-9 h-5 bg-slate-900 border border-cyan-500/40 text-cyan-300 text-[9px] px-1 focus:outline-none focus:border-cyan-300 text-center rounded"
            />
            <button
              onClick={handleSetExactPlot}
              className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 hover:bg-cyan-500/35 cursor-pointer"
            >
              SET
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {!isTracingClosed && (
              <span className="text-cyan-400/70 select-none">
                {!isGridSet ? 'Enter W × H and click SET before tracing.' :
                 polygon.length === 0 ? 'Click on grid to trace plot boundary.' :
                 polygon.length < 3 ? `${polygon.length} pt. Need ≥ 3 to close.` :
                 `${polygon.length} pts. Click green dot to close.`}
              </span>
            )}

            {!isTracingClosed && polygon.length >= 3 && (
              <button
                onClick={closePlot}
                className="px-2.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/25 border border-emerald-400 text-emerald-300 hover:bg-emerald-500/40 cursor-pointer tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.25)]"
              >
                ✓ CLOSE PLOT
              </button>
            )}

            {isTracingClosed && plotData && !hasAnalyzed && (
              <button
                onClick={handleAnalyzePlot}
                className="px-2.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-emerald-500/30 to-teal-500/20 border border-emerald-400 text-emerald-300 hover:from-emerald-500/40 cursor-pointer tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.25)]"
              >
                ⚡ ANALYZE SHAPE
              </button>
            )}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

        <div className={`flex flex-col relative flex-1 min-h-0 ${isFullscreen ? 'items-center justify-center p-4 h-[calc(100vh-140px)]' : 'items-center justify-center'}`}>
          {isDividingMode && (
            <div className="absolute top-2 left-3 right-3 z-30 px-3 py-1.5 bg-black/85 backdrop-blur-md border border-cyan-400/50 rounded-lg flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                  ✂️ LIVE DIVIDE: DRAG ACROSS BUILDING TO DRAW PARTITION WALLS
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  {dividerLines.length} CUTS ({dividerLines.length + 1} FLATS)
                </span>
                {dividerLines.length > 0 && (
                  <button
                    onClick={() => setDividerLines(prev => prev.slice(0, -1))}
                    className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded text-[9px] cursor-pointer"
                  >
                    ↶ Undo Cut
                  </button>
                )}
              </div>
            </div>
          )}

          {isLabelingMode && (
            <div className="absolute top-2 left-3 right-3 z-30 px-3 py-2 bg-black/90 backdrop-blur-md border border-cyan-400/60 rounded-lg flex flex-wrap items-center justify-between shadow-2xl gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                  🏷️ CLICK ON SHAPE TO PLACE:
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-cyan-400/60 font-semibold uppercase">FLATS:</span>
                  {['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedLabelText(tag)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                        selectedLabelText.toUpperCase() === tag
                          ? 'bg-cyan-500 text-black shadow-[0_0_8px_#00f0ff]'
                          : 'bg-slate-800 text-cyan-300 hover:bg-slate-700 border border-cyan-500/30'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 border-l border-white/20 pl-2">
                  <span className="text-[8px] text-amber-400/80 font-semibold uppercase">BHK:</span>
                  {['1BHK', '2BHK', '3BHK', '4BHK', 'CORE'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => setSelectedLabelText(tag)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer ${
                        selectedLabelText.toUpperCase() === tag
                          ? 'bg-amber-400 text-black shadow-[0_0_8px_#f59e0b]'
                          : 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 border border-amber-500/40'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 border-l border-white/20 pl-2">
                  <span className="text-[8px] text-cyan-400/70 font-semibold">CUSTOM:</span>
                  <input
                    type="text"
                    value={selectedLabelText}
                    onChange={e => setSelectedLabelText(e.target.value.toUpperCase())}
                    className="w-14 h-5 bg-slate-900 border border-cyan-500/40 text-cyan-300 text-[9px] px-1.5 focus:outline-none focus:border-cyan-300 font-mono text-center rounded"
                    placeholder="TAG"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {zoneLabels.length} LABELS PLACED
                </span>
                {zoneLabels.length > 0 && (
                  <>
                    <button
                      onClick={() => setZoneLabels(prev => prev.slice(0, -1))}
                      className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded text-[9px] font-bold cursor-pointer"
                    >
                      ↶ Undo
                    </button>
                    <button
                      onClick={() => setZoneLabels([])}
                      className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[9px] font-bold cursor-pointer"
                    >
                      ✕ Clear
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsLabelingMode(false)}
                  className="px-2.5 py-0.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded border border-emerald-400 text-[9px] font-bold cursor-pointer"
                >
                  ✓ Done
                </button>
              </div>
            </div>
          )}

          {isRoomBlockMode && (
            <div className="absolute top-2 left-3 right-3 z-30 px-3 py-2 bg-black/90 backdrop-blur-md border border-purple-400/60 rounded-lg flex flex-wrap items-center justify-between shadow-2xl gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                  🧱 SELECT ROOM BLOCK TO PLACE:
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { type: 'L', label: 'L Living', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40', active: 'bg-emerald-500 text-black shadow-[0_0_8px_#10b981]' },
                    { type: 'B', label: 'B Bedroom', bg: 'bg-blue-500/20 text-blue-300 border-blue-400/40', active: 'bg-blue-500 text-black shadow-[0_0_8px_#3b82f6]' },
                    { type: 'K', label: 'K Kitchen', bg: 'bg-orange-500/20 text-orange-300 border-orange-400/40', active: 'bg-orange-500 text-black shadow-[0_0_8px_#f97316]' },
                    { type: 'C', label: 'C Corridor', bg: 'bg-amber-500/20 text-amber-300 border-amber-400/40', active: 'bg-amber-400 text-black shadow-[0_0_8px_#f59e0b]' },
                    { type: 'T', label: 'T Toilet', bg: 'bg-purple-500/20 text-purple-300 border-purple-400/40', active: 'bg-purple-500 text-black shadow-[0_0_8px_#a855f7]' },
                    { type: 'BAL', label: 'BAL Balcony', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40', active: 'bg-cyan-400 text-black shadow-[0_0_8px_#06b6d4]' },
                  ].map(item => (
                    <button
                      key={item.type}
                      onClick={() => setSelectedBlockType(item.type as any)}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all cursor-pointer border ${
                        selectedBlockType === item.type ? item.active : item.bg
                      }`}
                    >
                      + {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-purple-300/80 uppercase">
                  (Drag corners to resize • Drag body to move • Right-click to delete)
                </span>
                <span className="text-[9px] font-mono font-bold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/30">
                  {roomBlocks.length} BLOCKS
                </span>
                {roomBlocks.length > 0 && activeBlockId && (
                  <button
                    onClick={() => {
                      setRoomBlocks(prev => prev.map(b => b.id === activeBlockId ? { ...b, rotation: (((b.rotation || 0) + 90) % 360) } : b));
                    }}
                    className="px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded text-[9px] font-bold border border-cyan-400/50 cursor-pointer flex items-center gap-1 shadow-[0_0_6px_rgba(0,240,255,0.3)]"
                    title="Rotate Selected Room Block by 90°"
                  >
                    <RotateCcw className="w-2.5 h-2.5 rotate-180" />
                    <span>↻ Rotate 90°</span>
                  </button>
                )}
                {roomBlocks.length > 0 && (
                  <>
                    <button
                      onClick={() => setRoomBlocks(prev => prev.slice(0, -1))}
                      className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded text-[9px] font-bold cursor-pointer"
                      title="Undo Last Block"
                    >
                      ↶ Undo
                    </button>
                    <button
                      onClick={() => setRoomBlocks([])}
                      className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[9px] font-bold cursor-pointer"
                      title="Clear All Room Blocks"
                    >
                      ✕ Clear
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsRoomBlockMode(false)}
                  className="px-2.5 py-0.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded border border-emerald-400 text-[9px] font-bold cursor-pointer"
                >
                  ✓ Done
                </button>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { setHoverPt(null); setDragMode(null); }}
            onClick={handleCanvasClick}
            className={`cursor-crosshair ${isFullscreen ? 'w-full h-full object-contain bg-black/60 rounded-xl border border-white/10 shadow-2xl' : 'w-full max-h-[300px] object-contain'}`}
          />
          {bgImage && (
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded pointer-events-none shadow">
              <span className="text-[8px] font-bold text-cyan-400/80 uppercase">Drag corners to resize • Drag image to shift</span>
            </div>
          )}
        </div>

        {isTracingClosed && plotData && (
          <div className="flex items-center justify-between px-3 py-1.5 text-[9px] font-mono border-t border-white/5 shrink-0">
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

            {/* Live Divide, Labels, Room Blocks & Room Sketch Buttons */}
            {(suggestedShape || (isTracingClosed && polygon.length >= 3)) && (
              <div className="flex items-center gap-2 ml-auto">
                {/* Divide Button */}
                {!isDividingMode ? (
                  <button
                    onClick={() => { setIsDividingMode(true); setIsLabelingMode(false); setIsRoomBlockMode(false); setIsEditingShape(false); setIsRoomSketchMode(false); }}
                    className="px-2.5 py-0.5 bg-gradient-to-r from-cyan-500/30 to-blue-500/20 hover:from-cyan-500/40 hover:to-blue-500/30 text-cyan-300 rounded border border-cyan-400/50 transition-all flex items-center gap-1.5 text-[9px] font-bold shadow-[0_0_10px_rgba(0,240,255,0.2)] cursor-pointer"
                  >
                    <Scissors className="w-3 h-3 text-cyan-400" />
                    <span>Live Divide {dividerLines.length > 0 ? `(${dividerLines.length})` : ''}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsDividingMode(false)}
                      className="px-2.5 py-0.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded border border-emerald-400 transition-all flex items-center gap-1 text-[9px] font-bold shadow-[0_0_8px_rgba(16,185,129,0.3)] cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Done Dividing
                    </button>
                    {dividerLines.length > 0 && (
                      <>
                        <button
                          onClick={() => setDividerLines(prev => prev.slice(0, -1))}
                          className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded text-[9px] font-bold cursor-pointer"
                          title="Undo Last Cut"
                        >
                          ↶ Undo
                        </button>
                        <button
                          onClick={() => setDividerLines([])}
                          className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[9px] font-bold cursor-pointer"
                          title="Clear All Cuts"
                        >
                          ✕ Clear
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Labeling Button */}
                {!isLabelingMode ? (
                  <button
                    onClick={() => { setIsLabelingMode(true); setIsDividingMode(false); setIsRoomBlockMode(false); setIsEditingShape(false); setIsRoomSketchMode(false); }}
                    className="px-2.5 py-0.5 bg-gradient-to-r from-emerald-500/30 to-teal-500/20 hover:from-emerald-500/40 hover:to-teal-500/30 text-emerald-300 rounded border border-emerald-400/50 transition-all flex items-center gap-1.5 text-[9px] font-bold shadow-[0_0_10px_rgba(16,185,129,0.2)] cursor-pointer"
                  >
                    <Tag className="w-3 h-3 text-emerald-400" />
                    <span>Labels {zoneLabels.length > 0 ? `(${zoneLabels.length})` : '(F1, BHK)'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsLabelingMode(false)}
                      className="px-2.5 py-0.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded border border-emerald-400 transition-all flex items-center gap-1 text-[9px] font-bold shadow-[0_0_8px_rgba(16,185,129,0.3)] cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Done Labels
                    </button>
                    {zoneLabels.length > 0 && (
                      <button
                        onClick={() => setZoneLabels([])}
                        className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[9px] font-bold cursor-pointer"
                        title="Clear All Labels"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Room Blocks Button */}
                {!isRoomBlockMode ? (
                  <button
                    onClick={() => { setIsRoomBlockMode(true); setIsLabelingMode(false); setIsDividingMode(false); setIsEditingShape(false); setIsRoomSketchMode(false); }}
                    className="px-2.5 py-0.5 bg-gradient-to-r from-purple-500/30 to-indigo-500/20 hover:from-purple-500/40 hover:to-indigo-500/30 text-purple-300 rounded border border-purple-400/50 transition-all flex items-center gap-1.5 text-[9px] font-bold shadow-[0_0_10px_rgba(168,85,247,0.2)] cursor-pointer"
                  >
                    <Box className="w-3 h-3 text-purple-400" />
                    <span>Room Blocks {roomBlocks.length > 0 ? `(${roomBlocks.length})` : '(B, K, L, C)'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsRoomBlockMode(false)}
                      className="px-2.5 py-0.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded border border-emerald-400 transition-all flex items-center gap-1 text-[9px] font-bold shadow-[0_0_8px_rgba(16,185,129,0.3)] cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Done Blocks
                    </button>
                    {roomBlocks.length > 0 && (
                      <button
                        onClick={() => setRoomBlocks([])}
                        className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[9px] font-bold cursor-pointer"
                        title="Clear All Blocks"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                )}

                {/* ── Room Sketch Button (rough sketch → CAD single-step workflow) ── */}
                {!isRoomSketchMode ? (
                  <button
                    onClick={() => { setIsRoomSketchMode(true); setIsRoomBlockMode(false); setIsLabelingMode(false); setIsDividingMode(false); setIsEditingShape(false); }}
                    className={`px-2.5 py-0.5 bg-gradient-to-r from-orange-500/30 to-amber-500/20 hover:from-orange-500/40 hover:to-amber-500/30 text-orange-300 rounded border transition-all flex items-center gap-1.5 text-[9px] font-bold cursor-pointer ${
                      roomSketchLines.length > 0
                        ? 'border-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.4)]'
                        : 'border-orange-400/50 shadow-[0_0_8px_rgba(249,115,22,0.15)]'
                    }`}
                    title="Draw rough room partition lines — triggers 1-step Sketch→CAD workflow"
                  >
                    <svg className="w-3 h-3 text-orange-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M2 14 L14 2" /><path d="M2 2 L7 7" /><path d="M9 9 L14 14" />
                    </svg>
                    <span>Rough Sketch {roomSketchLines.length > 0 ? `(${roomSketchLines.length} walls)` : '(Room Lines)'}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsRoomSketchMode(false)}
                      className="px-2.5 py-0.5 bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-300 rounded border border-emerald-400 transition-all flex items-center gap-1 text-[9px] font-bold shadow-[0_0_8px_rgba(16,185,129,0.3)] cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> Done Sketching
                    </button>
                    {roomSketchLines.length > 0 && (
                      <>
                        <button
                          onClick={() => setRoomSketchLines(prev => prev.slice(0, -1))}
                          className="px-2 py-0.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded text-[9px] font-bold cursor-pointer"
                          title="Undo Last Room Wall"
                        >
                          ↶ Undo
                        </button>
                        <button
                          onClick={() => setRoomSketchLines([])}
                          className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[9px] font-bold cursor-pointer"
                          title="Clear All Room Sketch Lines"
                        >
                          ✕ Clear
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Room Sketch Mode Active Badge */}
            {isRoomSketchMode && (
              <div className="flex items-center gap-2 mt-1.5 px-2 py-1 bg-orange-500/10 border border-orange-400/30 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-[9px] font-bold text-orange-300 tracking-wider">ROOM SKETCH MODE — Draw freeform room partition lines. Generate will run Sketch→CAD (1-Step) workflow.</span>
              </div>
            )}
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
