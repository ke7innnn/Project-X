'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Download, RotateCcw, ImageIcon, Sparkles, RefreshCw, Undo2, Redo2, Maximize2, ImagePlus, X, Move, Terminal, Pentagon, Folder, Plus, Clock, MapPin, Trash2, Map, ChevronDown } from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { v4 as uuidv4 } from 'uuid';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';

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
  { label: 'Square (Large)', id: 'square', w: 888, h: 888, falSize: 'square_hd' },
  { label: 'Landscape (Large)', id: 'landscape', w: 960, h: 636, falSize: 'landscape_4_3' },
  { label: 'Portrait (Large)', id: 'portrait', w: 636, h: 888, falSize: 'portrait_4_3' },
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

// ─── fal.ai output resolution mapping ────────────────────────────────────────
// Source image + mask MUST be at the EXACT same resolution the model outputs.
// If they differ, the model internally rescales → polygon vertices drift ~20%.
const FAL_OUTPUT_SIZES: Record<string, { w: number; h: number }> = {
  'square_hd': { w: 1024, h: 1024 },
  'square': { w: 512, h: 512 },
  'landscape_4_3': { w: 1024, h: 768 },
  'landscape_16_9': { w: 1024, h: 576 },
  'portrait_4_3': { w: 768, h: 1024 },
  'portrait_16_9': { w: 576, h: 1024 },
};

// ─── Shared polygon path builder (used by both source + mask for pixel-identical alignment)
// ─── Shared polygon path builder (used by both source + mask for pixel-identical alignment)
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

// ─── Scale polygon points from canvas space to output resolution ─────────────
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
// ─── Export canvas as CLEAN source PNG for GPT-Image-2 ──────────────────────
// CRITICAL: Exports at the fal.ai output resolution (not canvas resolution)
// to prevent rescale drift. Contains ONLY the polygon — no grid, no labels, no noise.
function exportCanvasForAI(
  plotPts: Point[],
  sitePts: Point[],
  canvasW: number,
  canvasH: number,
  falSize: string
): string {
  const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
  const offscreen = document.createElement('canvas');
  offscreen.width = outSize.w;
  offscreen.height = outSize.h;
  const ctx = offscreen.getContext('2d')!;

  // Scale polygon points, zooming to fit with 24px padding so AI gets maximum resolution
  const scaledSitePts = scalePoints(
    sitePts, canvasW, canvasH, outSize.w, outSize.h, true, 24
  );

  // 1. Solid black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  // 2. Site polygon — this is the ONLY visual element the AI needs
  if (scaledSitePts.length >= 3) {
    // Pure white interior fill
    ctx.fillStyle = '#ffffff';
    drawPolygonPath(ctx, scaledSitePts);
    ctx.fill();
  }

  return offscreen.toDataURL('image/png');
}

// ─── Export mask as BLACK/WHITE PNG at fal.ai output resolution ──────────────
// WHITE = AI draws here (inside polygon). BLACK = AI must not touch (outside).
// MUST be at the same resolution as the source image for pixel-aligned masking.
function exportMaskForAI(
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

  // Scale polygon points, zooming to fit with 24px padding so AI gets maximum resolution
  const scaledPts = scalePoints(
    activePts, canvasW, canvasH, outSize.w, outSize.h, true, 24
  );

  // 1. Fill with BLACK (preserve/freeze — AI cannot draw here)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  // 2. Fill polygon with WHITE (editable — AI draws floor plan here)
  if (scaledPts.length >= 3) {
    ctx.fillStyle = '#ffffff';
    drawPolygonPath(ctx, scaledPts);
    ctx.fill();

    // Dilate white boundary by 16px (matches source image wall thickness)
    // so the AI can place its outer wall lines exactly on the trace edge
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 16;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    drawPolygonPath(ctx, scaledPts);
    ctx.stroke();
  }

  return offscreen.toDataURL('image/png');
}

// ─── Export black/white/red architectural trace for Grok ──
function exportBlackWhiteRedTraceForAI(
  activePts: Point[],
  canvasW: number,
  canvasH: number,
  falSize: string,
  dividerLines: Point[][] = [],
  coreMarker: Point | null = null
): { base64: string, numRegions: number } {
  // Use exact canvas resolution
  const outSize = { w: canvasW, h: canvasH };
  const offscreen = document.createElement('canvas');
  offscreen.width = outSize.w;
  offscreen.height = outSize.h;
  const ctx = offscreen.getContext('2d')!;

  // 1. Solid black background outside
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  if (activePts.length >= 3) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    activePts.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
    const ptsW = maxX - minX;
    const ptsH = maxY - minY;
    const padding = 14; // 14px margin
    const targetW = Math.max(1, outSize.w - padding * 2);
    const targetH = Math.max(1, outSize.h - padding * 2);

    const scale = Math.min(targetW / (ptsW || 1), targetH / (ptsH || 1));
    const offsetX = (outSize.w / 2) - ((minX + maxX) / 2) * scale;
    const offsetY = (outSize.h / 2) - ((minY + maxY) / 2) * scale;

    const applyTransform = (pts: Point[]) => pts.map(p => ({
      x: Math.round(p.x * scale + offsetX),
      y: Math.round(p.y * scale + offsetY)
    }));

    const scaledPts = applyTransform(activePts);

    // 2. Solid white inside (Binary Occupancy Mask)
    ctx.fillStyle = '#ffffff';
    drawPolygonPath(ctx, scaledPts);
    ctx.fill();

    // 3. Draw Divider Lines in BLACK (#000000) to partition the white region
    if (dividerLines.length > 0) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 10;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      dividerLines.forEach(line => {
        if (line.length < 2) return;
        const scaledLine = applyTransform(line);
        ctx.beginPath();
        ctx.moveTo(scaledLine[0].x, scaledLine[0].y);
        for (let i = 1; i < scaledLine.length; i++) {
          ctx.lineTo(scaledLine[i].x, scaledLine[i].y);
        }
        ctx.stroke();
      });
    }

    // 4. Flood-Fill the partitioned white regions with distinct colors
    // Only run when divider lines exist — otherwise keep it white
    let regionIdx = 0;
    if (dividerLines.length > 0) {
      const imageData = ctx.getImageData(0, 0, outSize.w, outSize.h);
      const data = imageData.data;
      const w = outSize.w;
      const h = outSize.h;
      const palette = [
        [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], 
        [255, 0, 255], [255, 165, 0], [128, 0, 128], [165, 42, 42],
        [0, 128, 128], [128, 128, 0]
      ];

      const isWhite = (i: number) => data[i] === 255 && data[i+1] === 255 && data[i+2] === 255;
      
      // Basic BFS Flood Fill
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (isWhite(i)) {
            const color = palette[regionIdx % palette.length];
            regionIdx++;
            const queue = [i];
            data[i] = color[0]; data[i+1] = color[1]; data[i+2] = color[2];
            let qIdx = 0;
            while (qIdx < queue.length) {
              const currI = queue[qIdx++];
              const pX = (currI / 4) % w;
              
              // Neighbors: up, down, left, right
              const nUp = currI - w * 4;
              const nDown = currI + w * 4;
              const nLeft = pX > 0 ? currI - 4 : -1;
              const nRight = pX < w - 1 ? currI + 4 : -1;
              
              if (nUp >= 0 && isWhite(nUp)) { data[nUp] = color[0]; data[nUp+1] = color[1]; data[nUp+2] = color[2]; queue.push(nUp); }
              if (nDown < data.length && isWhite(nDown)) { data[nDown] = color[0]; data[nDown+1] = color[1]; data[nDown+2] = color[2]; queue.push(nDown); }
              if (nLeft !== -1 && isWhite(nLeft)) { data[nLeft] = color[0]; data[nLeft+1] = color[1]; data[nLeft+2] = color[2]; queue.push(nLeft); }
              if (nRight !== -1 && isWhite(nRight)) { data[nRight] = color[0]; data[nRight+1] = color[1]; data[nRight+2] = color[2]; queue.push(nRight); }
            }
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    } else {
      regionIdx = 1; // No dividers = 1 region
    }

    // 5. Draw low-opacity room-hint grid boxes inside the footprint
    // These tiny boxes give the AI a visual cue that small rooms are expected
    ctx.save();
    // Clip to the polygon so grid lines only appear inside
    drawPolygonPath(ctx, scaledPts);
    ctx.clip();
    
    // Calculate grid cell size — aim for ~40-60px cells (room-sized hints)
    let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
    scaledPts.forEach(p => {
      if (p.x < sMinX) sMinX = p.x;
      if (p.x > sMaxX) sMaxX = p.x;
      if (p.y < sMinY) sMinY = p.y;
      if (p.y > sMaxY) sMaxY = p.y;
    });
    const gridCellSize = 50; // ~50px squares = room-scale hint
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; // darker low opacity black
    ctx.lineWidth = 0.5;
    
    // Draw random, staggered boxes to simulate unaligned real rooms
    for (let gy = Math.floor(sMinY / gridCellSize) * gridCellSize; gy <= sMaxY; gy += gridCellSize) {
      // Offset each row so they don't align perfectly vertically
      const rowOffset = (Math.random() - 0.5) * gridCellSize;
      for (let gx = Math.floor(sMinX / gridCellSize) * gridCellSize; gx <= sMaxX; gx += gridCellSize) {
         // Randomize box dimensions (e.g., 30px to 80px)
         const w = gridCellSize * (0.6 + Math.random() * 1.0);
         const h = gridCellSize * (0.6 + Math.random() * 1.0);
         // Add some random scatter in the y-direction too
         const yScatter = (Math.random() - 0.5) * 10;
         
         ctx.strokeRect(gx + rowOffset, gy + yScatter, w, h);
      }
    }
    ctx.restore();

    // 6. Draw Core Marker in pure CYAN (#00FFFF)
    if (coreMarker) {
      const scaledCore = applyTransform([coreMarker])[0];
      ctx.fillStyle = '#00FFFF';
      const mSize = 64; // nice big block for AI to notice
      ctx.fillRect(scaledCore.x - mSize/2, scaledCore.y - mSize/2, mSize, mSize);
    }
    
    return { base64: offscreen.toDataURL('image/png'), numRegions: Math.max(1, regionIdx) };
  }

  return { base64: offscreen.toDataURL('image/png'), numRegions: 1 };
}

// ─── Export a plain white sheet canvas for inpainting base ──
function generateBlankWhiteCanvas(falSize: string, canvasW: number, canvasH: number): string {
  const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
  const offscreen = document.createElement('canvas');
  offscreen.width = outSize.w;
  offscreen.height = outSize.h;
  const ctx = offscreen.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  return offscreen.toDataURL('image/png');
}

