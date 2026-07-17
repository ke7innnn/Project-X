'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Download, RotateCcw, ImageIcon, Sparkles, RefreshCw, Undo2, Redo2, Maximize2, ImagePlus, X, Move, Terminal, Pentagon, Folder, Plus, Clock, MapPin, Trash2, Map } from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { v4 as uuidv4 } from 'uuid';

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
  const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
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
    const padding = 24;
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

// buildFloorPlanPromptLocal removed — prompt is now built server-side in /api/generate-floorplan-step1/route.ts
// The debug panel reads the actual prompt returned by the API (step1Data.prompt).

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmartPlannerPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Concept Projects local state (localStorage-based, DB disconnected)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projNameInput, setProjNameInput] = useState('');
  const [projLocationInput, setProjLocationInput] = useState('');

  // Routing from concept outputs to workspace pages
  const handleSendToSection = (targetSection: 'edit' | 'png-to-dxf' | '3d-render') => {
    if (!generatedImageUrl) return;
    
    // Auto-populate the current floor plan state inside Zustand
    useArchitectStore.setState({ currentFloorPlan: generatedImageUrl });
    
    // Set the store phase appropriately so workspaces initialize correctly
    if (targetSection === 'edit') {
      useArchitectStore.setState({ phase: 'edit' });
    } else if (targetSection === '3d-render') {
      useArchitectStore.setState({ phase: 'edit' }); // 3D render operates under edit session
    }

    router.push(`/${targetSection}`);
  };

  // Load projects list
  useEffect(() => {
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

  // Create Project
  const createNewProject = () => {
    if (!projNameInput.trim()) return;
    const newProj = {
      id: uuidv4(),
      name: projNameInput.trim(),
      location: projLocationInput.trim() || 'Unknown Location',
      createdAt: new Date().toISOString(),
      state: {
        ratioId: 'square',
        plotPoints: [],
        sitePoints: [],
        plotClosed: false,
        siteClosed: false,
        dividerLines: [],
        coreMarker: null,
        buildingType: 'multi-residential',
        roomConfig: 'auto',
        workflow: 'grok-gpt',
        flatCount: 'auto',
        generatedImageUrls: [],
        stage1ImageUrl: null,
        debugStep2SystemPrompt: '',
        debugStep2UserPrompt: '',
        debugStep2TraceImage: '',
      }
    };
    const nextList = [newProj, ...projectsList];
    setProjectsList(nextList);
    localStorage.setItem('concept_generator_projects', JSON.stringify(nextList));
    
    setSelectedProjectId(newProj.id);
    setProjNameInput('');
    setProjLocationInput('');
    setShowCreateModal(false);
  };

  // Delete Project
  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextList = projectsList.filter(p => p.id !== id);
    setProjectsList(nextList);
    localStorage.setItem('concept_generator_projects', JSON.stringify(nextList));
    if (selectedProjectId === id) {
      setSelectedProjectId(null);
    }
  };

  // Auto-save tracker
  const isInitialLoadRef = useRef(false);

  // Load project settings on selection
  useEffect(() => {
    if (!selectedProjectId) return;
    const proj = projectsList.find(p => p.id === selectedProjectId);
    if (proj && proj.state) {
      const s = proj.state;
      isInitialLoadRef.current = true; // Block save trigger on initial load
      setRatioId(s.ratioId || 'square');
      setPlotPoints(s.plotPoints || []);
      setSitePoints(s.sitePoints || []);
      setPlotClosed(s.plotClosed || false);
      setSiteClosed(s.siteClosed || false);
      setDividerLines(s.dividerLines || []);
      setCoreMarker(s.coreMarker || null);
      setBuildingType(s.buildingType || 'multi-residential');
      setRoomConfig(s.roomConfig || 'auto');
      setWorkflow(s.workflow || 'grok-gpt');
      setFlatCount(s.flatCount || 'auto');
      setGeneratedImageUrls(s.generatedImageUrls || []);
      setStage1ImageUrl(s.stage1ImageUrl || null);
      setShowGeneratedImage(s.generatedImageUrls?.length > 0);
      setDebugStep2SystemPrompt(s.debugStep2SystemPrompt || '');
      setDebugStep2UserPrompt(s.debugStep2UserPrompt || '');
      setDebugStep2TraceImage(s.debugStep2TraceImage || '');
    }
  }, [selectedProjectId]);

  // Canvas ratio
  const [ratioId, setRatioId] = useState<RatioId>('square');
  const [showRatioPicker, setShowRatioPicker] = useState(false);
  const [showShapePicker, setShowShapePicker] = useState(false);
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
  const [metersPerCell, setMetersPerCell] = useState(0.5);
  const SCALE_OPTIONS = [0.5, 1, 2, 5];
  // Convert px distance to metres using the current scale
  const pxToMScaled = (px: number) => +((px / CELL_PX) * metersPerCell).toFixed(1);

  const [drawMode, setDrawMode] = useState<'plot' | 'site' | 'map' | 'divider' | 'core' | null>(null);
  const [plotPoints, setPlotPoints] = useState<Point[]>([]);
  const [sitePoints, setSitePoints] = useState<Point[]>([]);
  const [plotClosed, setPlotClosed] = useState(false);
  const [siteClosed, setSiteClosed] = useState(false);
  const [dividerLines, setDividerLines] = useState<Point[][]>([]);
  const [currentDivider, setCurrentDivider] = useState<Point[]>([]);
  const [coreMarker, setCoreMarker] = useState<Point | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // Undo/Redo stacks — each entry is a snapshot of [plotPoints, sitePoints, plotClosed, siteClosed, dividerLines, coreMarker]
  type Snapshot = { plotPts: Point[]; sitePts: Point[]; plotClosed: boolean; siteClosed: boolean; divLines: Point[][]; core: Point | null };
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
    redoStack.current = [{ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker }, ...redoStack.current];
    setPlotPoints(prev.plotPts); setSitePoints(prev.sitePts);
    setPlotClosed(prev.plotClosed); setSiteClosed(prev.siteClosed);
    setDividerLines(prev.divLines); setCoreMarker(prev.core);
  }, [plotPoints, sitePoints, plotClosed, siteClosed]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, { plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker }];
    setPlotPoints(next.plotPts); setSitePoints(next.sitePts);
    setPlotClosed(next.plotClosed); setSiteClosed(next.siteClosed);
    setDividerLines(next.divLines); setCoreMarker(next.core);
  }, [plotPoints, sitePoints, plotClosed, siteClosed]);

  const loadPresetShape = useCallback((shape: 'box' | 'l-shape' | 'u-shape' | 't-shape' | 'cruciform' | 'circle') => {
    pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
    setActivePreset(shape);

    const cx = Math.round(CANVAS_W / 2 / CELL_PX) * CELL_PX;
    const cy = Math.round(CANVAS_H / 2 / CELL_PX) * CELL_PX;

    let pts: Point[] = [];

    if (shape === 'box') {
      pts = [
        { x: cx - 180, y: cy - 120 },
        { x: cx + 180, y: cy - 120 },
        { x: cx + 180, y: cy + 120 },
        { x: cx - 180, y: cy + 120 }
      ];
    } else if (shape === 'l-shape') {
      pts = [
        { x: cx - 180, y: cy - 180 },
        { x: cx + 180, y: cy - 180 },
        { x: cx + 180, y: cy },
        { x: cx, y: cy },
        { x: cx, y: cy + 180 },
        { x: cx - 180, y: cy + 180 }
      ];
    } else if (shape === 'u-shape') {
      pts = [
        { x: cx - 200, y: cy - 150 },
        { x: cx - 80, y: cy - 150 },
        { x: cx - 80, y: cy + 40 },
        { x: cx + 80, y: cy + 40 },
        { x: cx + 80, y: cy - 150 },
        { x: cx + 200, y: cy - 150 },
        { x: cx + 200, y: cy + 180 },
        { x: cx - 200, y: cy + 180 }
      ];
    } else if (shape === 't-shape') {
      pts = [
        { x: cx - 200, y: cy - 150 },
        { x: cx + 200, y: cy - 150 },
        { x: cx + 200, y: cy - 30 },
        { x: cx + 60, y: cy - 30 },
        { x: cx + 60, y: cy + 180 },
        { x: cx - 60, y: cy + 180 },
        { x: cx - 60, y: cy - 30 },
        { x: cx - 200, y: cy - 30 }
      ];
    } else if (shape === 'cruciform') {
      pts = [
        { x: cx - 60, y: cy - 180 },
        { x: cx + 60, y: cy - 180 },
        { x: cx + 60, y: cy - 60 },
        { x: cx + 180, y: cy - 60 },
        { x: cx + 180, y: cy + 60 },
        { x: cx + 60, y: cy + 60 },
        { x: cx + 60, y: cy + 180 },
        { x: cx - 60, y: cy + 180 },
        { x: cx - 60, y: cy + 60 },
        { x: cx - 180, y: cy + 60 },
        { x: cx - 180, y: cy - 60 },
        { x: cx - 60, y: cy - 60 }
      ];
    } else if (shape === 'circle') {
      const radius = 150;
      for (let i = 0; i < 36; i++) {
        const angle = (i * Math.PI * 2) / 36;
        pts.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius
        });
      }
    }

    // Snap all points to grid
    const snapped = pts.map(p => ({
      x: Math.round(p.x / CELL_PX) * CELL_PX,
      y: Math.round(p.y / CELL_PX) * CELL_PX
    }));

    setPlotPoints(snapped);
    setPlotClosed(true);
    setDrawMode(null);
    setSelectedEdge(null);

    // Auto-create site exterior as offset inside
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
  }, [CANVAS_W, CANVAS_H, plotPoints, sitePoints, plotClosed, siteClosed, pushUndo]);

  const [selectedEdge, setSelectedEdge] = useState<{ list: 'plot' | 'site'; index: number } | null>(null);
  const [draggingPoint, setDraggingPoint] = useState<{ list: 'plot' | 'site'; index: number } | null>(null);

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
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'step1' | 'mastermind' | 'step2'>('idle');
  const [generationProgress, setGenerationProgress] = useState(0);

  useEffect(() => {
    if (generationPhase === 'idle') {
      setGenerationProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (generationPhase === 'step1') {
          return prev < 49 ? prev + 1 : prev; // Animate up to 49% during step 1
        } else if (generationPhase === 'step2') {
          if (prev < 50) return 50;
          return prev < 99 ? prev + 1 : prev; // Animate up to 99% during step 2
        }
        return prev;
      });
    }, 200); // 1% every 200ms -> ~10s for 50%
    return () => clearInterval(interval);
  }, [generationPhase]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const [roomSchedule, setRoomSchedule] = useState<RoomSchedule | null>(null);
  const [activePreset, setActivePreset] = useState<'box' | 'l-shape' | 'u-shape' | 't-shape' | 'cruciform' | 'circle' | null>(null);
  const [edgeCurvature, setEdgeCurvature] = useState<number>(0);

  useEffect(() => {
    setEdgeCurvature(0);
  }, [selectedEdge]);

  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const generatedImageUrl = generatedImageUrls[activeImageIndex] || null;
  const [showGeneratedImage, setShowGeneratedImage] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const generatedImageObjRef = useRef<HTMLImageElement | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [layoutOptions, setLayoutOptions] = useState<{ id: string; name: string; desc: string; flatCount?: number; bhkType?: string; }[] | null>(null);
  const [buildingType, setBuildingType] = useState<string>('multi-residential');
  const [roomConfig, setRoomConfig] = useState<string>('auto');
  const [aiModel, setAiModel] = useState<string>('grok'); // kept for debugger display
  const [workflow, setWorkflow] = useState<string>('grok-gpt');
  const [flatCount, setFlatCount] = useState<string>('auto');
  const [stage1ImageUrl, setStage1ImageUrl] = useState<string | null>(null);
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'stage1' | 'stage2'>('idle');

  // Workflow config helpers
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

  // Real-time Visual Debugging State
  const [debugStep1Prompt, setDebugStep1Prompt] = useState<string>('');
  const [debugStep1BaseImage, setDebugStep1BaseImage] = useState<string>('');
  const [debugStep1MaskImage, setDebugStep1MaskImage] = useState<string>('');
  const [debugStep1OutputUrl, setDebugStep1OutputUrl] = useState<string>('');
  const [debugStep2SystemPrompt, setDebugStep2SystemPrompt] = useState<string>('');
  const [debugStep2UserPrompt, setDebugStep2UserPrompt] = useState<string>('');
  const [debugStep2TraceImage, setDebugStep2TraceImage] = useState<string>('');
  const [debugStep15Schematic, setDebugStep15Schematic] = useState<string>('');
  const [mastermindStrategy, setMastermindStrategy] = useState<string>('');

  const snapToGrid = (v: number) => Math.round(v / CELL_PX) * CELL_PX;

  const generateCurvePoints = (p1: Point, p2: Point, c: number, numSegments: number = 16) => {
    if (c === 0) return [];
    const M = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) return [];
    const N = { x: -dy/d, y: dx/d }; // perpendicular vector pointing outward assuming clockwise rotation
    
    // Control Point distance is proportional to curvature 'c'
    const CP = { x: M.x + N.x * d * c, y: M.y + N.y * d * c };
    
    const pts: Point[] = [];
    for (let i = 1; i < numSegments; i++) {
      const t = i / numSegments;
      const invT = 1 - t;
      const x = invT*invT*p1.x + 2*invT*t*CP.x + t*t*p2.x;
      const y = invT*invT*p1.y + 2*invT*t*CP.y + t*t*p2.y;
      pts.push({ x: Math.round(x), y: Math.round(y) });
    }
    return pts;
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
    const borderGlow = drawMode === 'plot' ? '#f9731640' : drawMode === 'site' ? '#00f0ff40' : '#22c55e20';
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
      if (plotClosed) {
        drawPolygonPath(ctx, plotPoints);
      } else {
        ctx.beginPath();
        plotPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        if (drawMode === 'plot' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      plotPoints.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#f97316' : '#fb923c';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      });
      if (!plotClosed && plotPoints.length >= 3 && drawMode === 'plot') {
        ctx.beginPath(); ctx.arc(plotPoints[0].x, plotPoints[0].y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#f97316aa'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Draw Midpoint Handles for Plot Boundary
      if (plotClosed && !drawMode) {
        for (let i = 0; i < plotPoints.length; i++) {
          const a = plotPoints[i], b = plotPoints[(i + 1) % plotPoints.length];
          let mx = (a.x + b.x) / 2;
          let my = (a.y + b.y) / 2;

          const isSelected = selectedEdge && selectedEdge.list === 'plot' && selectedEdge.index === i;

          ctx.beginPath();
          ctx.arc(mx, my, isSelected ? 5.5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#f97316';
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.fill(); ctx.stroke();

          // Draw "+" sign inside
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#f97316';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx - 2, my); ctx.lineTo(mx + 2, my);
          ctx.moveTo(mx, my - 2); ctx.lineTo(mx, my + 2);
          ctx.stroke();
        }
      }
      // Edge length labels on closed plot polygon
      if (plotClosed) {
        for (let i = 0; i < plotPoints.length; i++) {
          const a = plotPoints[i], b = plotPoints[(i + 1) % plotPoints.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dM = (Math.sqrt(dx * dx + dy * dy) / CELL_PX * metersPerCell).toFixed(1);
          let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

          ctx.save();
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(`${dM}m`).width;
          ctx.fillStyle = 'rgba(20,10,0,0.85)';
          ctx.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 14);
          ctx.fillStyle = '#fb923c'; ctx.fillText(`${dM}m`, mx, my);
          ctx.restore();
        }
      }
    }

    // ── Site exterior ─────────────────────────────────────────────────────
    if (sitePoints.length > 0) {
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 2; ctx.setLineDash([]);
      if (siteClosed) {
        drawPolygonPath(ctx, sitePoints);
        ctx.fillStyle = 'rgba(0,240,255,0.05)'; ctx.fill();
      } else {
        ctx.beginPath();
        sitePoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        if (drawMode === 'site' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      }
      ctx.stroke();
      sitePoints.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#00f0ff' : '#67e8f9';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      });
      if (!siteClosed && sitePoints.length >= 3 && drawMode === 'site') {
        ctx.beginPath(); ctx.arc(sitePoints[0].x, sitePoints[0].y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#00f0ffaa'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      // Draw Midpoint Handles for Site Exterior
      if (siteClosed && !drawMode) {
        for (let i = 0; i < sitePoints.length; i++) {
          const a = sitePoints[i], b = sitePoints[(i + 1) % sitePoints.length];
          let mx = (a.x + b.x) / 2;
          let my = (a.y + b.y) / 2;

          const isSelected = selectedEdge && selectedEdge.list === 'site' && selectedEdge.index === i;

          ctx.beginPath();
          ctx.arc(mx, my, isSelected ? 5.5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#00f0ff';
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.fill(); ctx.stroke();

          // Draw "+" sign inside
          ctx.strokeStyle = isSelected ? '#3b82f6' : '#00f0ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(mx - 2, my); ctx.lineTo(mx + 2, my);
          ctx.moveTo(mx, my - 2); ctx.lineTo(mx, my + 2);
          ctx.stroke();
        }
      }
      // Edge length labels on closed site polygon
      if (siteClosed) {
        for (let i = 0; i < sitePoints.length; i++) {
          const a = sitePoints[i], b = sitePoints[(i + 1) % sitePoints.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dM = (Math.sqrt(dx * dx + dy * dy) / CELL_PX * metersPerCell).toFixed(1);
          let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

          ctx.save();
          ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(`${dM}m`).width;
          ctx.fillStyle = 'rgba(0,20,20,0.85)';
          ctx.fillRect(mx - tw / 2 - 3, my - 7, tw + 6, 14);
          ctx.fillStyle = '#67e8f9'; ctx.fillText(`${dM}m`, mx, my);
          ctx.restore();
        }
      }
    }

    // ── Divider Lines ─────────────────────────────────────────────────────
    ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 4]);
    dividerLines.forEach(line => {
      if (line.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (let i = 1; i < line.length; i++) ctx.lineTo(line[i].x, line[i].y);
      ctx.stroke();
    });
    // Current drawing divider line
    if (currentDivider.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentDivider[0].x, currentDivider[0].y);
      for (let i = 1; i < currentDivider.length; i++) ctx.lineTo(currentDivider[i].x, currentDivider[i].y);
      if (drawMode === 'divider' && hoverPoint) ctx.lineTo(hoverPoint.x, hoverPoint.y);
      ctx.stroke();
      
      // Draw points for current divider
      currentDivider.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6'; ctx.fill();
      });
    }
    ctx.setLineDash([]);

    // ── Core Marker (Stairs/Lift) ─────────────────────────────────────────
    if (coreMarker) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      const mSize = 32;
      ctx.fillRect(coreMarker.x - mSize/2, coreMarker.y - mSize/2, mSize, mSize);
      ctx.strokeRect(coreMarker.x - mSize/2, coreMarker.y - mSize/2, mSize, mSize);
      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CORE', coreMarker.x, coreMarker.y);
      ctx.restore();
    }
    if (drawMode === 'core' && hoverPoint) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = 2;
      const mSize = 32;
      ctx.fillRect(hoverPoint.x - mSize/2, hoverPoint.y - mSize/2, mSize, mSize);
      ctx.strokeRect(hoverPoint.x - mSize/2, hoverPoint.y - mSize/2, mSize, mSize);
      ctx.restore();
    }

    // ── Snap indicator + real-time annotation (while drawing) ─────────────
    if (drawMode && hoverPoint) {
      const pts = drawMode === 'plot' ? plotPoints : drawMode === 'site' ? sitePoints : currentDivider;
      const color = drawMode === 'plot' ? '#f97316' : drawMode === 'site' ? '#00f0ff' : '#3b82f6';
      const colorLight = drawMode === 'plot' ? '#fb923c' : drawMode === 'site' ? '#67e8f9' : '#93c5fd';

      // Concentric snap rings at cursor
      ctx.save();
      ctx.strokeStyle = color + 'cc'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color + '55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hoverPoint.x, hoverPoint.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // Line length annotation for current segment
      if (pts.length > 0) {
        const lastPt = pts[pts.length - 1];
        const dx = hoverPoint.x - lastPt.x, dy = hoverPoint.y - lastPt.y;
        const distPx = Math.sqrt(dx * dx + dy * dy);

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
          ctx.beginPath(); ctx.roundRect(ox - bw / 2, oy - bh / 2, bw, bh, 4);
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
  }, [plotPoints, sitePoints, plotClosed, siteClosed, dividerLines, currentDivider, coreMarker, hoverPoint, drawMode, isGeneratingImage, CANVAS_W, CANVAS_H, currentRatio, metersPerCell, bgImageLoaded, bgOpacity, bgOffset, bgScale, compareMode, selectedEdge, draggingPoint]);

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
      y: snapToGrid((e.clientY - rect.top - offsetY) / displayScale),
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingPoint) return;
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
        // Finish the 2-point divider line
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
        if (Math.sqrt(dx * dx + dy * dy) < 15) {
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
        if (Math.sqrt(dx * dx + dy * dy) < 15) {
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

    if (drawMode === 'map') {
      setIsDraggingMap(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!drawMode) {
      // 1. Direct point handles dragging
      for (let i = 0; i < plotPoints.length; i++) {
        const pt = plotPoints[i];
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < 12) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
          setDraggingPoint({ list: 'plot', index: i });
          return;
        }
      }
      for (let i = 0; i < sitePoints.length; i++) {
        const pt = sitePoints[i];
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < 12) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
          setDraggingPoint({ list: 'site', index: i });
          return;
        }
      }

      // 2. Midpoint handles click (opens curve segment options modal)
      if (plotClosed && plotPoints.length >= 3) {
        for (let i = 0; i < plotPoints.length; i++) {
          const p1 = plotPoints[i];
          const p2 = plotPoints[(i + 1) % plotPoints.length];
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          if (Math.hypot(mx - coords.x, my - coords.y) < 12) {
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
          if (Math.hypot(mx - coords.x, my - coords.y) < 12) {
            setSelectedEdge({ list: 'site', index: i });
            return;
          }
        }
      }
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    if (drawMode === 'map') {
      setIsDraggingMap(false);
      lastMousePos.current = null;
      return;
    }

    if (draggingPoint) {
      setDraggingPoint(null);
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
      <div className="min-h-screen bg-[#070f07] text-[#4af626] font-mono p-8 relative flex flex-col w-full h-full overflow-y-auto">
        {/* Tech grid texture */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,38,18,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(18,38,18,0.1)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none z-0" />
        
        {/* Header */}
        <header className="relative z-10 max-w-7xl mx-auto w-full flex items-center justify-between mb-12 border-b border-green-900/30 pb-6 shrink-0">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => router.push('/')}
              className="flex items-center justify-center w-10 h-10 rounded-full border border-green-900/30 hover:border-green-400 hover:bg-green-950/20 transition-all group"
            >
              <ArrowLeft className="text-green-500/70 group-hover:text-green-400" size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(0,255,100,0.3)] flex items-center gap-3">
                <Folder className="text-green-400" /> Concept Projects
              </h1>
              <span className="text-[9px] tracking-[3px] text-green-700/80 uppercase">
                AI Layout Design Portal
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-black hover:bg-green-400 font-bold uppercase tracking-wider text-xs rounded transition-all shadow-[0_0_15px_rgba(74,246,38,0.2)]"
          >
            <Plus size={16} /> New Concept Project
          </button>
        </header>

        {/* Project List */}
        <main className="relative z-10 max-w-7xl mx-auto w-full flex-1 flex flex-col">
          {projectsList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 border border-dashed border-green-900/20 rounded bg-[#0b160b]/30 backdrop-blur">
              <Folder size={48} className="text-green-900/40 mb-4" />
              <h2 className="text-sm tracking-widest uppercase text-green-400 mb-1">No Concept Projects</h2>
              <p className="text-[10px] tracking-wider uppercase text-green-700 mb-6">Create a project to initialize the layout canvas</p>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-2.5 bg-transparent border border-green-500 text-green-400 hover:bg-green-900/20 text-xs font-bold uppercase tracking-wider transition-all"
              >
                Create Project
              </button>
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
                    className="group relative bg-[#0b160b]/40 border border-green-900/30 rounded p-4 flex flex-col gap-3 cursor-pointer hover:border-green-500/50 hover:bg-green-950/10 transition-all duration-300 shadow-md shadow-black/40"
                  >
                    {/* Thumbnail area */}
                    <div className="w-full h-36 bg-black/60 border border-green-950 rounded flex items-center justify-center overflow-hidden relative shrink-0">
                      {imgThumb ? (
                        <img 
                          src={imgThumb} 
                          alt={p.name} 
                          className="w-full h-full object-contain opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-500" 
                        />
                      ) : (
                        <Map size={36} className="text-green-900/20 group-hover:scale-110 transition-all duration-300" />
                      )}
                      
                      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => deleteProject(p.id, e)}
                          className="w-7 h-7 rounded bg-black/80 border border-red-900/50 flex items-center justify-center text-red-400 hover:bg-red-950/60 hover:text-red-300 transition-all"
                          title="Delete Project"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-white uppercase group-hover:text-green-400 transition-colors tracking-wider line-clamp-1">{p.name}</h3>
                        <div className="flex items-center gap-1 mt-1 text-[9px] text-green-700">
                          <MapPin size={10} />
                          <span className="line-clamp-1">{p.location}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between border-t border-green-900/20 pt-2.5 text-[8px] text-green-700 uppercase font-mono">
                        <span className="flex items-center gap-1">
                          <Clock size={9} />
                          {new Date(p.createdAt).toLocaleDateString()}
                        </span>
                        <span className="text-green-500 font-bold">
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
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#070f07] border border-green-500/30 rounded max-w-sm w-full p-6 space-y-4 shadow-2xl">
              <div className="flex justify-between items-center border-b border-green-900/30 pb-2">
                <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest">Initialize Concept</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-green-700 hover:text-green-400">
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[8px] text-green-700 uppercase tracking-wider">Project Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Vasai-Virar Heights"
                    value={projNameInput}
                    onChange={(e) => setProjNameInput(e.target.value)}
                    className="w-full bg-black border border-green-900/40 rounded px-2.5 py-1.5 text-xs text-white placeholder-green-900/60 focus:outline-none focus:border-green-400"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[8px] text-green-700 uppercase tracking-wider">Location / Site Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Vasai Road East"
                    value={projLocationInput}
                    onChange={(e) => setProjLocationInput(e.target.value)}
                    className="w-full bg-black border border-green-900/40 rounded px-2.5 py-1.5 text-xs text-white placeholder-green-900/60 focus:outline-none focus:border-green-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-green-900/30">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-1.5 bg-transparent border border-green-900/40 text-green-700 hover:text-green-500 rounded text-[9px] uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={createNewProject}
                  disabled={!projNameInput.trim()}
                  className="px-4 py-1.5 bg-green-500 text-black hover:bg-green-400 font-bold rounded text-[9px] uppercase tracking-wider disabled:opacity-40"
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

  return (
    <main className="flex flex-col w-full h-screen bg-[#050f05] text-green-400 font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-green-900/40 bg-[#050f05]/90 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedProjectId(null)} className="w-9 h-9 rounded-full border border-green-700/40 hover:border-green-400 hover:bg-green-500/10 flex items-center justify-center transition-all">
            <ArrowLeft size={16} className="text-green-500" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(0,255,100,0.3)] flex items-center gap-2">
              {projectsList.find(p => p.id === selectedProjectId)?.name || 'Concept Project'}
              <span className="text-[10px] bg-green-500/20 border border-green-500/40 text-green-400 px-2 py-0.5 rounded ml-2 font-mono uppercase tracking-normal">Concept</span>
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
          {generatedImageUrls.length > 1 && (
            <div className="flex items-center gap-1 border border-green-700/40 rounded p-1 bg-[#050f05]">
              {generatedImageUrls.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setActiveImageIndex(idx);
                    setShowGeneratedImage(true);
                  }}
                  className={`px-3 py-1.5 text-[10px] uppercase tracking-widest rounded transition-all ${activeImageIndex === idx ? 'bg-green-500/20 text-green-300 font-bold' : 'text-green-600 hover:bg-green-900/30'}`}
                >
                  Option {idx + 1}
                </button>
              ))}
            </div>
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

      <div className="flex w-full flex-1 min-h-0">
        {/* Canvas / Image Panel */}
        <div className="flex flex-col flex-1 overflow-y-auto border-r border-green-900/40 bg-[#030a03] select-none">
          {/* Mode toolbar */}
          <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2 border-b border-green-900/30 bg-[#070f07] shrink-0 flex-wrap">
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
            <button
              onClick={() => setDrawMode(d => d === 'divider' ? null : 'divider')}
              disabled={!plotClosed && !siteClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold ${drawMode === 'divider' ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'border-blue-700/40 text-blue-500 hover:bg-blue-500/10'}`}
              title="Draw colored lines to divide the plot into flats"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
              {drawMode === 'divider' ? 'Drawing Dividers...' : 'Draw Dividers'}
            </button>
            <button
              onClick={() => setDrawMode(d => d === 'core' ? null : 'core')}
              disabled={!plotClosed && !siteClosed}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all font-bold ${drawMode === 'core' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'border-cyan-700/40 text-cyan-500 hover:bg-cyan-500/10'}`}
              title="Place a marker to explicitly dictate where the Stairs/Lift core must be placed"
            >
              <span className="w-3 h-3 rounded-sm bg-cyan-400 inline-block" />
              {coreMarker ? (drawMode === 'core' ? 'Moving Core...' : 'Core ✓') : 'Place Stairs/Lift'}
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

            {/* Curve segment control panel */}
            {selectedEdge && (
              <div className="flex flex-col gap-2 border border-blue-900/60 bg-[#050c18] px-4 py-3 rounded-md text-blue-300 transition-all select-none w-64 shadow-2xl">
                <div className="flex justify-between items-center w-full">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400">
                    Edge #{(selectedEdge.index + 1)} Editor
                  </span>
                  <button onClick={() => setSelectedEdge(null)} className="text-blue-500 hover:text-blue-300">
                    <X size={12} />
                  </button>
                </div>
                
                <div className="space-y-2 mt-1">
                  <div className="flex justify-between text-[8px] uppercase font-bold text-blue-500">
                    <span>Inward</span>
                    <span>Curvature</span>
                    <span>Outward</span>
                  </div>
                  <input 
                    type="range" 
                    min="-1" max="1" step="0.05"
                    value={edgeCurvature}
                    onChange={(e) => setEdgeCurvature(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 cursor-ew-resize"
                  />
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed, divLines: dividerLines, core: coreMarker });
                      const pts = selectedEdge.list === 'plot' ? [...plotPoints] : [...sitePoints];
                      const setPts = selectedEdge.list === 'plot' ? setPlotPoints : setSitePoints;
                      const i = selectedEdge.index;
                      
                      if (edgeCurvature !== 0) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        const curvePts = generateCurvePoints(p1, p2, edgeCurvature, 16);
                        pts.splice(i + 1, 0, ...curvePts);
                      } else {
                        // Just split (default behavior)
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        let mx = (p1.x + p2.x) / 2;
                        let my = (p1.y + p2.y) / 2;
                        pts.splice(i + 1, 0, { x: snapToGrid(mx), y: snapToGrid(my) });
                      }
                      
                      setPts(pts);
                      setSelectedEdge(null);
                      setEdgeCurvature(0);
                    }}
                    className="flex-1 px-2 py-1.5 text-[9px] uppercase font-bold bg-blue-600 hover:bg-blue-500 text-white rounded border border-blue-500/30 transition-all font-mono shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                  >
                    {edgeCurvature !== 0 ? 'Apply Curve' : 'Split Edge'}
                  </button>
                </div>
              </div>
            )}

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
                        setActivePreset(null);
                        undoStack.current = []; redoStack.current = [];
                      }}
                      className={`w-full text-left px-4 py-2.5 text-[10px] flex items-center justify-between gap-4 hover:bg-green-500/10 transition-colors ${r.id === ratioId ? 'text-green-300 bg-green-500/10' : 'text-green-700'
                        }`}
                    >
                      <span>{r.label}</span>
                      {r.id === ratioId && <span className="text-green-400">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Preset Plots Picker */}
            <div className="relative">
              <button
                onClick={() => setShowShapePicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-green-700/40 text-green-500 hover:bg-green-500/10 transition-all"
              >
                <Pentagon size={11} className="text-green-500 animate-pulse" /> Preset Plots
              </button>
              {showShapePicker && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[#0a180a] border border-green-800/50 rounded-lg shadow-2xl shadow-black/50 overflow-hidden min-w-[160px]">
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
                      className="w-full text-left px-4 py-2.5 text-[10px] hover:bg-green-500/10 text-green-300 hover:text-green-200 transition-colors"
                    >
                      {shape.label}
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
                    setActivePreset(null);
                    undoStack.current = []; redoStack.current = [];
                  }}
                  className={`px-2 py-1 text-[9px] font-bold rounded transition-all ${s === metersPerCell
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
                onClick={() => { setPlotPoints([]); setSitePoints([]); setPlotClosed(false); setSiteClosed(false); setDrawMode(null); setRoomSchedule(null); setGeneratedImageUrls([]); setActiveImageIndex(0); setShowGeneratedImage(false); setCompareMode(false); setGenerationError(null); setActivePreset(null); undoStack.current = []; redoStack.current = []; }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded border border-red-900/40 text-red-700 hover:bg-red-500/10 hover:text-red-500 transition-all"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <div className="text-[9px] text-green-900 border border-green-950 rounded px-2 py-1">
              1 cell = {metersPerCell}m &nbsp;|&nbsp; {Math.floor(CANVAS_W / CELL_PX * metersPerCell)}m &times; {Math.floor(CANVAS_H / CELL_PX * metersPerCell)}m
            </div>
          </div>

          {/* Canvas or Generated Image */}
          <div
            className="shrink-0 p-8 flex items-center justify-center relative bg-[#030a03] border-b border-green-900/20 select-none overflow-auto"
            style={{ minHeight: `${CANVAS_H + 64}px` }}
          >
            {showGeneratedImage && generatedImageUrl ? (
              <div className="flex items-center justify-center bg-[#030a03]">
                <img
                  src={generatedImageUrl}
                  alt="AI Generated Floor Plan"
                  style={{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px` }}
                  className="object-contain rounded-lg shadow-2xl shadow-purple-900/30 border border-purple-500/20"
                />
              </div>
            ) : (
              <canvas
                ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
                style={{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px` }}
                className={`block bg-[#020802] rounded-lg shadow-2xl border border-green-900/30 ${drawMode === 'map' ? (isDraggingMap ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleCanvasMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={(e) => { setHoverPoint(null); handleMouseUp(); }}
              />
            )}
          </div>

          {/* Real-time Concept Pipeline Debug Console inside Canvas panel */}
          <div className="h-[360px] shrink-0 border-t border-purple-500/20 bg-[#030903] flex flex-col w-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[#061406] shrink-0">
              <Terminal size={12} className="text-[#00f0ff] animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-[2px] text-purple-300">AI Concept Pipeline Debugger</span>
              <div className="ml-auto text-[8px] text-purple-500 font-mono uppercase">Direct Boundary &rarr; Grok Edit</div>
            </div>

            <div className="flex-1 overflow-auto p-4 flex gap-4 divide-x divide-purple-950/40">
              {/* INPUT: Trace Boundary */}
              <div className="flex-1 flex flex-col gap-3 pr-4 min-w-[320px]">
                <div className="text-[9px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Input Trace Image (Black/White/Red)
                </div>

                <div className="flex overflow-x-auto gap-4 shrink-0 pb-2">
                  {debugStep2TraceImage && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-green-700 uppercase">Input Canvas Trace</span>
                      <img src={debugStep2TraceImage} className="w-32 h-32 rounded border border-green-950 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                </div>
              </div>

              {/* OUTPUT: Stage 1 + Stage 2 */}
              <div className="flex-1 flex flex-col gap-3 pl-4 min-w-[320px]">
                {stage1ImageUrl && isPipeline && (
                  <>
                    <div className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Stage 1: {activeWf.stage1} Output
                    </div>
                    <div className="flex overflow-x-auto gap-4 shrink-0 pb-2">
                      <div className="flex flex-col gap-1 items-center">
                        <span className="text-[7px] text-yellow-600 uppercase">Raw Stage 1 Result</span>
                        <img src={stage1ImageUrl} className="w-32 h-32 rounded border border-yellow-900/40 bg-white object-contain shadow-lg" />
                      </div>
                    </div>
                  </>
                )}

                <div className="text-[9px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  {isPipeline ? `Stage 2: ${activeWf.stage2} Refined Output` : `${activeWf.stage1} CAD Output`}
                </div>

                <div className="flex overflow-x-auto gap-4 shrink-0 pb-2">
                  {generatedImageUrls.map((url, idx) => (
                    <div key={idx} className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-purple-400 uppercase">{isPipeline ? `${activeWf.stage2} Result` : 'Blueprint Result'}</span>
                      <img src={url} className="w-32 h-32 rounded border border-purple-900/40 bg-white object-contain shadow-lg shadow-purple-900/20" />
                    </div>
                  ))}
                </div>

                {/* Prompt Sent to Model */}
                <div className="flex-1 flex flex-col min-h-0">
                  <span className="text-[7px] text-purple-500 uppercase mb-1">System Instructions:</span>
                  <textarea
                    readOnly
                    value={debugStep2SystemPrompt || 'Awaiting generation...'}
                    className="flex-1 bg-[#020502] border border-purple-950/30 rounded p-2 text-[8px] font-mono text-purple-300/80 resize-none focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Chat Panel */}
        <div className="w-[420px] border-l border-green-900/30 bg-[#070f07] flex flex-col shrink-0">
          <div className="px-5 py-3 border-b border-green-900/30 shrink-0">
            <h2 className="text-[11px] font-bold tracking-[3px] uppercase text-green-400">Concept Generator Panel</h2>
            <p className="text-[9px] text-green-800 uppercase tracking-wide mt-0.5">AI Floor Plan Generation Pipeline</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="bg-[#0b140b] border border-green-900/40 rounded-lg p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-green-400 uppercase tracking-widest">
                How it works:
              </h3>
              <ul className="text-[9px] text-green-700/90 list-disc pl-4 space-y-1">
                <li>Trace your site boundary on the canvas.</li>
                <li>Select a workflow — single model for speed, 2-model pipeline for best quality.</li>
                <li>Click Generate. Stage 1 creates the raw floor plan, Stage 2 (if enabled) refines rooms.</li>
              </ul>
            </div>

            {/* Parameter Input Options */}
            <div className="bg-[#0a140a] border border-green-900/40 rounded-lg p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-green-400 uppercase tracking-widest">
                Configure Layout Parameters:
              </h3>

              {/* Workflow Selector */}
              <div className="space-y-1">
                <label className="text-[9px] uppercase text-green-700 font-mono">Generation Workflow</label>
                <select
                  value={workflow}
                  onChange={(e) => setWorkflow(e.target.value)}
                  className="w-full bg-black border border-purple-900/50 rounded px-2.5 py-1.5 text-[10px] text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                >
                  <optgroup label="2-Model Pipeline (Best Quality - Keeps Footprint)">
                    <option value="grok-gpt">Grok + GPT Image 2 Edit [Recommended]</option>
                    <option value="grok-nano">Grok + Nano Banana Pro</option>
                    <option value="grok-kontext">Grok + FLUX Kontext [pro]</option>
                    <option value="flux-klein-gpt">FLUX Klein 9B + GPT Image 2 Edit</option>
                    <option value="flux-klein-nano">FLUX Klein 9B + Nano Banana Pro</option>
                    <option value="flux-kontext-gpt">FLUX Kontext [pro] + GPT Image 2 Edit</option>
                  </optgroup>
                  <optgroup label="Single Model (Faster)">
                    <option value="grok-solo">Grok only</option>
                    <option value="flux-klein-solo">FLUX Klein 9B only</option>
                    <option value="flux-kontext-solo">FLUX Kontext [pro] only</option>
                    <option value="gpt-solo">GPT Image 2 Edit only</option>
                    <option value="gemini-solo">Gemini only</option>
                    <option value="flux-canny-solo">FLUX Canny ControlNet only</option>
                  </optgroup>
                </select>
                {/* Pipeline badge */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  {isPipeline ? (
                    <>
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-purple-900/40 text-purple-400 border border-purple-800/40">STAGE 1</span>
                      <span className="text-[8px] text-purple-600">{activeWf.stage1}</span>
                      <span className="text-[8px] text-green-900">-&gt;</span>
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-blue-900/40 text-blue-400 border border-blue-800/40">STAGE 2</span>
                      <span className="text-[8px] text-blue-600">{activeWf.stage2}</span>
                    </>
                  ) : (
                    <>
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-bold bg-green-900/30 text-green-600 border border-green-800/30">SINGLE</span>
                      <span className="text-[8px] text-green-800">{activeWf.stage1}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] uppercase text-green-700 font-mono">Building Type</label>
                <select
                  value={buildingType}
                  onChange={(e) => {
                    setBuildingType(e.target.value);
                    // Reset config to first sensible default on building type change
                    setRoomConfig('auto');
                  }}
                  className="w-full bg-black border border-green-900/50 rounded px-2.5 py-1.5 text-[10px] text-green-300 font-mono focus:outline-none focus:border-green-500"
                >
                  <option value="multi-residential">Multi-Unit Residential Building</option>
                  <option value="single-residential">Single Private Residence (Bungalow)</option>
                  <option value="healthcare">Healthcare Facility</option>
                  <option value="office">Commercial Office Floor</option>
                </select>
              </div>

              {buildingType === 'multi-residential' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase text-green-700 font-mono">BHK Configuration</label>
                    <select
                      value={roomConfig}
                      onChange={(e) => setRoomConfig(e.target.value)}
                      className="w-full bg-black border border-green-900/50 rounded px-2.5 py-1.5 text-[10px] text-green-300 font-mono focus:outline-none focus:border-green-500"
                    >
                      <option value="auto">Auto / Mix (1BHK-4BHK)</option>
                      <option value="1bhk">Pure 1 BHK Units</option>
                      <option value="2bhk">Pure 2 BHK Units</option>
                      <option value="3bhk">Pure 3 BHK Units</option>
                      <option value="4bhk">Pure 4 BHK Units</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] uppercase text-green-700 font-mono">Number of Flats</label>
                    <select
                      value={flatCount}
                      onChange={(e) => setFlatCount(e.target.value)}
                      className="w-full bg-black border border-green-900/50 rounded px-2.5 py-1.5 text-[10px] text-green-300 font-mono focus:outline-none focus:border-green-500"
                    >
                      <option value="auto">Auto (Determine by Size)</option>
                      <option value="1">1 Flat</option>
                      <option value="2">2 Flats</option>
                      <option value="3">3 Flats</option>
                      <option value="4">4 Flats</option>
                      <option value="5">5 Flats</option>
                      <option value="6">6 Flats</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {isGeneratingImage && (
              <div className="flex justify-start">
                <div className="w-full bg-purple-950/30 border border-purple-900/40 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="animate-pulse text-purple-400 shrink-0" />
                    <span className="text-[10px] text-purple-400 font-bold">
                      {pipelineStage === 'stage2' ? `Stage 2: ${activeWf.stage2} refining rooms...` :
                       isPipeline ? `Stage 1: ${activeWf.stage1} generating base plan...` :
                       `${activeWf.stage1} generating concept plan...`}
                    </span>
                  </div>
                  {isPipeline && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${pipelineStage !== 'stage2' ? 'bg-yellow-400 animate-pulse' : 'bg-yellow-600'}`} />
                      <span className="text-[8px] text-green-700">Stage 1: {activeWf.stage1}</span>
                      <span className="text-[8px] text-green-900 mx-1">-&gt;</span>
                      <div className={`w-2 h-2 rounded-full ${pipelineStage === 'stage2' ? 'bg-blue-400 animate-pulse' : 'bg-blue-900/30'}`} />
                      <span className={`text-[8px] ${pipelineStage === 'stage2' ? 'text-blue-400' : 'text-blue-900/60'}`}>Stage 2: {activeWf.stage2}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {generationError && (
              <div className="bg-red-950/20 border border-red-900/40 rounded-lg p-3 text-[10px] text-red-400 font-mono">
                {generationError}
              </div>
            )}

            {generatedImageUrl && (
              <div className="border border-purple-500/30 rounded-lg bg-purple-950/20 p-4 space-y-3">
                <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={11} /> Concept Layout Generated!
                </div>
                <img src={generatedImageUrl} alt="Generated floor plan" className="w-full rounded border border-purple-900/30" />
                <div className="flex gap-2">
                  <button onClick={() => setShowGeneratedImage(true)} className="flex-1 text-[9px] uppercase tracking-widest text-purple-400 border border-purple-900/30 rounded py-1.5 hover:bg-purple-500/10 transition-all">
                    View Full Size
                  </button>
                  <button
                    onClick={generateConceptImage}
                    disabled={isGeneratingImage}
                    className="flex-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-widest text-amber-400 border border-amber-900/40 rounded py-1.5 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <RefreshCw size={10} className={isGeneratingImage ? 'animate-spin' : ''} />
                    Regenerate
                  </button>
                </div>

                {/* Send layout to other workspaces */}
                <div className="border-t border-purple-900/30 pt-3 space-y-2">
                  <div className="text-[8px] font-bold text-purple-400 uppercase tracking-wider">Send layout to workspace:</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button 
                      onClick={() => handleSendToSection('edit')}
                      className="text-[8px] font-bold uppercase tracking-wider text-green-400 bg-green-950/40 border border-green-900/40 rounded py-1.5 hover:bg-green-900/30 hover:border-green-500/50 transition-all"
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      onClick={() => handleSendToSection('png-to-dxf')}
                      className="text-[8px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950/40 border border-blue-900/40 rounded py-1.5 hover:bg-blue-900/30 hover:border-blue-500/50 transition-all"
                    >
                      📐 Vector
                    </button>
                    <button 
                      onClick={() => handleSendToSection('3d-render')}
                      className="text-[8px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-900/40 rounded py-1.5 hover:bg-amber-900/30 hover:border-amber-500/50 transition-all"
                    >
                      🏢 3D Render
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!generatedImageUrl && !isGeneratingImage && (
              <button
                onClick={generateConceptImage}
                disabled={(sitePoints.length < 3 && plotPoints.length < 3) || isGeneratingImage}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest bg-green-700 border border-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-green-900/30 transition-all"
              >
                <Sparkles size={13} />
                Generate Concept
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
