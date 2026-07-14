'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, Loader2, Download, RotateCcw, ImageIcon, Sparkles, RefreshCw, Undo2, Redo2, Maximize2, ImagePlus, X, Move, Terminal, Pentagon } from 'lucide-react';

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
  { label: 'Square (Large)',    id: 'square',    w: 888, h: 888,  falSize: 'square_hd'    },
  { label: 'Landscape (Large)', id: 'landscape', w: 960, h: 636,  falSize: 'landscape_4_3' },
  { label: 'Portrait (Large)',  id: 'portrait',  w: 636, h: 888,  falSize: 'portrait_4_3'  },
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
  'square_hd':    { w: 1024, h: 1024 },
  'square':       { w: 512,  h: 512  },
  'landscape_4_3': { w: 1024, h: 768 },
  'landscape_16_9': { w: 1024, h: 576 },
  'portrait_4_3':  { w: 768,  h: 1024 },
  'portrait_16_9': { w: 576,  h: 1024 },
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

  // 1. Pure white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  // 2. Site polygon — this is the ONLY visual element the AI needs
  if (scaledSitePts.length >= 3) {
    // Light gray interior fill (distinguishes building interior from outside white)
    ctx.fillStyle = '#f0f0f0';
    drawPolygonPath(ctx, scaledSitePts);
    ctx.fill();

    // Thick black outer walls (the AI must preserve these exactly)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 16;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    drawPolygonPath(ctx, scaledSitePts);
    ctx.stroke();
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

// ─── Export clean architectural trace (white canvas, black pencil line) ──
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

  // 1. Fill entire canvas with pure white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  // 2. Draw the trace boundary as a crisp black architectural line
  const scaledPts = scalePoints(
    activePts, canvasW, canvasH, outSize.w, outSize.h, true, 24
  );

  if (scaledPts.length >= 3) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    drawPolygonPath(ctx, scaledPts);
    ctx.stroke();
  }

  // Compress trace to JPEG to prevent massive payloads crashing the Mastermind API
  return offscreen.toDataURL('image/jpeg', 0.8);
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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
      const offscreen = document.createElement('canvas');
      offscreen.width = outSize.w;
      offscreen.height = outSize.h;
      const ctx = offscreen.getContext('2d')!;

      // Point-in-polygon helper (defined early so we can use it in scanner)
      const isPointInPolygon = (p: Point, polygon: Point[]): boolean => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const xi = polygon[i].x, yi = polygon[i].y;
          const xj = polygon[j].x, yj = polygon[j].y;
          const intersect = ((yi > p.y) !== (yj > p.y))
              && (p.x < (xj - xi) * (p.y - yi) / (yj - yi || 1) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      };

      // 1. Calculate polygon bounding box in output resolution
      const scaledPts = scalePoints(activePts, canvasW, canvasH, outSize.w, outSize.h);
      if (scaledPts.length < 3) return resolve(imageUrl); // Fail safe

      let polyMinX = Infinity, polyMaxX = -Infinity, polyMinY = Infinity, polyMaxY = -Infinity;
      scaledPts.forEach(p => {
        if (p.x < polyMinX) polyMinX = p.x;
        if (p.x > polyMaxX) polyMaxX = p.x;
        if (p.y < polyMinY) polyMinY = p.y;
        if (p.y > polyMaxY) polyMaxY = p.y;
      });
      const polyW = polyMaxX - polyMinX;
      const polyH = polyMaxY - polyMinY;

      const polyCx = polyMinX + polyW / 2;
      const polyCy = polyMinY + polyH / 2;

      // 2. Scan the GPT image to find the actual bounding box of the generated layout
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true })!;
      tCtx.drawImage(img, 0, 0);
      const imgData = tCtx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      // Scan for white pixels (R, G, B > 150) representing rooms.
      // We skip a border margin of 50px from all sides to ignore the white top/bottom letterbox bars.
      const margin = 50;
      let fMinX = img.width, fMaxX = 0, fMinY = img.height, fMaxY = 0;
      const stepScan = 2;
      for (let y = margin; y < img.height - margin; y += stepScan) {
        for (let x = margin; x < img.width - margin; x += stepScan) {
          const idx = (y * img.width + x) * 4;
          const isWhite = data[idx] > 150 && data[idx+1] > 150 && data[idx+2] > 150;
          if (isWhite) {
            if (x < fMinX) fMinX = x;
            if (x > fMaxX) fMaxX = x;
            if (y < fMinY) fMinY = y;
            if (y > fMaxY) fMaxY = y;
          }
        }
      }
      if (fMinX >= fMaxX) { fMinX = margin; fMaxX = img.width - margin; fMinY = margin; fMaxY = img.height - margin; }
      
      const floorW = fMaxX - fMinX;
      const floorH = fMaxY - fMinY;
      const floorCx = fMinX + floorW / 2;
      const floorCy = fMinY + floorH / 2;

      // Find boundary points of the layout (where white floors meet dark walls/background)
      const boundaryPts: Point[] = [];
      const step = 2; // Check every 2nd pixel to keep scanner fast
      for (let y = fMinY + step; y < fMaxY - step; y += step) {
        for (let x = fMinX + step; x < fMaxX - step; x += step) {
          const idx = (y * img.width + x) * 4;
          const isWhite = data[idx] > 150 && data[idx+1] > 150 && data[idx+2] > 150;
          if (isWhite) {
            const leftIdx = (y * img.width + (x - step)) * 4;
            const rightIdx = (y * img.width + (x + step)) * 4;
            const topIdx = ((y - step) * img.width + x) * 4;
            const bottomIdx = ((y + step) * img.width + x) * 4;
            
            const isLeftDark = data[leftIdx] < 100 && data[leftIdx+1] < 100 && data[leftIdx+2] < 100;
            const isRightDark = data[rightIdx] < 100 && data[rightIdx+1] < 100 && data[rightIdx+2] < 100;
            const isTopDark = data[topIdx] < 100 && data[topIdx+1] < 100 && data[topIdx+2] < 100;
            const isBottomDark = data[bottomIdx] < 100 && data[bottomIdx+1] < 100 && data[bottomIdx+2] < 100;
            
            if (isLeftDark || isRightDark || isTopDark || isBottomDark) {
              boundaryPts.push({ x, y });
            }
          }
        }
      }

      // Downsample boundary points to ~150 to keep processing under 2ms
      const maxCheckedPoints = 150;
      const downsampledPts: Point[] = [];
      if (boundaryPts.length > 0) {
        const skip = Math.max(1, Math.floor(boundaryPts.length / maxCheckedPoints));
        for (let i = 0; i < boundaryPts.length; i += skip) {
          downsampledPts.push(boundaryPts[i]);
          if (downsampledPts.length >= maxCheckedPoints) break;
        }
      } else {
        // Fallback grid if no active boundaries found
        downsampledPts.push({ x: floorCx, y: floorCy });
      }

      // Map points relative to floor plan bounding box top-left
      const relPts = downsampledPts.map(p => ({
        x: p.x - fMinX,
        y: p.y - fMinY
      }));

      // 3. Search parameter space for best fit: position + scale (shrinking/scaling)
      const S_max = Math.min(polyW / (floorW || 1), polyH / (floorH || 1));
      let bestScale = S_max * 0.50; // Fallback default
      let bestDrawX = polyCx - (floorCx * bestScale);
      let bestDrawY = polyCy - (floorCy * bestScale);
      let coarseFound = false;

      // Coarse Pass: Search scale from S_max down to 0.15 * S_max
      for (let scale = S_max; scale >= S_max * 0.15; scale -= S_max * 0.025) {
        const layoutW = floorW * scale;
        const layoutH = floorH * scale;
        
        const minDrawX = polyMinX;
        const maxDrawX = polyMaxX - layoutW;
        const minDrawY = polyMinY;
        const maxDrawY = polyMaxY - layoutH;
        
        const rangeX = maxDrawX - minDrawX;
        const rangeY = maxDrawY - minDrawY;
        
        const xSteps = 15;
        const ySteps = 15;
        
        let scaleBestScore = 0;
        let scaleBestX = minDrawX;
        let scaleBestY = minDrawY;
        let scaleBestCenteringDist = Infinity;
        
        for (let ix = 0; ix <= xSteps; ix++) {
          const drawX = minDrawX + (xSteps > 0 ? (rangeX * ix) / xSteps : 0);
          for (let iy = 0; iy <= ySteps; iy++) {
            const drawY = minDrawY + (ySteps > 0 ? (rangeY * iy) / ySteps : 0);
            
            let insideCount = 0;
            for (let k = 0; k < relPts.length; k++) {
              const px = drawX + relPts[k].x * scale;
              const py = drawY + relPts[k].y * scale;
              if (isPointInPolygon({ x: px, y: py }, scaledPts)) {
                insideCount++;
              }
            }
            
            const score = insideCount / (relPts.length || 1);
            
            // Centering score (distance from centroid)
            const layoutCx = drawX + layoutW / 2;
            const layoutCy = drawY + layoutH / 2;
            const dist = Math.hypot(layoutCx - polyCx, layoutCy - polyCy);
            
            if (score > scaleBestScore || (score === scaleBestScore && dist < scaleBestCenteringDist)) {
              scaleBestScore = score;
              scaleBestX = drawX;
              scaleBestY = drawY;
              scaleBestCenteringDist = dist;
            }
          }
        }
        
        // Anti-aliasing / edge noise tolerance: accept 97% points inside
        if (scaleBestScore >= 0.97) {
          bestScale = scale;
          bestDrawX = scaleBestX;
          bestDrawY = scaleBestY;
          coarseFound = true;
          break;
        }
      }

      // If no candidate was 97% inside, look for the candidate that maximizes score
      if (!coarseFound) {
        let globalBestScore = 0;
        let globalBestScale = S_max * 0.50;
        let globalBestX = polyCx - (floorCx * globalBestScale);
        let globalBestY = polyCy - (floorCy * globalBestScale);
        let globalBestCenteringDist = Infinity;

        for (let scale = S_max; scale >= S_max * 0.15; scale -= S_max * 0.025) {
          const layoutW = floorW * scale;
          const layoutH = floorH * scale;
          
          const minDrawX = polyMinX;
          const maxDrawX = polyMaxX - layoutW;
          const minDrawY = polyMinY;
          const maxDrawY = polyMaxY - layoutH;
          
          const rangeX = maxDrawX - minDrawX;
          const rangeY = maxDrawY - minDrawY;
          
          for (let ix = 0; ix <= 15; ix++) {
            const drawX = minDrawX + (rangeX * ix) / 15;
            for (let iy = 0; iy <= 15; iy++) {
              const drawY = minDrawY + (rangeY * iy) / 15;
              
              let insideCount = 0;
              for (let k = 0; k < relPts.length; k++) {
                const px = drawX + relPts[k].x * scale;
                const py = drawY + relPts[k].y * scale;
                if (isPointInPolygon({ x: px, y: py }, scaledPts)) {
                  insideCount++;
                }
              }
              const score = insideCount / (relPts.length || 1);
              const layoutCx = drawX + layoutW / 2;
              const layoutCy = drawY + layoutH / 2;
              const dist = Math.hypot(layoutCx - polyCx, layoutCy - polyCy);
              
              if (score > globalBestScore || (score === globalBestScore && dist < globalBestCenteringDist)) {
                globalBestScore = score;
                globalBestScale = scale;
                globalBestX = drawX;
                globalBestY = drawY;
                globalBestCenteringDist = dist;
              }
            }
          }
        }
        bestScale = globalBestScale;
        bestDrawX = globalBestX;
        bestDrawY = globalBestY;
      }

      // Fine-Tuning Pass: Search a localized area (±10px) with 2px steps
      const fineRange = 10;
      const fineStep = 2;
      let fineBestX = bestDrawX;
      let fineBestY = bestDrawY;
      let fineBestScore = 0;
      let fineBestCenteringDist = Infinity;

      for (let dx = -fineRange; dx <= fineRange; dx += fineStep) {
        for (let dy = -fineRange; dy <= fineRange; dy += fineStep) {
          const candX = bestDrawX + dx;
          const candY = bestDrawY + dy;
          
          let insideCount = 0;
          for (let k = 0; k < relPts.length; k++) {
            const px = candX + relPts[k].x * bestScale;
            const py = candY + relPts[k].y * bestScale;
            if (isPointInPolygon({ x: px, y: py }, scaledPts)) {
              insideCount++;
            }
          }
          
          const score = insideCount / (relPts.length || 1);
          const layoutCx = candX + (floorW * bestScale) / 2;
          const layoutCy = candY + (floorH * bestScale) / 2;
          const dist = Math.hypot(layoutCx - polyCx, layoutCy - polyCy);
          
          if (score > fineBestScore || (score === fineBestScore && dist < fineBestCenteringDist)) {
            fineBestScore = score;
            fineBestX = candX;
            fineBestY = candY;
            fineBestCenteringDist = dist;
          }
        }
      }
      bestDrawX = fineBestX;
      bestDrawY = fineBestY;

      // 4. Fill black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outSize.w, outSize.h);

      // 5. Draw the layout at the mathematically optimal scale and offset
      // Create clipping mask to crop anything bleeding outside the trace boundary
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
      for (let i = 1; i < scaledPts.length; i++) {
        ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
      }
      ctx.closePath();
      ctx.clip();

      // We map the relative offset back to the full image coordinates
      const imgDrawX = bestDrawX - fMinX * bestScale;
      const imgDrawY = bestDrawY - fMinY * bestScale;
      ctx.drawImage(img, imgDrawX, imgDrawY, img.width * bestScale, img.height * bestScale);
      
      ctx.restore();

      // 6. Draw the trace boundary in NEON RED exactly where it belongs
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 14;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
      for (let i = 1; i < scaledPts.length; i++) {
        ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
      }
      ctx.closePath();
      ctx.stroke();

      // Compress to JPEG to prevent massive payloads timing out the API fetch
      resolve(offscreen.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
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

function buildFloorPlanPromptLocal(schedule: any, sitePolygonPoints?: any[]): string {
  const flatCount = schedule.flats.length;
  const bhk = detectBHKTypeLocal(schedule.flats[0]?.rooms || []);
  
  let hasDiagonals = false;
  if (sitePolygonPoints && sitePolygonPoints.length >= 3) {
    for (let i = 0; i < sitePolygonPoints.length; i++) {
      const a = sitePolygonPoints[i];
      const b = sitePolygonPoints[(i + 1) % sitePolygonPoints.length];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx > 0.5 && dy > 0.5) {
        hasDiagonals = true;
        break;
      }
    }
  }

  const diagonalRule = hasDiagonals
    ? `- Orthogonal Internal Walls: All internal room dividers must be orthogonal (perfectly horizontal and vertical). However, any rooms that touch the diagonal outer boundary walls MUST have diagonal outer walls that align with the trace exactly. Do NOT draw flat horizontal or vertical shoulders at the corners to avoid diagonal walls; the outer walls of the rooms must follow the slanted trace lines directly from the corner.`
    : `- Orthogonal Walls: All walls and room dividers (both internal and external) MUST be orthogonal (perfectly horizontal and vertical, forming clean 90-degree rectangular rooms). Avoid drawing diagonal, slanted, or triangular rooms.`;

  const circulationRule = flatCount > 1
    ? `- Include a highly compact, space-efficient circulation core containing one standard staircase and EXACTLY ONE small elevator shaft (LIFT). 
- Place this core in the widest part of the site or against a flat wall. DO NOT force it into the geometric center if the site is narrow/pinched in the middle, as that will push rooms out of the boundary.
- DO NOT draw double elevators, and DO NOT draw a full loop/ring corridor around the core.
- Lobbies and corridors MUST be extremely compact, with a maximum width of 1.2m to 1.5m. Use a simple straight or T-shaped corridor to distribute access. Save as much space as possible.`
    : `- DO NOT draw any public elevator banks, public staircases, or public lobbies. This is a single, private individual residence/bungalow.
- Design it purely as a single home layout, utilizing private doors and direct room-to-room flow (no public corridors).`;

  const layoutSpecificInstructions = schedule.layoutType
    ? `\n\nLAYOUT STRATEGY & ROOM POSITIONING GUIDE (MUST OBEY):\n- Follow this exact spatial layout strategy: ${schedule.layoutType}. Arrange the rooms, corridors, stairs, and entrance lobbies strictly according to these layout directions.`
    : '';

  const flatList = schedule.flats.map((flat: any) => {
    const roomCounts = flat.rooms.reduce((acc: Record<string, number>, r: any) => {
      acc[r.name] = (acc[r.name] || 0) + 1;
      return acc;
    }, {});
    const roomListStr = Object.entries(roomCounts)
      .map(([name, count]) => `${count}x ${name}`)
      .join(', ');
    return `- ${flat.name}: Must contain exactly [ ${roomListStr} ]`;
  }).join('\n');

  return `2D architectural floor plan, professional AutoCAD layout blueprint style. Solid black wall lines on a crisp white background. 

CRITICAL BOUNDARY RULE — READ THIS FIRST:
The source image shows a light gray polygon representing the building footprint, outlined by a thick black boundary wall, on a pure white background. You MUST draw the entire floor plan strictly inside this light gray area. The white area outside is empty space and must remain empty. DO NOT add any extra outer layer, DO NOT expand the building footprint, DO NOT extend walls beyond the outer black boundary. The exterior boundary shape must remain EXACTLY as given — never modify it, never grow it, never add to it. 
- COMPACT & SHRINK TO FIT (100% FREEDOM): You have absolute freedom to make the rooms, bathrooms, and kitchens as small and compact as needed. If the footprint is small or narrow, you MUST scale down and shrink all room and flat dimensions to make them very compact so that they comfortably fit inside the polygon footprint. Prioritize packing all required rooms inside the boundary over making them large.
- RESPECT INWARD INDENTS: The polygon has inward slots, steps, and V-shaped cutouts. You MUST wrap the building footprint around these cutouts. Do NOT draw a straight wall or rooms across these indents. Keep the outside empty space white.
- RESPECT GEOMETRY: Draw the outer walls to trace the exact shape of the polygon footprint. If the polygon has indents, steps, or diagonal lines, the outer walls must step or slope accordingly.

EXACT ROOM REQUIREMENTS PER FLAT (YOU MUST INCLUDE ALL OF THEM):
${flatList}

Layout requirements:
- Compact, high-efficiency residential floor plan containing exactly ${flatCount} separate flats, configured as ${bhk}BHK units.
- All flats must be drawn INWARD from the polygon edge, strictly fitting within the interior but NEVER extending past the outer boundary.
${circulationRule}
- STRICT ROOM COUNT: Each flat MUST contain exactly the rooms listed above. Do not omit any kitchens, bedrooms, or bathrooms!
${diagonalRule}
- VENTILATION & COURTYARDS: You are encouraged to leave empty white pockets (open shafts, air wells, or small courtyards) inside the footprint for ventilation. Do not over-inflate room sizes to force-fill every pixel; keeping rooms compact and well-ventilated is much better.
- Standard residential zoning: Living rooms near entrances, bedrooms and kitchens along exterior walls for windows.

Drawing Aesthetics:
- Clean, minimal, technical black-and-white drafting style. Pure black lines on white.
- Crisp, legible architectural labels inside major spaces (e.g., "LIVING", "BEDROOM", "KITCHEN").
- Standard architectural symbols: door openings with 90-degree swing arcs, window panes in exterior walls.
- ABSOLUTELY NO furniture, no color fills, no textures, no gray gradients, no 3D elements. Pure 2D schematic blueprint lines.${layoutSpecificInstructions}`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SmartPlannerPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const loadPresetShape = useCallback((shape: 'box' | 'l-shape' | 'u-shape' | 't-shape' | 'cruciform') => {
    pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
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
        { x: cx - 80,  y: cy - 150 },
        { x: cx - 80,  y: cy + 40 },
        { x: cx + 80,  y: cy + 40 },
        { x: cx + 80,  y: cy - 150 },
        { x: cx + 200, y: cy - 150 },
        { x: cx + 200, y: cy + 180 },
        { x: cx - 200, y: cy + 180 }
      ];
    } else if (shape === 't-shape') {
      pts = [
        { x: cx - 200, y: cy - 150 },
        { x: cx + 200, y: cy - 150 },
        { x: cx + 200, y: cy - 30 },
        { x: cx + 60,  y: cy - 30 },
        { x: cx + 60,  y: cy + 180 },
        { x: cx - 60,  y: cy + 180 },
        { x: cx - 60,  y: cy - 30 },
        { x: cx - 200, y: cy - 30 }
      ];
    } else if (shape === 'cruciform') {
      pts = [
        { x: cx - 60,  y: cy - 180 },
        { x: cx + 60,  y: cy - 180 },
        { x: cx + 60,  y: cy - 60 },
        { x: cx + 180, y: cy - 60 },
        { x: cx + 180, y: cy + 60 },
        { x: cx + 60,  y: cy + 60 },
        { x: cx + 60,  y: cy + 180 },
        { x: cx - 60,  y: cy + 180 },
        { x: cx - 60,  y: cy + 60 },
        { x: cx - 180, y: cy + 60 },
        { x: cx - 180, y: cy - 60 },
        { x: cx - 60,  y: cy - 60 }
      ];
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
  const [activePreset, setActivePreset] = useState<'box' | 'l-shape' | 'u-shape' | 't-shape' | 'cruciform' | null>(null);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const generatedImageUrl = generatedImageUrls[activeImageIndex] || null;
  const [showGeneratedImage, setShowGeneratedImage] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const generatedImageObjRef = useRef<HTMLImageElement | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [layoutOptions, setLayoutOptions] = useState<{ id: string; name: string; desc: string; flatCount?: number; bhkType?: string; }[] | null>(null);

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
          const dM = (Math.sqrt(dx*dx + dy*dy) / CELL_PX * metersPerCell).toFixed(1);
          let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

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
          const dM = (Math.sqrt(dx*dx + dy*dy) / CELL_PX * metersPerCell).toFixed(1);
          let mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;

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
  }, [plotPoints, sitePoints, plotClosed, siteClosed, hoverPoint, drawMode, isGeneratingImage, CANVAS_W, CANVAS_H, currentRatio, metersPerCell, bgImageLoaded, bgOpacity, bgOffset, bgScale, compareMode, selectedEdge, draggingPoint]);

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
      y: snapToGrid((e.clientY - rect.top  - offsetY) / displayScale),
    };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingPoint) return;
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
      setActivePreset(null);
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
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
          setDraggingPoint({ list: 'plot', index: i });
          return;
        }
      }
      for (let i = 0; i < sitePoints.length; i++) {
        const pt = sitePoints[i];
        if (Math.hypot(pt.x - coords.x, pt.y - coords.y) < 12) {
          pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
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

  // ── Generate floor plan image via GPT-Image-2 ────────────────────────────
  const generateFloorPlanImage = async (schedule: RoomSchedule, resumeStep2 = false) => {
    if (resumeStep2 && debugStep15Schematic && debugStep2TraceImage) {
      setIsGeneratingImage(true);
      setGenerationPhase('step2');
      setGenerationError(null);
      try {
        const step2Res = await fetch('/api/generate-floorplan-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schematicBase64: debugStep15Schematic,
            traceCanvasBase64: debugStep2TraceImage,
            aspectRatio: ratioId === 'square' ? '1:1' : ratioId === 'landscape' ? '4:3' : '3:4',
            mastermindPrompt: mastermindStrategy,
          }),
        });
        const step2Data = await step2Res.json();
        if (!step2Res.ok || step2Data.error) throw new Error(step2Data.error || 'Step 2 Generation failed');

        setDebugStep2SystemPrompt(step2Data.systemPrompt || '');
        setDebugStep2UserPrompt(step2Data.userPrompt || '');
        setGeneratedImageUrls(step2Data.imageUrls || []);
        setActiveImageIndex(0);
        setShowGeneratedImage(true);
      } catch (err: any) {
        setGenerationError('Image generation failed: ' + err.message);
        console.error('[SmartPlanner] Image gen error:', err);
      } finally {
        setIsGeneratingImage(false);
        setGenerationPhase('idle');
      }
      return;
    }

    const plotPts = plotClosed ? plotPoints : [];
    // If the user drew site points (cyan) but forgot to close the polygon, auto-close it for the AI if >= 3 points exist
    const sitePts = (siteClosed || sitePoints.length >= 3) ? sitePoints : plotPts;
    const activePts = sitePts.length > 0 ? sitePts : plotPts;

    if (activePts.length < 3) {
      setGenerationError('No polygon traced — please trace your site boundary first');
      return;
    }

    setIsGeneratingImage(true);
    setGenerationPhase('step1');
    setGenerationError(null);
    setShowGeneratedImage(false);

    try {
      // Export at the EXACT fal.ai output resolution to prevent rescale drift
      const imageBase64 = exportCanvasForAI(plotPts, sitePts, CANVAS_W, CANVAS_H, currentRatio.falSize);
      const maskBase64 = exportMaskForAI(activePts, CANVAS_W, CANVAS_H, currentRatio.falSize);
      const visualTraceBase64 = exportCleanTraceForAI(activePts, CANVAS_W, CANVAS_H, currentRatio.falSize);

      // Pre-calculate prompts locally to display instantly in the debug console
      const meterPoints = activePts.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) }));
      const localStep1Prompt = buildFloorPlanPromptLocal(schedule, meterPoints);
      const localStep2SystemPrompt = `<role>
You are an expert CAD draftsman and master architect specializing in strict floor plan shape-fitting.
</role>

<critical_rules>
1. THE SHAPE IS SACRED: You MUST replicate the EXACT geometry and shape of the outer black outline from the SECONDARY IMAGE. Do NOT simplify, do NOT smooth out, and do NOT skip any corners, indents, diagonals, or steps. The generated exterior wall must match the provided black boundary shape with 100% fidelity.
2. NO CHAMFERED OR BEVELED CORNERS: All outer corners of the building must remain sharp, exact angles matching the trace. Do NOT chamfer, bevel, slant, or cut off the corners of the building at 45-degree angles. If the trace has a 90-degree corner, the generated wall must meet at a sharp 90-degree corner.
3. NO MICRO-STEPS OR BUMPS: Do not add tiny steps, bumps, or jagged edges to the outer walls just to fit windows or toilets. A long straight diagonal wall must remain a single, unbroken straight line from corner to corner.
4. PRESERVE HORIZONTALS & VERTICALS: If a wall in the boundary trace is perfectly horizontal (like a flat bottom base) or perfectly vertical, your generated wall MUST also be perfectly horizontal or vertical. Do not tilt, slant, or curve it!
5. ROOMS CAN SHRINK OR DEFORM: To make the layout fit inside this exact boundary, you are allowed to shrink the rooms, squish them, or give them diagonal walls. DO NOT change the outer boundary to make rooms rectangular. The outer boundary shape MUST NOT CHANGE. The rooms must adjust to fit the boundary, not the other way around.
6. Every flat, corridor, staircase, and room shown in the primary image must be preserved. Do not omit any flats or rooms!
</critical_rules>

<aesthetics>
- The black outline itself is the boundary — the area outside is empty.
- The output must be a clean, technical blueprint style: black lines on a pure white background.
- Include doors, windows, and labels inside.
- You MUST generate the final image in a strictly ${ratioId === 'square' ? '1:1' : ratioId === 'landscape' ? '4:3' : '3:4'} aspect ratio.
</aesthetics>`;

      const localStep2UserPrompt = `PRIMARY IMAGE (GPT'S LAYOUT WITH ROOMS): [Step 1 Image]
SECONDARY IMAGE (THE TRACE EXTERIOR - MUST NOT CHANGE): [12px Trace Image]

<task>
You have 3 simple but strict jobs:
1. The exterior trace boundary (from the SECONDARY IMAGE) MUST remain exactly the same. Do not make a single change to the trace shape.
2. All rooms and flats shown in the PRIMARY IMAGE (GPT's layout) MUST be placed inside the trace. Do not miss any rooms.
3. You have full freedom to shrink the room sizes and change the layout a little to make it all fit perfectly inside the trace, as long as you do not expand or change the exterior trace.

Design option variant identifier: [seed_id]. Make the layout slightly different from other variations.
</task>`;

      // Reset old outputs and save initial canvas exports + pre-calculated prompts to debug state
      setDebugStep1OutputUrl('');
      setDebugStep1BaseImage(imageBase64);
      setDebugStep1MaskImage(maskBase64);
      setDebugStep2TraceImage(visualTraceBase64);
      setDebugStep1Prompt(localStep1Prompt);
      setDebugStep2SystemPrompt(localStep2SystemPrompt);
      setDebugStep2UserPrompt(localStep2UserPrompt);

      // STEP 1: Generate Raw Layout with GPT-Image-2 (on fal.ai)
      const step1Res = await fetch('/api/generate-floorplan-step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          maskBase64,
          visualTraceBase64,
          roomSchedule: schedule,
          imageSize: currentRatio.falSize,
          sitePolygonPoints: activePts.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) })),
          circulationCoreLocation: (() => {
            const centroidPx = computePolygonCentroid(activePts);
            return { x: +pxToMScaled(centroidPx.x).toFixed(1), y: +pxToMScaled(centroidPx.y).toFixed(1) };
          })(),
        }),
      });

      const step1Data = await step1Res.json();
      if (!step1Res.ok || step1Data.error) throw new Error(step1Data.error || 'Step 1 Generation failed');

      // Save Step 1 output image to debug state
      setDebugStep1OutputUrl(step1Data.imageUrl || '');

      // STEP 1.5: Algorithmic Zoom-Out + Mastermind Strategy Prompt
      setGenerationPhase('mastermind');
      console.log('[FloorPlan] Zooming out GPT layout to safely fit inside trace bounds...');
      
      const safelyScaledBase64 = await scaleImageToFitPolygon(
        step1Data.imageUrl,
        activePts,
        CANVAS_W,
        CANVAS_H,
        currentRatio.falSize
      );
      
      console.log('[FloorPlan] Invoking Mastermind strategy calculation...');
      const mastermindRes = await fetch('/api/floorplan-mastermind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step1ImageUrl: safelyScaledBase64,
          traceCanvasBase64: visualTraceBase64,
          sitePolygonPoints: activePts.map(p => ({ x: pxToMScaled(p.x), y: pxToMScaled(p.y) })),
          roomSchedule: schedule
        })
      });

      const mastermindData = await mastermindRes.json();
      if (!mastermindRes.ok || mastermindData.error) {
        throw new Error(mastermindData.error || 'Mastermind layout calculation failed');
      }

      console.log('[FloorPlan] Mastermind strategy generated.');
      setDebugStep15Schematic(safelyScaledBase64); // We use the zoomed-out layout for Step 2!
      setMastermindStrategy(mastermindData.mastermindPrompt || '');

      // STEP 2: Style Polish & Render (Fal.ai / OpenAI)
      setGenerationPhase('step2');
      const step2Res = await fetch('/api/generate-floorplan-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schematicBase64: safelyScaledBase64,
          traceCanvasBase64: visualTraceBase64,
          aspectRatio: ratioId === 'square' ? '1:1' : ratioId === 'landscape' ? '4:3' : '3:4',
          mastermindPrompt: mastermindData.mastermindPrompt || '',
        }),
      });

      const step2Data = await step2Res.json();
      if (!step2Res.ok || step2Data.error) throw new Error(step2Data.error || 'Step 2 Generation failed');

      // Save Step 2 outputs to debug state
      setDebugStep2SystemPrompt(step2Data.systemPrompt || '');
      setDebugStep2UserPrompt(step2Data.userPrompt || '');

      setGeneratedImageUrls(step2Data.imageUrls || []);
      setActiveImageIndex(0);
      setShowGeneratedImage(true);
    } catch (err: any) {
      setGenerationError('Image generation failed: ' + err.message);
      console.error('[SmartPlanner] Image gen error:', err);
    } finally {
      setIsGeneratingImage(false);
      setGenerationPhase('idle');
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
          {debugStep15Schematic && (
            <button 
              onClick={() => { if (roomSchedule) generateFloorPlanImage(roomSchedule, true); }}
              className="text-[9px] uppercase tracking-widest px-2 py-1 bg-green-900/50 hover:bg-green-800 text-green-300 rounded border border-green-700 transition-colors"
            >
              Retry Step 2
            </button>
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
              <div className="flex items-center gap-2 border border-blue-900/60 bg-[#050c18] px-3 py-1 rounded-md text-blue-300 transition-all select-none">
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400">
                  Edge #{(selectedEdge.index + 1)}:
                </span>
                
                {/* Split segment / add vertex button */}
                <button
                  onClick={() => {
                    pushUndo({ plotPts: plotPoints, sitePts: sitePoints, plotClosed, siteClosed });
                    const pts = selectedEdge.list === 'plot' ? [...plotPoints] : [...sitePoints];
                    const setPts = selectedEdge.list === 'plot' ? setPlotPoints : setSitePoints;

                    const i = selectedEdge.index;
                    const p1 = pts[i];
                    const p2 = pts[(i + 1) % pts.length];

                    // Calculate midpoint on line
                    let mx = (p1.x + p2.x) / 2;
                    let my = (p1.y + p2.y) / 2;

                    // Insert the new vertex point
                    pts.splice(i + 1, 0, { x: snapToGrid(mx), y: snapToGrid(my) });
                    setPts(pts);
                    setSelectedEdge(null);
                  }}
                  className="px-2 py-1 text-[9px] uppercase font-semibold bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded border border-blue-500/30 transition-all font-mono"
                >
                  Split Edge
                </button>

                <button
                  onClick={() => setSelectedEdge(null)}
                  className="text-blue-500 hover:text-blue-300 p-0.5"
                  title="Close"
                >
                  <X size={12} />
                </button>
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
                    { label: 'Cruciform (Cross)', id: 'cruciform' }
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
                onClick={() => { setPlotPoints([]); setSitePoints([]); setPlotClosed(false); setSiteClosed(false); setDrawMode(null); setRoomSchedule(null); setGeneratedImageUrls([]); setActiveImageIndex(0); setShowGeneratedImage(false); setCompareMode(false); setGenerationError(null); setActivePreset(null); undoStack.current = []; redoStack.current = []; }}
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

          {/* Real-time Architect Pipeline Debug Console inside Canvas panel */}
          <div className="h-[360px] shrink-0 border-t border-purple-500/20 bg-[#030903] flex flex-col w-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-purple-500/10 bg-[#061406] shrink-0">
              <Terminal size={12} className="text-purple-400 animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-[2px] text-purple-300">AI Architect Pipeline Debugger (Real-time Payloads)</span>
              <div className="ml-auto text-[8px] text-purple-500 font-mono uppercase">Step 1 (Fal) &rarr; Step 2 (Gemini Pro)</div>
            </div>
            
            <div className="flex-1 overflow-auto p-4 flex gap-4 divide-x divide-purple-950/40">
              {/* STEP 1: GPT-Image-2 Input & Output */}
              <div className="flex-1 flex flex-col gap-3 pr-4 min-w-[320px]">
                <div className="text-[9px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Step 1: GPT-Image-2 (DALL-E 2 Inpainting)
                </div>
                
                {/* Images Row */}
                <div className="flex gap-4 shrink-0 overflow-x-auto pb-1">
                  {debugStep1BaseImage && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-green-700 uppercase">1. Base Tracing</span>
                      <img src={debugStep1BaseImage} className="w-24 h-24 rounded border border-green-950 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                  {debugStep1MaskImage && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-green-700 uppercase">2. Inpaint Mask</span>
                      <img src={debugStep1MaskImage} className="w-24 h-24 rounded border border-green-950 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                  {debugStep1OutputUrl && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-purple-400 uppercase">3. Output (Blueprint)</span>
                      <img src={debugStep1OutputUrl} className="w-24 h-24 rounded border border-purple-900/40 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                </div>

                {/* Prompt Text Box */}
                <div className="flex-1 flex flex-col min-h-0">
                  <span className="text-[7px] text-green-700 uppercase mb-1">Step 1 Prompt Sent to Fal.ai:</span>
                  <textarea
                    readOnly
                    value={debugStep1Prompt || 'Awaiting generation...'}
                    className="flex-1 bg-[#020502] border border-green-950/60 rounded p-2 text-[8px] font-mono text-green-400/80 resize-none focus:outline-none"
                  />
                </div>
              </div>

              {/* STEP 2: Nano Banana Pro (Gemini) Input & Output */}
              <div className="flex-1 flex flex-col gap-3 pl-4 min-w-[320px]">
                <div className="text-[9px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /> Step 2: Nano Banana Pro (Strict Tracing)
                </div>

                {/* Images Row */}
                <div className="flex overflow-x-auto gap-4 shrink-0 pb-2">
                  {debugStep1OutputUrl && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-green-700 uppercase">Primary Input (Base Layout)</span>
                      <img src={debugStep1OutputUrl} className="w-32 h-32 rounded border border-green-950 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                  {debugStep2TraceImage && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-green-700 uppercase">Secondary Input (Trace Line)</span>
                      <img src={debugStep2TraceImage} className="w-32 h-32 rounded border border-green-950 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                  {debugStep15Schematic && (
                    <div className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-purple-400 uppercase">Step 1.5 Schematic (Mastermind)</span>
                      <img src={debugStep15Schematic} className="w-32 h-32 rounded border border-purple-950 bg-white object-contain shadow-lg" />
                    </div>
                  )}
                  {generatedImageUrls.map((url, idx) => (
                    <div key={idx} className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-purple-400 uppercase">Nano Banana Pro Output</span>
                      <img src={url} className="w-32 h-32 rounded border border-purple-900/40 bg-white object-contain shadow-lg shadow-purple-900/20" />
                    </div>
                  ))}
                </div>

                {/* System & User Prompts */}
                <div className="flex-1 flex gap-2 min-h-0">
                  <div className="flex-1 flex flex-col min-h-0">
                    <span className="text-[7px] text-purple-500 uppercase mb-1">System Instruction (Strict Rules):</span>
                    <textarea
                      readOnly
                      value={debugStep2SystemPrompt || 'Awaiting generation...'}
                      className="flex-1 bg-[#020502] border border-purple-950/30 rounded p-2 text-[8px] font-mono text-purple-300/80 resize-none focus:outline-none"
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <span className="text-[7px] text-purple-500 uppercase mb-1">User Prompt (Image Context):</span>
                    <textarea
                      readOnly
                      value={debugStep2UserPrompt || 'Awaiting generation...'}
                      className="flex-1 bg-[#020502] border border-purple-950/30 rounded p-2 text-[8px] font-mono text-purple-300/80 resize-none focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
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
                      .replace(/```json\s*\{\s*"options"[\s\S]*?```/g, '<div class="mt-2 text-yellow-500 text-[10px] font-bold uppercase tracking-widest">[✓ Layout Options Generated — Select below]</div>')
                      .replace(/```json[\s\S]*?```/g, '<div class="mt-2 text-green-400 text-[10px] font-bold uppercase tracking-widest">[✓ Room Schedule Generated — Review & click Approve]</div>')
                      .replace(/```[\s\S]*?```/g, '')
                  }} />
                </div>
              </div>
            ))}

            {layoutOptions && (
              <div className="border border-yellow-500/20 bg-yellow-950/10 rounded-lg p-4 space-y-3">
                <div className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Move size={11} /> Select a Layout — Flat Count Pre-Calculated
                </div>
                <p className="text-[9px] text-yellow-600/70 uppercase">Each layout already has the optimal number of flats for your traced shape:</p>
                <div className="grid grid-cols-1 gap-2">
                  {layoutOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => selectLayoutOption(`${opt.name}${opt.flatCount ? ` (${opt.flatCount} flats, ${opt.bhkType ?? ''})` : ''}`)}
                      className="text-left p-3 rounded-lg border border-yellow-950/40 bg-[#070f07] hover:bg-yellow-500/5 hover:border-yellow-500/40 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold text-yellow-400 group-hover:text-yellow-300">{opt.name}</div>
                        {opt.flatCount && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-[9px] font-bold text-yellow-400 whitespace-nowrap">
                            {opt.flatCount} Flats{opt.bhkType ? ` · ${opt.bhkType}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-green-700/80 mt-1 leading-normal">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                    onClick={() => { setGeneratedImageUrls([]); setActiveImageIndex(0); roomSchedule && generateFloorPlanImage(roomSchedule); }}
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
          </div>
        </div>
      </div>
    </main>
  );
}