interface RoomLayout {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayoutData {
  rooms: RoomLayout[];
}

// ─── Generate vector schematic from mathematical Mastermind JSON (Deprecated) ──
// (Replaced by algorithmic crop to prevent LLM coordinate hallucination/overlapping)
function generateSchematicImage(
  layout: LayoutData,
  activePts: Point[],
  canvasW: number,
  canvasH: number,
  falSize: string
): string {
  // Keep original function signature but unused, or simply remove if unused
  return '';
}

// ─── Exact algorithmic composite to shrink/fit GPT layout into trace boundary ──
function scaleImageToFitPolygon(
  imageUrl: string,
  activePts: Point[],
  canvasW: number,
  canvasH: number,
  falSize: string
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
      const offscreen = document.createElement('canvas');
      offscreen.width = outSize.w;
      offscreen.height = outSize.h;
      const ctx = offscreen.getContext('2d')!;

      // 1. Draw solid black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outSize.w, outSize.h);

      // 2. Compute scaled polygon at AI output resolution
      const scaledPts = scalePoints(activePts, canvasW, canvasH, outSize.w, outSize.h, true, 24);
      
      if (scaledPts.length >= 3) {
        // 3. Draw layout clipped exactly to the trace boundary to clean up exterior bleed (no scaling or shrinking!)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
        for (let i = 1; i < scaledPts.length; i++) {
          ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, 0, 0, outSize.w, outSize.h);
        ctx.restore();
      } else {
        // Fallback: draw 1:1 if pts invalid
        ctx.drawImage(img, 0, 0, outSize.w, outSize.h);
      }

      // Compress to JPEG for performance
      resolve(offscreen.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

// ─── Compute polygon centroid (geometric center) for adaptive stair placement ──
function computePolygonCentroid(pts: Point[]): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0, area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    area += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  area /= 2;
  cx /= (6 * area);
  cy /= (6 * area);
  return { x: cx, y: cy };
}

function detectBHKTypeLocal(rooms: any[]): number {
  const bedroomCount = rooms.filter(r =>
    /bedroom|bed\s*room/i.test(r.name) && !/master/i.test(r.name)
  ).length;
  return Math.max(1, bedroomCount);
}

type Snapshot = { plotPts: Point[]; sitePts: Point[]; plotClosed: boolean; siteClosed: boolean; divLines: Point[][]; core: Point | null };

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmartPlannerPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Guard the active project spine
  const { activeProject } = useActiveProjectGuard();

  // Project management states
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projNameInput, setProjNameInput] = useState('');
  const [projLocationInput, setProjLocationInput] = useState('');
  const [projPlotAreaInput, setProjPlotAreaInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  // Canvas settings states
  const [ratioId, setRatioId] = useState<RatioId>('square');
  const [showRatioPicker, setShowRatioPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [bgImageLoaded, setBgImageLoaded] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(0.3);
  const [bgOffset, setBgOffset] = useState({ x: 0, y: 0 });
  const [bgScale, setBgScale] = useState(1);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [metersPerCell, setMetersPerCell] = useState(0.5);

  // Drawing mode and geometry states
  const [drawMode, setDrawMode] = useState<'plot' | 'site' | 'map' | 'divider' | 'core' | null>(null);
  const [plotPoints, setPlotPoints] = useState<Point[]>([]);
  const [sitePoints, setSitePoints] = useState<Point[]>([]);
  const [plotClosed, setPlotClosed] = useState(false);
  const [siteClosed, setSiteClosed] = useState(false);
  const [dividerLines, setDividerLines] = useState<Point[][]>([]);
  const [currentDivider, setCurrentDivider] = useState<Point[]>([]);
  const [coreMarker, setCoreMarker] = useState<Point | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<{ list: 'plot' | 'site'; index: number } | null>(null);
  const [draggingPoint, setDraggingPoint] = useState<{ list: 'plot' | 'site'; index: number } | null>(null);

  // Chat/LLM states
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: '**Welcome to Smart Planner \u2014 AI Floor Plan Generator**\n\n1. **Trace your Plot Boundary** (orange mode) on the canvas\n2. **Trace your Site Exterior** (cyan mode) after setbacks\n3. **Tell me your requirements** \u2014 how many flats, BHK type\n\nI will calculate everything mathematically, then generate a professional floor plan image.\n\n**Start tracing or just tell me your plot dimensions!**'
  }]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'step1' | 'mastermind' | 'step2'>('idle');
  const [generationProgress, setGenerationProgress] = useState(0);

  // AI Output and Pipeline states
  const [roomSchedule, setRoomSchedule] = useState<RoomSchedule | null>(null);
  const [activePreset, setActivePreset] = useState<'box' | 'l-shape' | 'u-shape' | 't-shape' | 'cruciform' | 'circle' | null>(null);
  const [edgeCurvature, setEdgeCurvature] = useState<number>(0);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [showGeneratedImage, setShowGeneratedImage] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [layoutOptions, setLayoutOptions] = useState<{ id: string; name: string; desc: string; flatCount?: number; bhkType?: string; }[] | null>(null);
  const [buildingType, setBuildingType] = useState<string>('multi-residential');
  const [roomConfig, setRoomConfig] = useState<string>('auto');
  const [aiModel, setAiModel] = useState<string>('grok');
  const workflow = 'grok-gpt';
  const [flatCount, setFlatCount] = useState<string>('auto');
  const [stage1ImageUrl, setStage1ImageUrl] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'stage1' | 'stage2'>('idle');

  // Zoom/Pan/Save/Accordion/Stepper states
  const zoom = 1;
  const panOffset = { x: 0, y: 0 };
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<Date>(new Date());
  const [saveStatusText, setSaveStatusText] = useState('Saved just now');
  const [isCanvasPopupOpen, setIsCanvasPopupOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(-1);
  const [stageStates, setStageStates] = useState<('pending' | 'running' | 'complete' | 'failed')[]>([
    'pending', 'pending', 'pending', 'pending', 'pending'
  ]);
  const [stageElapsed, setStageElapsed] = useState<number[]>([0, 0, 0, 0, 0]);
  const [stageThumbnails, setStageThumbnails] = useState<(string | null)[]>([null, null, null, null, null]);
  const [stageErrors, setStageErrors] = useState<(string | null)[]>([null, null, null, null, null]);
  const [pipelineTotalElapsed, setPipelineTotalElapsed] = useState(0);
  const [hasFailedThisSession, setHasFailedThisSession] = useState(false);

  // Debug states
  const [debugStep1Prompt, setDebugStep1Prompt] = useState<string>('');
  const [debugStep1BaseImage, setDebugStep1BaseImage] = useState<string>('');
  const [debugStep1MaskImage, setDebugStep1MaskImage] = useState<string>('');
  const [debugStep1OutputUrl, setDebugStep1OutputUrl] = useState<string>('');
  const [debugStep2SystemPrompt, setDebugStep2SystemPrompt] = useState<string>('');
  const [debugStep2UserPrompt, setDebugStep2UserPrompt] = useState<string>('');
  const [debugStep2TraceImage, setDebugStep2TraceImage] = useState<string>('');
  const [debugStep15Schematic, setDebugStep15Schematic] = useState<string>('');
  const [mastermindStrategy, setMastermindStrategy] = useState<string>('');

  // Refs
  const bgInputRef = useRef<HTMLInputElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const lastMousePos = useRef<Point | null>(null);
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const generatedImageObjRef = useRef<HTMLImageElement | null>(null);
  const modalNameInputRef = useRef<HTMLInputElement>(null);

  // --- 2. CONSTANTS & DERIVED VALUES ---
  const SCALE_OPTIONS = [0.5, 1, 2, 5];
  const currentRatio = CANVAS_RATIOS.find(r => r.id === ratioId) ?? CANVAS_RATIOS[0];
  const CANVAS_W = currentRatio.w;
  const CANVAS_H = currentRatio.h;
  const generatedImageUrl = generatedImageUrls[activeImageIndex] || null;

  const WORKFLOW_LABELS: Record<string, { label: string; stage1: string; stage2?: string; badge?: string }> = {
    'grok-gpt':          { label: 'Grok + GPT Image 2 Edit', stage1: 'Grok', stage2: 'GPT Image 2 Edit', badge: 'RECOMMENDED' },
    'grok-nano':         { label: 'Grok + Nano Banana Pro', stage1: 'Grok', stage2: 'Nano Banana' },
    'grok-kontext':      { label: 'Grok + FLUX Kontext', stage1: 'Grok', stage2: 'FLUX Kontext' },
    'flux-klein-gpt':    { label: 'FLUX Klein + GPT Image 2 Edit', stage1: 'FLUX Klein', stage2: 'GPT Image 2 Edit' },
    'flux-klein-nano':   { label: 'FLUX Klein + Nano Banana Pro', stage1: 'FLUX Klein', stage2: 'Nano Banana' },
    'flux-kontext-gpt':  { label: 'FLUX Kontext + GPT Image 2 Edit', stage1: 'FLUX Kontext', stage2: 'GPT Image 2 Edit' },
    'grok-solo':         { label: 'Grok only', stage1: 'Grok' },
    'flux-klein-solo':   { label: 'FLUX Klein only', stage1: 'FLUX Klein' },
    'flux-kontext-solo': { label: 'FLUX Kontext only', stage1: 'FLUX Kontext' },
    'gpt-solo':          { label: 'GPT Image 2 Edit only', stage1: 'GPT Image 2' },
    'gemini-solo':       { label: 'Gemini only', stage1: 'Gemini' },
    'flux-canny-solo':   { label: 'FLUX Canny only', stage1: 'FLUX Canny' },
  };
  const activeWf = WORKFLOW_LABELS[workflow] || WORKFLOW_LABELS['grok-gpt'];
  const isPipeline = !!activeWf.stage2;

  // --- 3. HELPER FUNCTIONS & CALLBACKS ---
  const pxToMScaled = (px: number) => +((px / CELL_PX) * metersPerCell).toFixed(1);
  const snapToGrid = (v: number) => Math.round(v / CELL_PX) * CELL_PX;

  const handleSendToSection = (targetSection: 'edit' | 'png-to-dxf' | '3d-render') => {
    if (!generatedImageUrl) return;
    useArchitectStore.setState({ currentFloorPlan: generatedImageUrl });
    if (targetSection === 'edit') {
      useArchitectStore.setState({ phase: 'edit' });
    } else if (targetSection === '3d-render') {
      useArchitectStore.setState({ phase: 'edit' });
    }
    router.push(`/${targetSection}`);
  };

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
    e.target.value = '';
  };

  const removeBgImage = () => {
    bgImageRef.current = null;
    setBgImageLoaded(false);
    setBgOffset({ x: 0, y: 0 });
    setBgScale(1);
    setDrawMode(null);
  };

  const pushUndo = useCallback((snap: Snapshot) => {
    undoStack.current = [...undoStack.current, snap];
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [{ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker }, ...redoStack.current];
    setPlotPoints(prev.plotPts); setSitePoints(prev.sitePts);
    setPlotClosed(prev.plotClosed); setSiteClosed(prev.siteClosed);
    setDividerLines(prev.divLines); setCoreMarker(prev.core);
  }, [plotPoints, sitePoints, plotClosed, siteClosed, dividerLines, coreMarker]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, { plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker }];
    setPlotPoints(next.plotPts); setSitePoints(next.sitePts);
    setPlotClosed(next.plotClosed); setSiteClosed(next.siteClosed);
    setDividerLines(next.divLines); setCoreMarker(next.core);
  }, [plotPoints, sitePoints, plotClosed, siteClosed, dividerLines, coreMarker]);

  const loadPresetShape = useCallback((shape: 'box' | 'l-shape' | 'u-shape' | 't-shape' | 'cruciform' | 'circle') => {
    pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
    setActivePreset(shape);

    const cx = Math.round(CANVAS_W / 2 / CELL_PX) * CELL_PX;
    const cy = Math.round(CANVAS_H / 2 / CELL_PX) * CELL_PX;
    let pts: Point[] = [];

    if (shape === 'box') {
      pts = [{ x: cx - 180, y: cy - 120 }, { x: cx + 180, y: cy - 120 }, { x: cx + 180, y: cy + 120 }, { x: cx - 180, y: cy + 120 }];
    } else if (shape === 'l-shape') {
      pts = [{ x: cx - 180, y: cy - 180 }, { x: cx + 180, y: cy - 180 }, { x: cx + 180, y: cy }, { x: cx, y: cy }, { x: cx, y: cy + 180 }, { x: cx - 180, y: cy + 180 }];
    } else if (shape === 'u-shape') {
      pts = [{ x: cx - 200, y: cy - 150 }, { x: cx - 80, y: cy - 150 }, { x: cx - 80, y: cy + 40 }, { x: cx + 80, y: cy + 40 }, { x: cx + 80, y: cy - 150 }, { x: cx + 200, y: cy - 150 }, { x: cx + 200, y: cy + 180 }, { x: cx - 200, y: cy + 180 }];
    } else if (shape === 't-shape') {
      pts = [{ x: cx - 200, y: cy - 150 }, { x: cx + 200, y: cy - 150 }, { x: cx + 200, y: cy - 30 }, { x: cx + 60, y: cy - 30 }, { x: cx + 60, y: cy + 180 }, { x: cx - 60, y: cy + 180 }, { x: cx - 60, y: cy - 30 }, { x: cx - 200, y: cy - 30 }];
    } else if (shape === 'cruciform') {
      pts = [{ x: cx - 60, y: cy - 180 }, { x: cx + 60, y: cy - 180 }, { x: cx + 60, y: cy - 60 }, { x: cx + 180, y: cy - 60 }, { x: cx + 180, y: cy + 60 }, { x: cx + 60, y: cy + 60 }, { x: cx + 60, y: cy + 180 }, { x: cx - 60, y: cy + 180 }, { x: cx - 60, y: cy + 60 }, { x: cx - 180, y: cy + 60 }, { x: cx - 180, y: cy - 60 }, { x: cx - 60, y: cy - 60 }];
    } else if (shape === 'circle') {
      const radius = 150;
      for (let i = 0; i < 36; i++) {
        const angle = (i * Math.PI * 2) / 36;
        pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
      }
    }

    const snapped = pts.map(p => ({
      x: Math.round(p.x / CELL_PX) * CELL_PX,
      y: Math.round(p.y / CELL_PX) * CELL_PX
    }));

    setPlotPoints(snapped);
    setPlotClosed(true);
    setDrawMode(null);
    setSelectedEdge(null);

    const sitePts = snapped.map(p => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const shrinkFactor = (dist - 24) / dist;
      return {
        x: Math.round((cx + dx * shrinkFactor) / CELL_PX) * CELL_PX,
        y: Math.round((cy + dy * shrinkFactor) / CELL_PX) * CELL_PX
      };
    });
    setSitePoints(sitePts);
    setSiteClosed(true);
  }, [CANVAS_W, CANVAS_H, plotPoints, sitePoints, plotClosed, siteClosed, pushUndo, dividerLines, coreMarker]);

  const fitToPlot = useCallback(() => {
    // zoom is now locked at 1, so fitToPlot is a no-op
  }, []);

  const generateCurvePoints = (p1: Point, p2: Point, c: number, numSegments: number = 16) => {
    if (c === 0) return [];
    const M = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = -dy / len;
    const uy = dx / len;
    const cp = {
      x: M.x + ux * c * 0.4,
      y: M.y + uy * c * 0.4
    };
    const pts: Point[] = [];
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const x = (1-t)*(1-t)*p1.x + 2*(1-t)*t*cp.x + t*t*p2.x;
      const y = (1-t)*(1-t)*p1.y + 2*(1-t)*t*cp.y + t*t*p2.y;
      pts.push({ x, y });
    }
    return pts;
  };

  // --- 4. EFFECTS ---
  useEffect(() => {
    localStorage.setItem('last_used_tool', 'concept-generator');
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem('concept_generator_projects');
      if (data) {
        try {
          setProjectsList(JSON.parse(data));
        } catch (e) {
          console.error('[ConceptGenerator] Error parsing projects', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (generationPhase === 'idle') {
      setGenerationProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (generationPhase === 'step1') {
          return prev < 49 ? prev + 1 : prev;
        } else if (generationPhase === 'step2') {
          if (prev < 50) return 50;
          return prev < 99 ? prev + 1 : prev;
        }
        return prev;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [generationPhase]);

  useEffect(() => {
    setEdgeCurvature(0);
  }, [selectedEdge]);

  useEffect(() => {
    if (showCreateModal) {
      setTimeout(() => {
        modalNameInputRef.current?.focus();
      }, 50);
    }
  }, [showCreateModal]);

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      const key = e.key.toLowerCase();
      if (key === 'p') { e.preventDefault(); setDrawMode('plot'); }
      else if (key === 's') { e.preventDefault(); setDrawMode('site'); }
      else if (key === 'd') { e.preventDefault(); setDrawMode('divider'); }
      else if (key === 'l') { e.preventDefault(); setDrawMode('core'); }
      else if (key === 'm') { e.preventDefault(); setDrawMode('map'); }
      else if (key === 'f') { e.preventDefault(); fitToPlot(); }
      else if (key === 'v') { e.preventDefault(); setIsCanvasPopupOpen(prev => !prev); }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [fitToPlot]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ─── Project management functions (declared here, after all state, to avoid TDZ) ──

  // Auto-save tracker
  const isInitialLoadRef = useRef(false);

  // Load project settings on selection
  useEffect(() => {
    if (!selectedProjectId) return;
    const proj = projectsList.find(p => p.id === selectedProjectId);
    if (proj && proj.state) {
      const s = proj.state;
      isInitialLoadRef.current = true;
      setRatioId(s.ratioId || 'square');
      setPlotPoints(s.plotPoints || []);
      setSitePoints(s.sitePoints || []);
      setPlotClosed(s.plotClosed || false);
      setSiteClosed(s.siteClosed || false);
      setDividerLines(s.dividerLines || []);
      setCoreMarker(s.coreMarker || null);
      setBuildingType(s.buildingType || 'multi-residential');
      setRoomConfig(s.roomConfig || 'auto');
      setFlatCount(s.flatCount || 'auto');
      setGeneratedImageUrls(s.generatedImageUrls || []);
      setStage1ImageUrl(s.stage1ImageUrl || null);
      setShowGeneratedImage(s.generatedImageUrls?.length > 0);
      setDebugStep2SystemPrompt(s.debugStep2SystemPrompt || '');
      setDebugStep2UserPrompt(s.debugStep2UserPrompt || '');
      setDebugStep2TraceImage(s.debugStep2TraceImage || '');
    }
  }, [selectedProjectId]);

  // Create Project
  const createNewProject = () => {
    if (!projNameInput.trim()) return;
    const targetArea = parseFloat(projPlotAreaInput);
    let initialPlotPoints: Point[] = [];
    let initialSitePoints: Point[] = [];
    let initialPlotClosed = false;
    let initialSiteClosed = false;

    if (!isNaN(targetArea) && targetArea > 0) {
      const metersPerCellVal = 0.5;
      const heightMeters = Math.sqrt(targetArea / 1.5);
      const widthMeters = 1.5 * heightMeters;
      const heightPx = Math.max(2, Math.round(heightMeters / metersPerCellVal)) * CELL_PX;
      const widthPx  = Math.max(2, Math.round(widthMeters  / metersPerCellVal)) * CELL_PX;
      const cx = Math.round(CANVAS_W / 2 / CELL_PX) * CELL_PX;
      const cy = Math.round(CANVAS_H / 2 / CELL_PX) * CELL_PX;
      const hw = Math.round(widthPx  / 2 / CELL_PX) * CELL_PX;
      const hh = Math.round(heightPx / 2 / CELL_PX) * CELL_PX;
      initialPlotPoints = [
        { x: cx - hw, y: cy - hh }, { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh }, { x: cx - hw, y: cy + hh }
      ];
      initialPlotClosed = true;
      initialSitePoints = initialPlotPoints.map(p => {
        const dx = p.x - cx; const dy = p.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const sf = (dist - 24) / dist;
        return {
          x: Math.round((cx + dx * sf) / CELL_PX) * CELL_PX,
          y: Math.round((cy + dy * sf) / CELL_PX) * CELL_PX
        };
      });
      initialSiteClosed = true;
    }
    const newProj = {
      id: uuidv4(),
      name: projNameInput.trim(),
      location: projLocationInput.trim() || 'Unknown Location',
      createdAt: new Date().toISOString(),
      state: {
        ratioId: 'square', plotPoints: initialPlotPoints, sitePoints: initialSitePoints,
        plotClosed: initialPlotClosed, siteClosed: initialSiteClosed,
        dividerLines: [], coreMarker: null, buildingType: 'multi-residential',
        roomConfig: 'auto', workflow: 'grok-gpt', flatCount: 'auto',
        generatedImageUrls: [], stage1ImageUrl: null,
        debugStep2SystemPrompt: '', debugStep2UserPrompt: '', debugStep2TraceImage: '',
      }
    };
    const nextList = [newProj, ...projectsList];
    setProjectsList(nextList);
    localStorage.setItem('concept_generator_projects', JSON.stringify(nextList));
    setSelectedProjectId(newProj.id);
    setProjNameInput(''); setProjLocationInput(''); setProjPlotAreaInput('');
    setShowCreateModal(false);
  };

  const saveProjectName = () => {
    setIsEditingName(false);
    if (!editedName.trim()) return;
    const updatedList = projectsList.map(p =>
      p.id === selectedProjectId ? { ...p, name: editedName.trim() } : p
    );
    setProjectsList(updatedList);
    localStorage.setItem('concept_generator_projects', JSON.stringify(updatedList));
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = projectsList.filter(p => p.id !== id);
    setProjectsList(nextList);
    localStorage.setItem('concept_generator_projects', JSON.stringify(nextList));
    if (selectedProjectId === id) setSelectedProjectId(null);
  };


  // Auto-save project state to localStorage on changes
  useEffect(() => {
    if (!selectedProjectId) return;
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      const updatedList = projectsList.map(p => {
        if (p.id === selectedProjectId) {
          return {
            ...p,
            state: {
              ratioId,
              plotPoints,
              sitePoints,
              plotClosed,
              siteClosed,
              dividerLines,
              coreMarker,
              buildingType,
              roomConfig,
              workflow,
              flatCount,
              generatedImageUrls,
              stage1ImageUrl,
              debugStep2SystemPrompt,
              debugStep2UserPrompt,
              debugStep2TraceImage,
            }
          };
        }
        return p;
      });
      setProjectsList(updatedList);
      localStorage.setItem('concept_generator_projects', JSON.stringify(updatedList));
    }, 1000);

    return () => clearTimeout(timeout);
  }, [
    selectedProjectId,
    ratioId,
    plotPoints,
    sitePoints,
    plotClosed,
    siteClosed,
    dividerLines,
    coreMarker,
    buildingType,
    roomConfig,
    workflow,
    flatCount,
    generatedImageUrls,
    stage1ImageUrl,
    debugStep2SystemPrompt,
    debugStep2UserPrompt,
    debugStep2TraceImage
  ]);

  // ── Canvas Renderer ─────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 1. Draw Rulers Gutter Background (screen space, not transformed)
    ctx.fillStyle = '#0e160e'; // slightly lighter than #0A0F0A
    ctx.fillRect(0, 0, CANVAS_W, 24);
    ctx.fillRect(0, 0, 24, CANVAS_H);
    ctx.strokeStyle = 'var(--blue-700)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 0); ctx.lineTo(24, CANVAS_H);
    ctx.moveTo(0, 24); ctx.lineTo(CANVAS_W, 24);
    ctx.stroke();

    // Top-left corner box
    ctx.fillStyle = '#061506';
    ctx.fillRect(0, 0, 24, 24);
    ctx.strokeRect(0, 0, 24, 24);

    // Minor & Major grid spacings in world pixels
    const minorSpacing = (0.5 / metersPerCell) * CELL_PX;
    const majorSpacing = (5.0 / metersPerCell) * CELL_PX;

    // Visible bounds in world coordinate space
    const minVisibleX = -panOffset.x / zoom;
    const maxVisibleX = (CANVAS_W - 24 - panOffset.x) / zoom;
    const minVisibleY = -panOffset.y / zoom;
    const maxVisibleY = (CANVAS_H - 24 - panOffset.y) / zoom;

    const startX = Math.floor(minVisibleX / minorSpacing) * minorSpacing;
    const endX = Math.ceil(maxVisibleX / minorSpacing) * minorSpacing;
    const startY = Math.floor(minVisibleY / minorSpacing) * minorSpacing;
    const endY = Math.ceil(maxVisibleY / minorSpacing) * minorSpacing;

    // Draw rulers tick marks and labels in screen space
    ctx.save();
    ctx.fillStyle = 'var(--blue-300)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'var(--blue-700)';
    ctx.lineWidth = 1;

    // Top ruler ticks & labels
    for (let x = Math.floor(startX / majorSpacing) * majorSpacing; x <= endX; x += majorSpacing) {
      const screenX = 24 + panOffset.x + x * zoom;
      if (screenX >= 24 && screenX <= CANVAS_W) {
        ctx.beginPath();
        ctx.moveTo(screenX, 15); ctx.lineTo(screenX, 24);
        ctx.stroke();

        const valM = x / CELL_PX * metersPerCell;
        ctx.fillText(`${valM.toFixed(0)}m`, screenX, 8);
      }
    }

    // Left ruler ticks & labels
    ctx.textAlign = 'right';
    for (let y = Math.floor(startY / majorSpacing) * majorSpacing; y <= endY; y += majorSpacing) {
      const screenY = 24 + panOffset.y + y * zoom;
      if (screenY >= 24 && screenY <= CANVAS_H) {
        ctx.beginPath();
        ctx.moveTo(15, screenY); ctx.lineTo(24, screenY);
        ctx.stroke();

        const valM = y / CELL_PX * metersPerCell;
        ctx.fillText(`${valM.toFixed(0)}m`, 20, screenY);
      }
    }
    ctx.restore();

    // ── Apply Clip & Transform for drawing area ──────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(24, 24, CANVAS_W - 24, CANVAS_H - 24);
    ctx.clip();

    ctx.translate(24 + panOffset.x, 24 + panOffset.y);
    ctx.scale(zoom, zoom);

    if (compareMode && generatedImageObjRef.current) {
      ctx.drawImage(generatedImageObjRef.current, 0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = 'rgba(10, 15, 10, 0.45)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#0A0F0A'; // Raised background
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // ── Background map image (tracing paper) ──
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

    // ── Two-tier Grid ────────────────────────────────────────────────────────
    // Minor lines (20% opacity sky-blue)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 0.6;
    for (let x = startX; x <= endX; x += minorSpacing) {
      if (Math.abs(x % majorSpacing) < 0.01) continue;
      ctx.beginPath(); ctx.moveTo(x, minVisibleY); ctx.lineTo(x, maxVisibleY); ctx.stroke();
    }
    for (let y = startY; y <= endY; y += minorSpacing) {
      if (Math.abs(y % majorSpacing) < 0.01) continue;
      ctx.beginPath(); ctx.moveTo(minVisibleX, y); ctx.lineTo(maxVisibleX, y); ctx.stroke();
    }

    // Major lines (45% opacity sky-blue)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.0;
    for (let x = Math.floor(startX / majorSpacing) * majorSpacing; x <= endX; x += majorSpacing) {
      ctx.beginPath(); ctx.moveTo(x, minVisibleY); ctx.lineTo(x, maxVisibleY); ctx.stroke();
    }
    for (let y = Math.floor(startY / majorSpacing) * majorSpacing; y <= endY; y += majorSpacing) {
      ctx.beginPath(); ctx.moveTo(minVisibleX, y); ctx.lineTo(maxVisibleX, y); ctx.stroke();
    }

    // Snapping vertex detection
    const allVertices = [...plotPoints, ...sitePoints];
    const snappedToVertex = drawMode && hoverPoint && allVertices.some(v => Math.hypot(v.x - hoverPoint.x, v.y - hoverPoint.y) < 0.1);
    const snappedToGrid = drawMode && hoverPoint && (hoverPoint.x % minorSpacing === 0 && hoverPoint.y % minorSpacing === 0);

    // ── Alignment guides ──────────────────────────────────────────────────
    if (drawMode && hoverPoint) {
      const guidePts = [...plotPoints, ...sitePoints];
      const guideColor = drawMode === 'plot' ? '#f9731640' : '#00f0ff40';
      ctx.save();
      ctx.strokeStyle = guideColor; ctx.lineWidth = 0.5; ctx.setLineDash([4, 4]);
      guidePts.forEach(p => {
        if (Math.abs(p.x - hoverPoint.x) < 4) { ctx.beginPath(); ctx.moveTo(p.x, minVisibleY); ctx.lineTo(p.x, maxVisibleY); ctx.stroke(); }
        if (Math.abs(p.y - hoverPoint.y) < 4) { ctx.beginPath(); ctx.moveTo(minVisibleX, p.y); ctx.lineTo(maxVisibleX, p.y); ctx.stroke(); }
      });
      ctx.restore();
    }

    // ── Plot boundary ─────────────────────────────────────────────────────
    if (plotPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(plotPoints[0].x, plotPoints[0].y);
      for (let i = 1; i < plotPoints.length; i++) ctx.lineTo(plotPoints[i].x, plotPoints[i].y);
      if (plotClosed) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(249, 115, 22, 0.03)'; ctx.fill();
        ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2.5; ctx.stroke();
      } else {
        if (drawMode === 'plot' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
        ctx.strokeStyle = '#f97316aa'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Vertex dots on plot polygon lines
      if (plotClosed) {
        plotPoints.forEach((p, i) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#0A0F0A';
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.fill(); ctx.stroke();
        });
      }

      // Midpoint Handles
      if (plotClosed && !drawMode) {
        for (let i = 0; i < plotPoints.length; i++) {
          const a = plotPoints[i], b = plotPoints[(i + 1) % plotPoints.length];
          const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
          const isSelected = selectedEdge?.list === 'plot' && selectedEdge.index === i;
          
          ctx.fillStyle = isSelected ? '#3b82f6' : '#0A0F0A';
          ctx.strokeStyle = isSelected ? '#60a5fa' : '#f97316';
          ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2);
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.fill(); ctx.stroke();

          ctx.strokeStyle = isSelected ? '#3b82f6' : '#f97316';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx - 3, my); ctx.lineTo(mx + 3, my);
          ctx.moveTo(mx, my - 3); ctx.lineTo(mx, my + 3);
          ctx.stroke();
        }
      }

      // Edge labels with solid background chips
      if (plotClosed) {
        for (let i = 0; i < plotPoints.length; i++) {
          const a = plotPoints[i], b = plotPoints[(i + 1) % plotPoints.length];
          const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
          const distPx = Math.hypot(b.x - a.x, b.y - a.y);
          const dM = (distPx / CELL_PX * metersPerCell).toFixed(1);

          ctx.save();
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const labelText = `${dM}m`;
          const tw = ctx.measureText(labelText).width;
          
          ctx.fillStyle = '#0A0F0A';
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(mx - tw / 2 - 4, my - 8, tw + 8, 16, 4);
          ctx.fill(); ctx.stroke();

          ctx.fillStyle = '#fb923c'; ctx.fillText(labelText, mx, my);
          ctx.restore();
        }
      }
    }

    // ── Site Exterior / Setbacks ──────────────────────────────────────────
    if (sitePoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(sitePoints[0].x, sitePoints[0].y);
      for (let i = 1; i < sitePoints.length; i++) ctx.lineTo(sitePoints[i].x, sitePoints[i].y);
      if (siteClosed) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 240, 255, 0.02)'; ctx.fill();
        ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        if (drawMode === 'site' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
        ctx.strokeStyle = '#00f0ffaa'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Vertex dots on site polygon lines
      if (siteClosed) {
        sitePoints.forEach((p) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#0A0F0A';
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 2;
          ctx.fill(); ctx.stroke();
        });
      }

      // Midpoint Handles for Site Exterior
      if (siteClosed && !drawMode) {
        for (let i = 0; i < sitePoints.length; i++) {
          const a = sitePoints[i], b = sitePoints[(i + 1) % sitePoints.length];
          const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
          const isSelected = selectedEdge?.list === 'site' && selectedEdge.index === i;
          
          ctx.fillStyle = isSelected ? '#3b82f6' : '#0A0F0A';
          ctx.strokeStyle = isSelected ? '#60a5fa' : '#00f0ff';
          ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2);
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.fill(); ctx.stroke();

          ctx.strokeStyle = isSelected ? '#3b82f6' : '#00f0ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx - 3, my); ctx.lineTo(mx + 3, my);
          ctx.moveTo(mx, my - 3); ctx.lineTo(mx, my + 3);
          ctx.stroke();
        }
      }

      // Edge labels for site exterior
      if (siteClosed) {
        for (let i = 0; i < sitePoints.length; i++) {
          const a = sitePoints[i], b = sitePoints[(i + 1) % sitePoints.length];
          const mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
          const distPx = Math.hypot(b.x - a.x, b.y - a.y);
          const dM = (distPx / CELL_PX * metersPerCell).toFixed(1);

          ctx.save();
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const labelText = `${dM}m`;
          const tw = ctx.measureText(labelText).width;
          
          ctx.fillStyle = '#0A0F0A';
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(mx - tw / 2 - 4, my - 8, tw + 8, 16, 4);
          ctx.fill(); ctx.stroke();

          ctx.fillStyle = '#67e8f9'; ctx.fillText(labelText, mx, my);
          ctx.restore();
        }
      }
    }

    // ── Divider Lines ─────────────────────────────────────────────────────
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
    dividerLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
      ctx.stroke();
    });
    if (currentDivider.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentDivider[0].x, currentDivider[0].y);
      for (let i = 1; i < currentDivider.length; i++) ctx.lineTo(currentDivider[i].x, currentDivider[i].y);
      if (drawMode === 'divider' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      ctx.stroke();
      
      currentDivider.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6'; ctx.fill();
      });
    }

    // ── Stairs / Lift Core Marker ─────────────────────────────────────────
    if (coreMarker) {
      ctx.save();
      ctx.translate(coreMarker.x, coreMarker.y);
      
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.fillRect(-20, -20, 40, 40);
      
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.strokeRect(-20, -20, 40, 40);
      
      ctx.beginPath();
      ctx.moveTo(-20, -20); ctx.lineTo(20, 20);
      ctx.moveTo(-20, 20); ctx.lineTo(20, -20);
      ctx.strokeStyle = '#06b6d455';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#67e8f9';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CORE', 0, 0);
      ctx.restore();
    }

    // ── Snap indicator & cursor pulse ─────────────────────────────────────
    if (drawMode && hoverPoint && (snappedToVertex || snappedToGrid)) {
      ctx.save();
      const pulseTime = Date.now() / 150;
      const radius = 6 + Math.sin(pulseTime) * 3;
      ctx.strokeStyle = 'var(--blue-500)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, radius, 0, Math.PI * 2); ctx.stroke();
      
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, radius + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // ── Line length annotation (while drawing) ────────────────────────────
    if (drawMode && hoverPoint) {
      const pts = drawMode === 'plot' ? plotPoints : drawMode === 'site' ? sitePoints : currentDivider;
      const color = drawMode === 'plot' ? '#f97316' : drawMode === 'site' ? '#00f0ff' : '#3b82f6';
      const colorLight = drawMode === 'plot' ? '#fb923c' : drawMode === 'site' ? '#67e8f9' : '#93c5fd';

      if (pts.length > 0) {
        const lastPt = pts[pts.length - 1];
        const dx = hoverPoint.x - lastPt.x, dy = hoverPoint.y - lastPt.y;
        const distPx = Math.hypot(dx, dy);
        const distM = (distPx / CELL_PX * metersPerCell).toFixed(1);

        if (distPx > 3) {
          const midX = (lastPt.x + hoverPoint.x) / 2;
          const midY = (lastPt.y + hoverPoint.y) / 2;

          const angleDeg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
          const isH = angleDeg < 6 || angleDeg > 174;
          const isV = Math.abs(angleDeg - 90) < 6;
          const snapHint = isH ? ' ↔ H' : isV ? ' ↕ V' : '';
          const label = `${distM}m${snapHint}`;

          const norm = distPx > 0
            ? { x: -dy / distPx * 18, y: dx / distPx * 18 }
            : { x: 0, y: -18 };

          ctx.save();
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = 'bold 11px monospace';
          const tw = ctx.measureText(label).width;
          const bw = tw + 14, bh = 20;

          ctx.fillStyle = '#0A0F0A';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midX + norm.x - bw / 2, midY + norm.y - bh / 2, bw, bh, 4);
          ctx.fill(); ctx.stroke();

          ctx.fillStyle = colorLight;
          ctx.fillText(label, midX + norm.x, midY + norm.y);
          ctx.restore();
        }
      }
    }

    ctx.restore(); // Restore scale/translate transform

    // ── Status hint bar (Renders in screen space at bottom of canvas viewport) ─
    if (drawMode) {
      ctx.save();
      ctx.fillStyle = 'rgba(5, 15, 5, 0.85)';
      ctx.fillRect(24, CANVAS_H - 24, CANVAS_W - 24, 24);
      ctx.strokeStyle = 'var(--blue-700)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(24, CANVAS_H - 24); ctx.lineTo(CANVAS_W, CANVAS_H - 24); ctx.stroke();
      
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = drawMode === 'plot' ? '#f97316' : drawMode === 'site' ? '#00f0ff' : drawMode === 'divider' ? '#3b82f6' : drawMode === 'core' ? '#06b6d4' : '#eab308';
      ctx.fillText(
        drawMode === 'plot'
          ? '● Drawing: PLOT BOUNDARY — click to add points, click first point to close'
          : drawMode === 'site'
            ? '● Drawing: SITE EXTERIOR — click to add points, click first point to close'
            : drawMode === 'divider'
              ? '● Drawing: DIVIDER LINES — click once to start line, click again to finish line'
              : drawMode === 'core'
                ? '● Placing: STAIRS/LIFT CORE — click anywhere to place the core marker'
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
  }, [plotPoints, sitePoints, plotClosed, siteClosed, dividerLines, currentDivider, coreMarker, hoverPoint, drawMode, isGeneratingImage, CANVAS_W, CANVAS_H, currentRatio, metersPerCell, bgImageLoaded, bgOpacity, bgOffset, bgScale, compareMode, selectedEdge, draggingPoint, zoom, panOffset, isCanvasPopupOpen]);

  useEffect(() => {
    // Re-draw when canvas remounts after hiding the generated image or when deps change
    if (!showGeneratedImage) {
      requestAnimationFrame(drawCanvas);
    }
  }, [drawCanvas, showGeneratedImage]);

  useEffect(() => {
    if (generatedImageUrl) {
      const img = new Image();
      img.onload = () => { generatedImageObjRef.current = img; drawCanvas(); };
      img.src = generatedImageUrl;
    } else {
      generatedImageObjRef.current = null;
      drawCanvas();
    }
  }, [generatedImageUrl, drawCanvas]);

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
  }, [drawMode, bgImageLoaded, isCanvasPopupOpen]);

  // Converts a mouse event to canvas coordinates, accounting for
  // object-contain letterboxing (empty bars on sides or top/bottom).
  // Converts a mouse event to canvas coordinates, accounting for
  // object-contain letterboxing (empty bars on sides or top/bottom),
  // ruler gutters, and zoom/pan scale transformations.
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const displayScale = Math.min(rect.width / CANVAS_W, rect.height / CANVAS_H);
    const offsetX = (rect.width - CANVAS_W * displayScale) / 2;
    const offsetY = (rect.height - CANVAS_H * displayScale) / 2;

    // 1. Convert to absolute pixel space of canvas element
    const clientX = (e.clientX - rect.left - offsetX) / displayScale;
    const clientY = (e.clientY - rect.top - offsetY) / displayScale;

    // 2. Subtract 24px ruler offset, divide by zoom, and subtract panOffset
    const worldX = (clientX - 24 - panOffset.x) / zoom;
    const worldY = (clientY - 24 - panOffset.y) / zoom;

    // 3. Grid Snapping: snap to nearest half-meter cell spacing in canvas pixels
    const minorSpacing = (0.5 / metersPerCell) * CELL_PX;
    let snapX = Math.round(worldX / minorSpacing) * minorSpacing;
    let snapY = Math.round(worldY / minorSpacing) * minorSpacing;

    // 4. Vertex Snapping: snap to any existing vertices if within snap tolerance
    const allPoints = [...plotPoints, ...sitePoints];
    for (const pt of allPoints) {
      const dist = Math.hypot(pt.x - worldX, pt.y - worldY);
      if (dist < 12 / zoom) {
        snapX = pt.x;
        snapY = pt.y;
        break;
      }
    }

    return { x: snapX, y: snapY };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingPoint || isPanning) return;
    if (!['plot', 'site', 'divider', 'core'].includes(drawMode || '')) return;
    const { x, y } = getCanvasCoords(e);

    if (drawMode === 'core') {
      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
      setCoreMarker({ x, y });
      setDrawMode(null);
      return;
    }

    if (drawMode === 'divider') {
      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
      if (currentDivider.length === 1) {
        setDividerLines(prev => [...prev, [currentDivider[0], { x, y }]]);
        setCurrentDivider([]);
        return;
      }
      setCurrentDivider([{ x, y }]);
      return;
    }

    if (drawMode === 'plot' && !plotClosed) {
      if (plotPoints.length >= 3) {
        const dx = x - plotPoints[0].x, dy = y - plotPoints[0].y;
        if (Math.hypot(dx, dy) < 15) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
          setPlotClosed(true); setDrawMode(null); return;
        }
      }
      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
      setPlotPoints(prev => [...prev, { x, y }]);
      setActivePreset(null);
    }
    if (drawMode === 'site' && !siteClosed) {
      if (sitePoints.length >= 3) {
        const dx = x - sitePoints[0].x, dy = y - sitePoints[0].y;
        if (Math.hypot(dx, dy) < 15) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
          setSiteClosed(true); setDrawMode(null); return;
        }
      }
      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
      setSitePoints(prev => [...prev, { x, y }]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);

    if (isSpacePressed || drawMode === 'map') {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!drawMode) {
      for (let i = 0; i < plotPoints.length; i++) {
        const pt = plotPoints[i];
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < 12 / zoom) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
          setDraggingPoint({ list: 'plot', index: i });
          return;
        }
      }
      for (let i = 0; i < sitePoints.length; i++) {
        const pt = sitePoints[i];
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < 12 / zoom) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
          setDraggingPoint({ list: 'site', index: i });
          return;
        }
      }

      if (plotClosed && plotPoints.length >= 3) {
        for (let i = 0; i < plotPoints.length; i++) {
          const p1 = plotPoints[i];
          const p2 = plotPoints[(i + 1) % plotPoints.length];
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          if (Math.hypot(mx - coords.x, my - coords.y) < 12 / zoom) {
            setSelectedEdge({ list: 'plot', index: i });
            return;
          }
        }
      }

      if (siteClosed && sitePoints.length >= 3) {
        for (let i = 0; i < sitePoints.length; i++) {
          const p1 = sitePoints[i];
          const p2 = sitePoints[(i + 1) % sitePoints.length];
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          if (Math.hypot(mx - coords.x, my - coords.y) < 12 / zoom) {
            setSelectedEdge({ list: 'site', index: i });
            return;
          }
        }
      }
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning && lastMousePos.current) {
      // Panning is locked
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const coords = getCanvasCoords(e);

    if (draggingPoint) {
      if (draggingPoint.list === 'plot') {
        setPlotPoints(prev => {
          const next = [...prev];
          next[draggingPoint.index] = coords;
          return next;
        });
      } else {
        setSitePoints(prev => {
          const next = [...prev];
          next[draggingPoint.index] = coords;
          return next;
        });
      }
      return;
    }

    if (drawMode === 'map' && isDraggingMap && lastMousePos.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setBgOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else {
      setHoverPoint(coords);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      lastMousePos.current = null;
      return;
    }

    if (drawMode === 'map') {
      setIsDraggingMap(false);
      lastMousePos.current = null;
      return;
    }

    if (draggingPoint) {
      setDraggingPoint(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Zoom is locked — do nothing
    e.preventDefault();
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

  // ── Generate Concept Floor Plan via Grok Edit ─────────────────────────────
  const generateConceptImage = async () => {
    const plotPts = plotClosed ? plotPoints : [];
    const sitePts = (siteClosed || sitePoints.length >= 3) ? sitePoints : plotPts;
    const activePts = sitePts.length > 0 ? sitePts : plotPts;

    if (activePts.length < 3) {
      setGenerationError('No polygon traced — please trace your site boundary first');
      return;
    }

    setIsGeneratingImage(true);
    setGenerationError(null);
    setShowGeneratedImage(false);
    setStage1ImageUrl(null);
    setPipelineStage(isPipeline ? 'stage1' : 'idle');

    try {
      const { base64: traceCanvasBase64, numRegions } = exportBlackWhiteRedTraceForAI(activePts, CANVAS_W, CANVAS_H, currentRatio.falSize, dividerLines, coreMarker);
      setDebugStep2TraceImage(traceCanvasBase64);
      const plotInfo = getPlotContext();

      const res = await fetch('/api/generate-concept-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          traceCanvasBase64, buildingType, roomConfig, workflow, plotInfo, flatCount,
          hasDividers: dividerLines.length > 0,
          hasCore: !!coreMarker,
          numRegions
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Concept generation failed');

      setDebugStep2SystemPrompt(data.systemPrompt || '');
      setDebugStep2UserPrompt(data.userPrompt || '');

      if (isPipeline && data.stage1ImageUrl) {
        setStage1ImageUrl(data.stage1ImageUrl);
        setPipelineStage('stage2');
      }

      const rawUrls: string[] = data.imageUrls || [];
      setGeneratedImageUrls(rawUrls);
      setActiveImageIndex(0);
      setShowGeneratedImage(true);
    } catch (err: any) {
      setGenerationError('Concept generation failed: ' + err.message);
      console.error('[ConceptGenerator] Error:', err);
    } finally {
      setIsGeneratingImage(false);
      setPipelineStage('idle');
    }
  };

  const selectLayoutOption = async (optionName: string) => {
    setLayoutOptions(null); // Clear options
    setIsLoading(true);
    const userMsg: ChatMessage = { role: 'user', content: `Please generate the room schedule using Option: "${optionName}".` };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    try {
      const res = await fetch('/api/smart-planner-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          plotBoundary: getPlotContext(),
          plotPoints: plotPoints.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) })),
          sitePoints: sitePoints.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) })),
          shapePreset: activePreset,
        }),
      });
      const data = await res.json();

      if (data.roomSchedule?.confirmed) {
        const sched = data.roomSchedule as RoomSchedule;
        setRoomSchedule(sched);
      }

      if (data.layoutOptions) {
        setLayoutOptions(data.layoutOptions);
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

  // ── Send chat message ────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: inputText.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInputText(''); setIsLoading(true);
    setGenerationError(null);
    setLayoutOptions(null); // Clear options on fresh text

    try {
      const res = await fetch('/api/smart-planner-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          plotBoundary: getPlotContext(),
          plotPoints: plotPoints.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) })),
          sitePoints: sitePoints.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) })),
          shapePreset: activePreset,
        }),
      });
      const data = await res.json();

      if (data.roomSchedule?.confirmed) {
        const sched = data.roomSchedule as RoomSchedule;
        setRoomSchedule(sched);
      }

      if (data.layoutOptions) {
        setLayoutOptions(data.layoutOptions);
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

  if (!selectedProjectId) {
    return (
      <div className="min-h-screen bg-[#040805] bg-gemini-glow text-[var(--blue-500)] font-sans p-8 relative flex flex-col w-full h-full overflow-y-auto select-none">
        {/* Tech grid texture */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none z-0" />
        
        {/* Header */}
        <header className="relative z-10 max-w-7xl mx-auto w-full flex items-center justify-between mb-12 border-b border-blue-900/30 pb-6 shrink-0">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => router.push('/')}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-blue-900/40 hover:border-blue-400 hover:bg-blue-950/20 transition-all group cursor-pointer"
            >
              <ArrowLeft className="text-[var(--blue-500)]/70 group-hover:text-blue-300" size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-[4px] uppercase text-white flex items-center gap-3">
                <Folder className="text-blue-400" /> 
                <span className="text-gradient-blue-cyan text-glow-blue">Concept Projects</span>
              </h1>
              <span className="text-[9px] tracking-[3px] text-blue-500/70 uppercase tracking-widest font-sans font-bold">
                AI Layout Design Portal
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold uppercase tracking-widest text-[10px] rounded-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:shadow-[0_0_25px_rgba(16,185,129,0.35)] cursor-pointer"
          >
            <Plus size={16} /> New Concept Project
          </button>
        </header>

        {/* Project List / Empty State */}
        <main className="relative z-10 max-w-7xl mx-auto w-full flex-1 flex flex-col">
          {projectsList.length === 0 ? (
            <div className="relative w-full max-w-7xl mx-auto flex flex-col items-center pt-[12vh] flex-1">
              {/* Ghosted Background Cards */}
              <div className="absolute inset-x-0 top-[12vh] grid grid-cols-1 md:grid-cols-3 gap-6 opacity-15 pointer-events-none select-none">
                {[1, 2, 3].map((i) => (
                  <div 
                    key={i}
                    className="bg-[#0b160b]/40 border border-blue-900/30 rounded-lg p-4 flex flex-col gap-3"
                  >
                    <div className="w-full h-36 bg-black/60 border border-blue-950 rounded flex items-center justify-center overflow-hidden relative shrink-0">
                      <div className="w-8 h-8 rounded-full border border-dashed border-blue-900/30" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between gap-2">
                      <div className="space-y-1">
                        <div className="h-3 bg-blue-900/40 rounded w-2/3" />
                        <div className="h-2.5 bg-blue-900/20 rounded w-1/2" />
                      </div>
                      <div className="border-t border-blue-900/20 pt-2 flex justify-between">
                        <div className="h-2 bg-blue-900/30 rounded w-1/4" />
                        <div className="h-2 bg-blue-900/30 rounded w-1/5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Central Active Empty State Card */}
              <div className="relative z-10 w-full max-w-[480px] glass-panel rounded-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col items-center text-center mt-[4vh]">
                <svg className="w-20 h-20 text-cyan-400 mb-6" viewBox="0 0 100 100" fill="none">
                  <path 
                    d="M 15 80 L 15 25 L 55 25 L 55 50 L 85 50 L 85 80 Z" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="animate-trace-plot"
                  />
                </svg>
                <h2 className="text-sm tracking-[3px] uppercase text-blue-300 font-bold mb-2 font-sans">No Concept Projects</h2>
                <p className="text-[10px] tracking-wider uppercase text-blue-500/70 mb-6 max-w-[320px] font-sans">
                  Initialize a new project to layout boundaries, divide flats, and generate concept architecture
                </p>
                <button 
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] text-[10px] text-white font-bold uppercase tracking-widest rounded-lg transition-all cursor-pointer font-sans"
                >
                  CREATE PROJECT
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectsList.map((p) => {
                const hasImg = p.state?.generatedImageUrls?.length > 0;
                const imgThumb = hasImg ? p.state.generatedImageUrls[0] : null;
                
                return (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className="group relative glass-card rounded-xl p-4 flex flex-col gap-3 cursor-pointer shadow-md shadow-black/40"
                  >
                    {/* Thumbnail area */}
                    <div className="w-full h-36 bg-[#02040a]/80 border border-blue-900/40 rounded-lg flex items-center justify-center overflow-hidden relative shrink-0">
                      {imgThumb ? (
                        <img 
                          src={imgThumb} 
                          alt={p.name} 
                          className="w-full h-full object-contain opacity-70 group-hover:opacity-95 group-hover:scale-102 transition-all duration-500" 
                        />
                      ) : (
                        <Map size={36} className="text-blue-500/20 group-hover:text-blue-400/45 group-hover:scale-105 transition-all duration-300" />
                      )}
                      
                      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => deleteProject(p.id, e)}
                          className="w-7 h-7 rounded-lg bg-black/80 border border-red-900/60 flex items-center justify-center text-red-400 hover:bg-red-950/80 hover:text-red-300 transition-all cursor-pointer"
                          title="Delete Project"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-between gap-2 font-sans">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase group-hover:text-blue-300 transition-colors tracking-wider line-clamp-1">{p.name}</h3>
                        <div className="flex items-center gap-1 mt-1 text-[9px] text-blue-500/70 uppercase">
                          <MapPin size={10} />
                          <span className="line-clamp-1">{p.location}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between border-t border-blue-900/20 pt-2.5 text-[8px] text-blue-500/50 uppercase tracking-widest font-bold">
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-blue-300 font-bold">
                          {p.state?.buildingType === 'multi-residential' ? `${p.state?.roomConfig?.toUpperCase() || 'Auto'}` : 'Single Unit'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="glass-panel rounded-xl max-w-sm w-full p-6 space-y-4 shadow-[0_12px_40px_rgba(0,0,0,0.6)] animate-modal-entry">
              <div className="flex justify-between items-center border-b border-blue-900/30 pb-2">
                <h3 className="text-xs font-bold text-gradient-blue-cyan uppercase tracking-widest font-sans">Initialize Concept</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-blue-500/70 hover:text-white cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-3 font-sans">
                <div className="space-y-1">
                  <label className="text-[9px] text-blue-500/60 uppercase tracking-wider font-bold">Project Name</label>
                  <input
                    ref={modalNameInputRef}
                    type="text"
                    placeholder="e.g. Vasai-Virar Heights"
                    value={projNameInput}
                    onChange={(e) => setProjNameInput(e.target.value)}
                    className="w-full bg-black/40 border border-blue-900/35 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-blue-950/60 focus:outline-none transition-all"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[9px] text-blue-500/60 uppercase tracking-wider font-bold">Location / Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Vasai Road East"
                    value={projLocationInput}
                    onChange={(e) => setProjLocationInput(e.target.value)}
                    className="w-full bg-black/40 border border-blue-900/35 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-blue-950/60 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] text-blue-500/60 uppercase tracking-wider font-bold">Target Plot Area (sqm - optional)</label>
                  <input
                    type="number"
                    placeholder="e.g. 350 (pre-sizes drawing grid)"
                    value={projPlotAreaInput}
                    onChange={(e) => setProjPlotAreaInput(e.target.value)}
                    className="w-full bg-black/40 border border-blue-900/35 focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-white placeholder-blue-950/60 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-blue-900/30 font-sans">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-transparent border border-blue-900/40 text-blue-400 hover:text-white rounded-lg text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={createNewProject}
                  disabled={!projNameInput.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:from-blue-950/20 disabled:to-blue-950/30 disabled:border-blue-900/30 disabled:text-blue-900/40 disabled:cursor-not-allowed rounded-lg text-[10px] uppercase tracking-widest font-bold cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Reusable canvas mode toolbar component shared between split-screen canvas and fullscreen modal popup
  const renderToolbar = (isPopup: boolean) => {
    return (
      <>
        {/* CLUSTER 1: DRAW TOOLS */}
        <div className="flex items-center gap-2 pr-4 border-r border-[var(--blue-700)]/45">
          <span className="text-[9px] tracking-[2px] uppercase text-[var(--blue-500)] mr-1 font-bold font-sans">Draw:</span>
          
          {/* SITE EXTERIOR */}
          <button
            onClick={() => setDrawMode(d => d === 'site' ? null : 'site')}
            disabled={siteClosed}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold cursor-pointer font-sans ${
              drawMode === 'site' 
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]' 
                : siteClosed 
                  ? 'border-[var(--blue-700)]/30 text-[var(--blue-500)]/35 cursor-not-allowed opacity-45' 
                  : 'border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)]'
            }`}
            title="Shortcut: S"
          >
            <span className={`w-2 h-2 rounded-full inline-block ${siteClosed ? 'bg-[var(--blue-500)]' : 'bg-cyan-400'}`} />
            <span>Site Ext {siteClosed ? '✓' : ''}</span>
            <kbd className="text-[8px] bg-black/40 px-1 rounded text-cyan-400/80 font-sans">S</kbd>
          </button>

          {/* DIVIDERS */}
          <button
            onClick={() => setDrawMode(d => d === 'divider' ? null : 'divider')}
            disabled={!siteClosed}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold cursor-pointer font-sans ${
              drawMode === 'divider' 
                ? 'bg-blue-500/25 border-blue-400 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.25)]' 
                : !siteClosed 
                  ? 'border-[var(--blue-700)]/20 text-[var(--blue-500)]/25 cursor-not-allowed font-sans'
                  : 'border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)]'
            }`}
            title="Shortcut: D"
          >
            <span className={`w-2 h-2 rounded-full inline-block ${dividerLines.length > 0 ? 'bg-[var(--blue-500)]' : 'bg-blue-400'}`} />
            <span>Dividers {dividerLines.length > 0 ? '✓' : ''}</span>
            <kbd className="text-[8px] bg-black/40 px-1 rounded text-blue-400/80 font-sans">D</kbd>
          </button>

          {/* STAIRS-LIFT */}
          <button
            onClick={() => setDrawMode(d => d === 'core' ? null : 'core')}
            disabled={!siteClosed}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold cursor-pointer font-sans ${
              drawMode === 'core' 
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]' 
                : !siteClosed 
                  ? 'border-[var(--blue-700)]/20 text-[var(--blue-500)]/25 cursor-not-allowed font-sans'
                  : 'border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)]'
            }`}
            title="Shortcut: L"
          >
            <span className={`w-2.5 h-2.5 rounded-sm inline-block ${coreMarker ? 'bg-[var(--blue-500)]' : 'bg-cyan-400'}`} />
            <span>Stairs-Lift {coreMarker ? '✓' : ''}</span>
            <kbd className="text-[8px] bg-black/40 px-1 rounded text-cyan-400/80 font-sans">L</kbd>
          </button>
        </div>

        {/* CLUSTER 2: HISTORY */}
        <div className="flex items-center gap-2 pr-4 border-r border-[var(--blue-700)]/45">
          <button
            onClick={undo}
            disabled={undoStack.current.length === 0}
            className={`p-1.5 rounded border transition-all cursor-pointer ${
              undoStack.current.length === 0 
                ? 'border-[var(--blue-700)]/20 text-[var(--blue-500)]/25 cursor-not-allowed' 
                : 'border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={12} />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.current.length === 0}
            className={`p-1.5 rounded border transition-all cursor-pointer ${
              redoStack.current.length === 0 
                ? 'border-[var(--blue-700)]/20 text-[var(--blue-500)]/25 cursor-not-allowed' 
                : 'border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={12} />
          </button>
        </div>

        {/* CLUSTER 3: VIEW & SETUP */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Scale metersPerCell */}
          <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded border border-[var(--blue-700)]/30">
            <span className="text-[8px] text-[var(--blue-500)]/80 uppercase font-bold tracking-wider font-sans">Scale:</span>
            <select
              value={metersPerCell}
              onChange={(e) => {
                setMetersPerCell(Number(e.target.value));
                pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
              }}
              className="bg-transparent text-[9px] text-[var(--blue-300)] focus:outline-none cursor-pointer font-sans border-0 p-0"
            >
              <option value="0.25" className="bg-[#0A0F0A]">1 Cell = 0.25m</option>
              <option value="0.5" className="bg-[#0A0F0A]">1 Cell = 0.50m</option>
              <option value="1" className="bg-[#0A0F0A]">1 Cell = 1.00m</option>
              <option value="2" className="bg-[#0A0F0A]">1 Cell = 2.00m</option>
            </select>
          </div>

          {/* Canvas ratio picker */}
          <div className="relative">
            <button
              onClick={() => setShowRatioPicker(p => !p)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)] transition-all font-bold cursor-pointer font-sans"
            >
              <span>Size: {currentRatio.label.split(' ')[0]}</span>
              <ChevronDown size={10} />
            </button>
            {showRatioPicker && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-[#0A0F0A] border border-[var(--blue-700)] rounded-lg shadow-2xl min-w-[120px] overflow-hidden">
                {CANVAS_RATIOS.map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setRatioId(r.id);
                      setShowRatioPicker(false);
                      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
                    }}
                    className={`w-full text-left px-3 py-2 text-[9px] hover:bg-[var(--blue-900)] text-[var(--blue-300)] flex justify-between items-center transition-colors cursor-pointer font-sans ${
                      r.id === ratioId ? 'bg-[var(--blue-900)]/40 font-bold' : ''
                    }`}
                  >
                    <span>{r.label}</span>
                    {r.id === ratioId && <span className="text-[var(--blue-500)]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preset Plots Picker */}
          <div className="relative">
            <button
              onClick={() => setShowShapePicker(p => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)] transition-all font-bold cursor-pointer font-sans"
            >
              <Pentagon size={11} className="text-[var(--blue-500)] animate-pulse" /> Presets
            </button>
            {showShapePicker && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-[#0A0F0A] border border-[var(--blue-700)] rounded shadow-2xl min-w-[150px] overflow-hidden">
                {[
                  { label: 'Rectangular Box', id: 'box' },
                  { label: 'L-Shape Plot', id: 'l-shape' },
                  { label: 'U-Shape Plot', id: 'u-shape' },
                  { label: 'T-Shape Plot', id: 't-shape' },
                  { label: 'Cruciform (Cross)', id: 'cruciform' },
                  { label: 'Circular Plot', id: 'circle' }
                ].map(shape => (
                  <button
                    key={shape.id}
                    onClick={() => {
                      loadPresetShape(shape.id as any);
                      setShowShapePicker(false);
                    }}
                    className="w-full text-left px-3 py-2 text-[9px] hover:bg-[var(--blue-900)] text-[var(--blue-300)] transition-colors cursor-pointer font-sans"
                  >
                    {shape.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Background Map / Tracing Paper */}
          <div className="flex items-center gap-1">
            <input type="file" accept="image/*" ref={bgInputRef} onChange={handleBgUpload} className="hidden" />
            {bgImageLoaded ? (
              <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded border border-[var(--blue-700)]/30">
                <button
                  onClick={() => setDrawMode(d => d === 'map' ? null : 'map')}
                  className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] uppercase rounded transition-all cursor-pointer font-sans ${drawMode === 'map' ? 'bg-yellow-500/20 text-yellow-300 font-bold' : 'text-[var(--blue-500)] hover:text-white'}`}
                  title="Pan and Zoom the background map"
                >
                  <Move size={10} /> Map
                </button>
                <input
                  type="range" min="0.1" max="1" step="0.1"
                  value={bgOpacity} onChange={e => setBgOpacity(Number(e.target.value))}
                  className="w-12 accent-[var(--blue-500)] cursor-pointer"
                  title="Map Opacity"
                />
                <button onClick={removeBgImage} className="text-red-500 hover:text-red-400 cursor-pointer" title="Remove Map">
                  <X size={10} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => bgInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)] transition-all font-bold cursor-pointer font-sans"
                title="Upload a map or plot image to trace over"
              >
                <ImagePlus size={11} /> Trace Map
              </button>
            )}
          </div>

          {/* Fit to Plot */}
          <button
            onClick={fitToPlot}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border border-[var(--blue-700)] text-[var(--blue-500)] hover:bg-[var(--blue-500)]/10 hover:text-[var(--blue-300)] transition-all font-bold cursor-pointer font-sans"
            title="Fit canvas to plot drawing bounds"
          >
            <Maximize2 size={11} /> Fit to Plot
          </button>

          {/* Toggle Fullscreen button inside split-screen toolbar */}
          {!isPopup && (
            <button
              onClick={() => setIsCanvasPopupOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border border-purple-500/40 text-purple-300 hover:bg-purple-950/20 hover:text-purple-200 transition-all font-bold cursor-pointer font-sans"
              title="Expand workspace to fullscreen popup"
            >
              <Maximize2 size={11} /> Fullscreen
            </button>
          )}

          {/* Zoom Slider Grid Minimizer/Maximizer removed as per user request to lock zoom */}

          {/* Reset */}
          <button
            onClick={() => {
              setPlotPoints([]); setSitePoints([]); setPlotClosed(false); setSiteClosed(false); setDrawMode(null); setRoomSchedule(null); setGeneratedImageUrls([]); setActiveImageIndex(0); setShowGeneratedImage(false); setCompareMode(false); setGenerationError(null); setActivePreset(null); undoStack.current = []; redoStack.current = [];
              // Reset other states
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-wider rounded border border-red-900/60 text-red-400 hover:bg-red-950/20 hover:text-red-300 transition-all font-bold cursor-pointer font-sans"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </>
    );
  };

  return (
    <main className="flex flex-col w-full h-screen bg-[#040805] bg-gemini-glow text-blue-400 font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-blue-900/25 bg-[#030714]/75 backdrop-blur-xl shrink-0 select-none">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedProjectId(null)} className="w-9 h-9 rounded-full border border-blue-900/40 hover:border-blue-400 hover:bg-blue-950/20 flex items-center justify-center transition-all cursor-pointer">
            <ArrowLeft size={16} className="text-blue-400" />
          </button>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-blue-500/70 uppercase tracking-widest font-mono font-bold mb-1">
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setSelectedProjectId(null)}>CONCEPTS</span>
              <span className="text-blue-900">/</span>
              <span className="text-white">{projectsList.find(p => p.id === selectedProjectId)?.name || 'Concept Project'}</span>
            </div>
            
            <h1 className="text-lg font-bold tracking-[4px] uppercase text-white flex items-center gap-2">
              {isEditingName ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={saveProjectName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveProjectName();
                    if (e.key === 'Escape') { setIsEditingName(false); setEditedName(projectsList.find(p => p.id === selectedProjectId)?.name || ''); }
                  }}
                  className="bg-white/5 border border-blue-500 text-white text-base px-2 py-0.5 rounded focus:outline-none"
                  autoFocus
                />
              ) : (
                <span 
                  onDoubleClick={() => {
                    setIsEditingName(true);
                    setEditedName(projectsList.find(p => p.id === selectedProjectId)?.name || 'Concept Project');
                  }}
                  className="hover:text-blue-300 cursor-pointer"
                  title="Double click to rename project"
                >
                  {projectsList.find(p => p.id === selectedProjectId)?.name || 'Concept Project'}
                </span>
              )}
              
              <span className="text-[9px] bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/40 text-blue-300 px-2 py-0.5 rounded font-mono uppercase tracking-normal select-none min-w-[64px] text-center inline-block">Concept</span>
              
              <span className="text-[8px] text-blue-700 uppercase tracking-widest font-mono ml-2 transition-all duration-300">
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {plotInfo && (
            <div className="flex items-center gap-4 text-[10px] border border-blue-900/30 rounded-lg px-3 py-1.5 bg-white/5 font-sans backdrop-blur-md">
              <span className="text-orange-400 uppercase tracking-wider font-bold">Plot: <strong className="text-white ml-0.5">{plotInfo.widthM}m &times; {plotInfo.heightM}m = {plotInfo.areaM} sqm</strong></span>
              {siteClosed && <span className="text-cyan-400 uppercase tracking-wider font-bold">Site: <strong className="text-white ml-0.5">{plotInfo.siteWidthM}m &times; {plotInfo.siteHeightM}m = {plotInfo.siteAreaM} sqm</strong></span>}
            </div>
          )}
          
          {generatedImageUrls.length > 1 && (
            <div className="flex items-center gap-1 border border-blue-900/30 rounded-lg p-1 bg-black/40 backdrop-blur-md">
              {generatedImageUrls.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setActiveImageIndex(idx);
                    setShowGeneratedImage(true);
                  }}
                  className={`px-3 py-1.5 text-[9px] uppercase tracking-widest rounded-lg transition-all cursor-pointer font-sans ${activeImageIndex === idx ? 'bg-blue-500/20 text-blue-300 font-bold' : 'text-blue-600 hover:bg-blue-950/20'}`}
                >
                  Option {idx + 1}
                </button>
              ))}
            </div>
          )}

          {generatedImageUrl && (
            <div className="flex items-center gap-1 border border-blue-900/30 rounded-lg p-1 bg-black/40 backdrop-blur-md">
              <button
                onClick={() => { setShowGeneratedImage(!showGeneratedImage); setCompareMode(false); }}
                className={`px-3 py-1.5 text-[9px] uppercase tracking-widest rounded-lg transition-all cursor-pointer font-sans ${showGeneratedImage && !compareMode ? 'bg-purple-500/20 text-purple-300' : 'text-blue-600 hover:bg-blue-950/20'}`}
              >
                <ImageIcon size={11} className="inline mr-1 mb-0.5" /> {showGeneratedImage && !compareMode ? 'Show Traces' : 'Floor Plan'}
              </button>
              <div className="w-px h-4 bg-blue-900/50"></div>
              <button
                onClick={() => { setCompareMode(!compareMode); setShowGeneratedImage(false); }}
                className={`px-3 py-1.5 text-[9px] uppercase tracking-widest rounded-lg transition-all cursor-pointer font-sans ${compareMode ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : 'text-blue-600 hover:bg-blue-950/20 border border-transparent'}`}
                title="Overlay the generated floor plan behind your traces to verify dimensions"
              >
                <RefreshCw size={11} className="inline mr-1 mb-0.5" /> Compare Traces
              </button>
            </div>
          )}

          {generatedImageUrl && (
            <button
              onClick={downloadImage}
              className="flex items-center gap-1 px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-widest bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white border border-blue-400/40 rounded-lg transition-all cursor-pointer font-sans shadow-lg shadow-blue-950/20"
            >
              <Download size={13} /> Download PNG
            </button>
          )}
        </div>
      </header>

      <div className="flex w-full flex-1 min-h-0">
        {/* Canvas / Image Panel */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-blue-900/25 bg-transparent select-none">
          {/* Mode toolbar */}
          <div className="sticky top-0 z-30 flex items-center gap-4 px-4 py-2 border-b border-blue-900/25 bg-[#040805]/70 backdrop-blur-md shrink-0 flex-wrap select-none">
            {renderToolbar(false)}
          </div>

          {/* Canvas or Generated Image */}
          <div
            className="flex-1 p-4 flex items-center justify-center relative bg-transparent select-none overflow-hidden"
          >
            {!isCanvasPopupOpen && (
              <button
                onClick={() => setIsCanvasPopupOpen(true)}
                className="absolute top-6 right-6 z-20 flex items-center gap-1.5 px-3 py-2 text-[9px] uppercase tracking-widest bg-black/75 border border-blue-500/35 text-blue-300 hover:text-white hover:border-blue-300 hover:bg-blue-950/70 rounded-lg transition-all font-bold shadow-2xl cursor-pointer backdrop-blur-sm"
                title="Expand tracing workspace to fullscreen popup modal"
              >
                <Maximize2 size={11} /> Fullscreen Workspace
              </button>
            )}

            {showGeneratedImage && generatedImageUrl ? (
              <img
                src={generatedImageUrl}
                alt="AI Generated Floor Plan"
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl shadow-blue-900/20 border border-blue-500/20"
              />
            ) : (
              !isCanvasPopupOpen && (
                <canvas
                  ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                  onWheel={handleWheel}
                  className={`max-w-full max-h-full object-contain bg-[#030704]/95 rounded-lg shadow-[0_0_50px_rgba(16,185,129,0.06)] border border-blue-900/30 ${drawMode === 'map' ? (isDraggingMap ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleCanvasMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={(e) => { setHoverPoint(null); handleMouseUp(); }}
                />
              )
            )}
          </div>
        </div>

        {/* Chat / Parameter Sidebar Panel */}
        <div className="w-[380px] border-l border-blue-900/35 bg-[#040805]/75 backdrop-blur-xl flex flex-col shrink-0">
          <div className="px-5 py-3 border-b border-blue-900/25 bg-transparent shrink-0 font-sans flex justify-between items-start">
            <div>
              <h2 className="text-[11px] font-bold tracking-[3px] uppercase text-blue-300 text-glow-blue">Concept Generator Panel</h2>
              <p className="text-[9px] text-blue-500/60 uppercase tracking-wider mt-0.5 font-bold">AI Floor Plan Generation Pipeline</p>
              
              <div className="flex items-center gap-1.5 mt-2.5 bg-white/5 px-2.5 py-1.5 rounded-lg border border-blue-900/20 font-sans backdrop-blur-md">
                <span className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-purple-950/40 text-purple-300 border border-purple-900/40">PIPELINE</span>
                <span className="text-[8.5px] text-[var(--blue-300)] font-bold">Grok</span>
                <span className="text-[8px] text-[var(--blue-700)]">&rarr;</span>
                <span className="text-[8.5px] text-[var(--blue-300)] font-bold">GPT Image 2 Edit</span>
              </div>
            </div>
            <button 
              onClick={() => setShowLogs(!showLogs)}
              className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest border rounded transition-all cursor-pointer shadow-lg ${showLogs ? 'bg-amber-500/20 border-amber-400 text-amber-300' : 'bg-black/50 border-blue-900/40 text-blue-400 hover:bg-blue-900/20'}`}
              title="View Generation Logs & Debug Data"
            >
              <Terminal size={11} className="inline mr-1" /> Logs
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 font-sans">
            {isGeneratingImage ? (
              <div className="border border-purple-500/20 bg-purple-950/5 rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-3 border-b border-purple-500/10 pb-3">
                  <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin shrink-0" />
                  <div>
                    <h4 className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">
                      {pipelineStage === 'stage2' ? 'Refining Output…' : 'Generating Concept…'}
                    </h4>
                    <span className="text-[8px] text-purple-500 uppercase tracking-wider font-mono">
                      {isPipeline
                        ? pipelineStage === 'stage1'
                          ? `Stage 1 / 2 — ${activeWf.stage1}`
                          : `Stage 2 / 2 — ${activeWf.stage2}`
                        : activeWf.stage1}
                    </span>
                  </div>
                </div>

                {isPipeline && (
                  <div className="flex items-center gap-2">
                    {[
                      { label: activeWf.stage1, done: pipelineStage === 'stage2' || pipelineStage === 'idle', active: pipelineStage === 'stage1' },
                      { label: activeWf.stage2 ?? '', done: false, active: pipelineStage === 'stage2' }
                    ].map((s, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full border flex items-center justify-center text-[7px] font-bold transition-all ${
                          s.done ? 'bg-blue-500 border-blue-400 text-black' :
                          s.active ? 'bg-purple-600 border-purple-400 text-white animate-pulse' :
                          'bg-black/50 border-purple-900/40 text-purple-800'
                        }`}>
                          {s.done ? '✓' : i + 1}
                        </div>
                        <span className={`text-[8.5px] font-bold uppercase tracking-wide ${
                          s.done ? 'text-blue-400' : s.active ? 'text-purple-300' : 'text-purple-900/50'
                        }`}>{s.label}</span>
                        {i === 0 && <span className="text-[var(--blue-700)] text-[8px]">→</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="bg-[#070e1a]/40 border border-[var(--blue-700)]/45 rounded-lg overflow-hidden transition-all">
                  <button 
                    onClick={() => {
                      const next = !isHowItWorksOpen;
                      setIsHowItWorksOpen(next);
                      localStorage.setItem('how_it_works_collapsed', String(!next));
                    }}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-[#070e1a]/80 text-[10px] font-bold text-[var(--blue-300)] uppercase tracking-widest hover:bg-[var(--blue-900)]/20 transition-colors cursor-pointer"
                  >
                    <span>How it works</span>
                    <span className="text-[10px] font-bold font-mono">{isHowItWorksOpen ? '−' : '+'}</span>
                  </button>
                  
                  {isHowItWorksOpen && (
                    <ul className="text-[9px] text-[var(--blue-500)]/80 list-disc pl-8 pr-4 py-3 space-y-1.5 border-t border-[var(--blue-700)]/20 bg-black/10">
                      <li>Trace your site boundary on the canvas.</li>
                      <li>Select a workflow — single model for speed, 2-model pipeline for best quality.</li>
                      <li>Click Generate. Stage 1 creates the raw floor plan, Stage 2 refines rooms.</li>
                    </ul>
                  )}
                </div>

                <div className="glass-card rounded-xl p-4 space-y-4 mt-4 border border-blue-900/35 shadow-lg">
                  <h3 className="text-[10px] font-bold text-gradient-blue-cyan uppercase tracking-widest border-b border-blue-900/25 pb-1">
                    Configure Layout Parameters:
                  </h3>

                  <div className="space-y-1.5 hidden">
                    <label className="text-[9px] uppercase text-blue-500/60 tracking-wider font-bold">Select AI Workflow</label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] uppercase text-blue-500/60 tracking-wider font-bold">Building Type</label>
                    <select
                      value={buildingType}
                      onChange={(e) => {
                        setBuildingType(e.target.value);
                        setRoomConfig('auto');
                      }}
                      className="w-full bg-black/40 hover:bg-white/5 border border-blue-900/25 focus:border-blue-500 rounded-lg px-3 py-2 text-[11px] text-blue-300 focus:outline-none transition-all cursor-pointer font-sans backdrop-blur-md"
                    >
                      <option value="multi-residential" className="bg-[#040805]">Multi-Unit Residential Building</option>
                      <option value="single-residential" className="bg-[#040805]">Single Private Residence (Bungalow)</option>
                      <option value="healthcare" className="bg-[#040805]">Healthcare Facility</option>
                      <option value="office" className="bg-[#040805]">Commercial Office Floor</option>
                    </select>
                  </div>

                  {buildingType === 'multi-residential' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase text-blue-500/60 tracking-wider font-bold">BHK Configuration</label>
                        <select
                          value={roomConfig}
                          onChange={(e) => setRoomConfig(e.target.value)}
                          className="w-full bg-black/40 hover:bg-white/5 border border-blue-900/25 focus:border-blue-500 rounded-lg px-3 py-2 text-[11px] text-blue-300 focus:outline-none transition-all cursor-pointer font-sans backdrop-blur-md"
                        >
                          <option value="auto" className="bg-[#040805]">Auto / Mix (1BHK-4BHK)</option>
                          <option value="1bhk" className="bg-[#040805]">Pure 1 BHK Units</option>
                          <option value="2bhk" className="bg-[#040805]">Pure 2 BHK Units</option>
                          <option value="3bhk" className="bg-[#040805]">Pure 3 BHK Units</option>
                          <option value="4bhk" className="bg-[#040805]">Pure 4 BHK Units</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase text-blue-500/60 tracking-wider font-bold">Number of Flats</label>
                        <select
                          value={flatCount}
                          onChange={(e) => setFlatCount(e.target.value)}
                          className="w-full bg-black/40 hover:bg-white/5 border border-blue-900/25 focus:border-blue-500 rounded-lg px-3 py-2 text-[11px] text-blue-300 focus:outline-none transition-all cursor-pointer font-sans backdrop-blur-md"
                        >
                          <option value="auto" className="bg-[#040805]">Auto (Determine by Size)</option>
                          <option value="1" className="bg-[#040805]">1 Flat</option>
                          <option value="2" className="bg-[#040805]">2 Flats</option>
                          <option value="3" className="bg-[#040805]">3 Flats</option>
                          <option value="4" className="bg-[#040805]">4 Flats</option>
                          <option value="5" className="bg-[#040805]">5 Flats</option>
                          <option value="6" className="bg-[#040805]">6 Flats</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {generationError && (
                  <div className="bg-red-950/20 border border-red-900/40 rounded-lg p-3 text-[10px] text-red-400 font-mono">
                    {generationError}
                  </div>
                )}

                {generatedImageUrl && (
                  <div className="border border-purple-500/25 rounded-lg bg-purple-950/15 p-4 space-y-3 glass-card shadow-[0_0_15px_rgba(168,85,247,0.06)]">
                    <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest flex items-center gap-2">
                      <Sparkles size={11} /> Concept Layout Generated!
                    </div>
                    <img src={generatedImageUrl} alt="Generated floor plan" className="w-full rounded border border-purple-900/30" />
                    <div className="flex gap-2 font-sans">
                      <button onClick={() => setShowGeneratedImage(true)} className="flex-1 text-[9px] uppercase tracking-widest text-purple-400 border border-purple-900/30 rounded-lg py-1.5 hover:bg-purple-500/10 transition-all font-bold cursor-pointer">
                        View Full Size
                      </button>
                      <button
                        onClick={generateConceptImage}
                        disabled={isGeneratingImage}
                        className="flex-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-amber-400 border border-amber-900/40 rounded-lg py-1.5 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold cursor-pointer"
                      >
                        <RefreshCw size={10} className={isGeneratingImage ? 'animate-spin' : ''} />
                        Regenerate
                      </button>
                    </div>

                    <div className="border-t border-purple-900/30 pt-3 space-y-2">
                      <div className="text-[8px] font-bold text-purple-400 uppercase tracking-wider">Send layout to workspace:</div>
                      <div className="grid grid-cols-3 gap-1.5 font-sans">
                        <button 
                          onClick={() => handleSendToSection('edit')}
                          className="text-[8px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/45 border border-blue-900/40 rounded-lg py-1.5 hover:bg-blue-900/30 hover:border-blue-500/50 transition-all cursor-pointer"
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          onClick={() => handleSendToSection('png-to-dxf')}
                          className="text-[8px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-950/45 border border-cyan-900/40 rounded-lg py-1.5 hover:bg-cyan-900/30 hover:border-cyan-500/50 transition-all cursor-pointer"
                        >
                          📐 Vector
                        </button>
                        <button 
                          onClick={() => handleSendToSection('3d-render')}
                          className="text-[8px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/45 border border-amber-900/40 rounded-lg py-1.5 hover:bg-amber-900/30 hover:border-amber-500/50 transition-all cursor-pointer"
                        >
                          🏢 3D Render
                        </button>
                      </div>
                      <button 
                        onClick={() => {
                          if (generatedImageUrl) {
                            useArchitectStore.getState().addProjectAsset('floorPlans', { url: generatedImageUrl, source: 'generated' });
                          }
                        }}
                        className={`w-full mt-2 text-[9px] font-bold uppercase tracking-wider rounded-lg py-2 transition-all cursor-pointer flex items-center justify-center gap-2 ${
                          activeProject?.assets.floorPlans.some(fp => fp.url === generatedImageUrl)
                            ? 'text-emerald-400 bg-emerald-950/45 border border-emerald-900/40 hover:bg-emerald-900/30'
                            : 'text-green-400 bg-green-950/45 border border-green-900/40 hover:bg-green-900/30 hover:border-green-500/50'
                        }`}
                      >
                        <span className="text-xl">★</span> 
                        {activeProject?.assets.floorPlans.some(fp => fp.url === generatedImageUrl)
                          ? '✓ FINALIZED / ADDED TO PROJECT'
                          : '★ FINALIZE / ADD TO PROJECT'}
                      </button>
                    </div>
                  </div>
                )}

                {!generatedImageUrl && !isGeneratingImage && (
                  <button
                    onClick={generateConceptImage}
                    disabled={(sitePoints.length < 3 && plotPoints.length < 3) || isGeneratingImage}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-blue-600 to-cyan-600 border border-blue-400 text-white hover:from-blue-500 hover:to-cyan-500 disabled:from-blue-950/20 disabled:to-blue-950/30 disabled:border-blue-900/30 disabled:text-blue-900/40 disabled:cursor-not-allowed rounded-lg shadow-lg hover:shadow-blue-950/30 transition-all cursor-pointer font-sans"
                  >
                    <Sparkles size={13} />
                    Generate Concept
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Tracing Popup Modal */}
      {isCanvasPopupOpen && (
        <div className="fixed inset-0 bg-[#040805] bg-gemini-glow z-50 flex flex-col p-6 font-sans select-none animate-modal-entry">
          {/* Modal Header */}
          <div className="flex justify-between items-center border-b border-blue-900/30 pb-4 mb-4 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="text-gradient-blue-cyan text-glow-blue font-sans">Fullscreen Tracing Workspace</span>
                <span className="text-[9px] bg-purple-500/20 border border-purple-500/40 text-purple-300 px-2 py-0.5 rounded font-sans uppercase tracking-normal">Active Session</span>
              </h2>
              <p className="text-[9px] text-blue-500/60 uppercase mt-0.5 tracking-wider font-sans">
                Provides a distraction-free high-precision drawing environment. Press Escape or click the exit button to apply changes.
              </p>
            </div>
            <button 
              onClick={() => setIsCanvasPopupOpen(false)} 
              className="px-4 py-2 text-[10px] uppercase tracking-widest bg-blue-950/30 border border-blue-900/40 text-blue-300 hover:bg-blue-500/10 rounded transition-all font-bold flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <X size={12} /> Exit Fullscreen
            </button>
          </div>

          {/* Viewport: toolbar + canvas */}
          <div className="flex-1 flex flex-col min-h-0 bg-transparent border border-blue-900/25 rounded-xl overflow-hidden relative">
            {/* Toolbar */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-blue-900/25 bg-[#040805]/70 backdrop-blur shrink-0 flex-wrap">
              {renderToolbar(true)}
            </div>

            {/* Canvas viewport wrapper */}
            <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-transparent">
              <canvas
                ref={canvasRef}
                width={CANVAS_W}
                height={CANVAS_H}
                onWheel={handleWheel}
                className={`max-w-full max-h-full object-contain bg-[#030704]/95 rounded-lg shadow-[0_0_50px_rgba(16,185,129,0.06)] border border-blue-900/30 ${drawMode === 'map' ? (isDraggingMap ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleCanvasMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={(e) => { setHoverPoint(null); handleMouseUp(); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Logs Floating Window */}
      {showLogs && (
        <div className="fixed bottom-6 right-[400px] w-[500px] bg-[#02050c]/95 border border-amber-500/40 rounded-xl shadow-[0_0_40px_rgba(245,158,11,0.15)] z-[60] flex flex-col font-sans backdrop-blur-2xl overflow-hidden max-h-[85vh]">
          <div className="flex justify-between items-center px-4 py-2 bg-amber-950/30 border-b border-amber-900/50 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-amber-400" />
              <h3 className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">Generation Logs</h3>
            </div>
            <button onClick={() => setShowLogs(false)} className="text-amber-500/60 hover:text-amber-300 cursor-pointer p-1">
              <X size={12} />
            </button>
          </div>
          <div className="p-4 overflow-y-auto space-y-6 text-[10px] text-blue-300">
            {/* Stage 1 Trace */}
            <div className="space-y-2">
              <h4 className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest border-b border-amber-900/30 pb-1">1. Exported Trace (Site Shape)</h4>
              {debugStep2TraceImage ? (
                <img src={debugStep2TraceImage} alt="Trace Mask" className="w-full max-w-[200px] border border-blue-900/40 rounded-lg mx-auto bg-black" />
              ) : (
                <div className="text-blue-500/50 text-center py-4 bg-black/40 rounded border border-blue-900/30">Waiting for trace generation...</div>
              )}
            </div>
            
            {/* Stage 1 Grok Output */}
            <div className="space-y-2">
              <h4 className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest border-b border-amber-900/30 pb-1">2. Stage 1 (Grok) Base Image</h4>
              {stage1ImageUrl ? (
                <img src={stage1ImageUrl} alt="Grok Output" className="w-full border border-blue-900/40 rounded-lg shadow-lg" />
              ) : (
                <div className="text-blue-500/50 text-center py-4 bg-black/40 rounded border border-blue-900/30">Waiting for Grok generation...</div>
              )}
            </div>

            {/* Prompts to GPT */}
            <div className="space-y-2">
              <h4 className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest border-b border-amber-900/30 pb-1">3. Stage 2 (GPT) Prompting</h4>
              <div className="bg-black/60 rounded p-3 font-mono text-[9px] whitespace-pre-wrap overflow-x-auto text-blue-400 border border-blue-900/30">
                <span className="text-purple-400 font-bold block mb-1">SYSTEM PROMPT:</span>
                {debugStep2SystemPrompt || 'Waiting...'}
                <br/><br/>
                <span className="text-green-400 font-bold block mb-1">USER PROMPT:</span>
                {debugStep2UserPrompt || 'Waiting...'}
              </div>
            </div>

            {/* Final Stage 2 GPT Output */}
            <div className="space-y-2">
              <h4 className="text-[9px] font-bold text-amber-500/80 uppercase tracking-widest border-b border-amber-900/30 pb-1">4. Final Stage 2 (GPT) Image</h4>
              {generatedImageUrl && pipelineStage !== 'stage2' ? (
                <img src={generatedImageUrl} alt="GPT Final Output" className="w-full border border-blue-900/40 rounded-lg shadow-lg" />
              ) : (
                <div className="text-blue-500/50 text-center py-4 bg-black/40 rounded border border-blue-900/30">Waiting for GPT generation...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
