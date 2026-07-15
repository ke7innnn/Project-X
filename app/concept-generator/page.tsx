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
  falSize: string
): string {
  const outSize = FAL_OUTPUT_SIZES[falSize] || { w: canvasW, h: canvasH };
  const offscreen = document.createElement('canvas');
  offscreen.width = outSize.w;
  offscreen.height = outSize.h;
  const ctx = offscreen.getContext('2d')!;

  // 1. Solid black background outside
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  if (activePts.length >= 3) {
    const scaledPts = scalePoints(
      activePts, canvasW, canvasH, outSize.w, outSize.h, true, 24
    );

    // 2. Solid white inside
    ctx.fillStyle = '#ffffff';
    drawPolygonPath(ctx, scaledPts);
    ctx.fill();

    // 3. Thick red boundary trace on the borders
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 14;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    drawPolygonPath(ctx, scaledPts);
    ctx.stroke();
  }

  return offscreen.toDataURL('image/png');
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
      const scaledPts = scalePoints(activePts, canvasW, canvasH, outSize.w, outSize.h, true, 24);
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
          const isWhite = data[idx] > 150 && data[idx + 1] > 150 && data[idx + 2] > 150;
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
          const isWhite = data[idx] > 150 && data[idx + 1] > 150 && data[idx + 2] > 150;
          if (isWhite) {
            const leftIdx = (y * img.width + (x - step)) * 4;
            const rightIdx = (y * img.width + (x + step)) * 4;
            const topIdx = ((y - step) * img.width + x) * 4;
            const bottomIdx = ((y + step) * img.width + x) * 4;

            const isLeftDark = data[leftIdx] < 100 && data[leftIdx + 1] < 100 && data[leftIdx + 2] < 100;
            const isRightDark = data[rightIdx] < 100 && data[rightIdx + 1] < 100 && data[rightIdx + 2] < 100;
            const isTopDark = data[topIdx] < 100 && data[topIdx + 1] < 100 && data[topIdx + 2] < 100;
            const isBottomDark = data[bottomIdx] < 100 && data[bottomIdx + 1] < 100 && data[bottomIdx + 2] < 100;

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
        // Use a 5x5 grid across the bounding box to ensure it shrinks to fit
        const gridSteps = 5;
        for (let i = 0; i <= gridSteps; i++) {
          for (let j = 0; j <= gridSteps; j++) {
            downsampledPts.push({
              x: fMinX + (floorW * i) / gridSteps,
              y: fMinY + (floorH * j) / gridSteps
            });
          }
        }
      }

      // Map points relative to floor plan bounding box top-left
      const relPts = downsampledPts.map(p => ({
        x: p.x - fMinX,
        y: p.y - fMinY
      }));

      // 3. Minimum-shrink algorithm:
      //    Start at S_max (largest possible scale). At each scale, do a 15×15 grid
      //    search for the position where ZERO layout boundary points are outside the
      //    polygon. Stop the instant we find scale+position = zero overflow.
      //    That gives us the minimum shrink needed to fully contain the layout.
      //
      //    If zero overflow is never achieved (very complex shape), we fall back to
      //    the scale/position that had the fewest overflow points.

      const S_max = Math.min(1.0, Math.min(polyW / (floorW || 1), polyH / (floorH || 1)));
      const SCALE_STEP = 0.005;   // 0.5% per step
      const MAX_STEPS  = Math.ceil(S_max / SCALE_STEP); // allow up to 100% shrink if needed to fit perfectly
      const GRID_N     = 15;      // 15×15 = 225 candidate positions per scale

      let bestScale = S_max;
      let bestDrawX = polyCx - floorCx * S_max;
      let bestDrawY = polyCy - floorCy * S_max;
      let bestOverflowSeen = Infinity;
      let foundZeroOverflow = false;

      for (let si = 0; si <= MAX_STEPS; si++) {
        const scale = S_max - SCALE_STEP * si;
        if (scale <= 0) break;

        const layoutW = floorW * scale;
        const layoutH = floorH * scale;

        const minDrawX = polyMinX;
        const maxDrawX = Math.max(polyMinX, polyMaxX - layoutW);
        const minDrawY = polyMinY;
        const maxDrawY = Math.max(polyMinY, polyMaxY - layoutH);
        const rangeX   = maxDrawX - minDrawX;
        const rangeY   = maxDrawY - minDrawY;

        let stepBestOverflow = Infinity;
        let stepBestDist     = Infinity;
        let stepBestX = minDrawX + rangeX / 2;
        let stepBestY = minDrawY + rangeY / 2;

        for (let ix = 0; ix <= GRID_N; ix++) {
          const drawX = minDrawX + (GRID_N > 0 ? (rangeX * ix) / GRID_N : 0);
          for (let iy = 0; iy <= GRID_N; iy++) {
            const drawY = minDrawY + (GRID_N > 0 ? (rangeY * iy) / GRID_N : 0);

            // Count how many layout boundary points land outside the polygon
            let overflow = 0;
            for (const rp of relPts) {
              if (!isPointInPolygon({ x: drawX + rp.x * scale, y: drawY + rp.y * scale }, scaledPts)) {
                overflow++;
              }
            }

            // Tiebreak: prefer more centred layout
            const dist = Math.hypot(drawX + layoutW / 2 - polyCx, drawY + layoutH / 2 - polyCy);
            if (overflow < stepBestOverflow || (overflow === stepBestOverflow && dist < stepBestDist)) {
              stepBestOverflow = overflow;
              stepBestDist     = dist;
              stepBestX = drawX;
              stepBestY = drawY;
            }
          }
        }

        if (stepBestOverflow === 0) {
          // Zero overflow at this (largest so far) scale — perfect result
          bestScale = scale;
          bestDrawX = stepBestX;
          bestDrawY = stepBestY;
          foundZeroOverflow = true;
          break;
        }

        // Track the globally best result in case we never reach zero
        if (stepBestOverflow < bestOverflowSeen) {
          bestOverflowSeen = stepBestOverflow;
          bestScale  = scale;
          bestDrawX  = stepBestX;
          bestDrawY  = stepBestY;
        }
      }

      // Fine-tune: ±15px in 1px steps at the chosen scale to nail the exact sweet spot
      {
        const fineRange = 15;
        let fineBestX        = bestDrawX;
        let fineBestY        = bestDrawY;
        let fineBestOverflow = Infinity;
        let fineBestDist     = Infinity;

        for (let dx = -fineRange; dx <= fineRange; dx++) {
          for (let dy = -fineRange; dy <= fineRange; dy++) {
            const candX = bestDrawX + dx;
            const candY = bestDrawY + dy;
            let overflow = 0;
            for (const rp of relPts) {
              if (!isPointInPolygon({ x: candX + rp.x * bestScale, y: candY + rp.y * bestScale }, scaledPts)) {
                overflow++;
              }
            }
            const dist = Math.hypot(candX + (floorW * bestScale) / 2 - polyCx, candY + (floorH * bestScale) / 2 - polyCy);
            if (overflow < fineBestOverflow || (overflow === fineBestOverflow && dist < fineBestDist)) {
              fineBestOverflow = overflow;
              fineBestDist     = dist;
              fineBestX = candX;
              fineBestY = candY;
            }
          }
        }
        bestDrawX = fineBestX;
        bestDrawY = fineBestY;
      }

      // 3.5 Detect overflow boundary points (white layout pixels outside polygon after best fit)
      const overflowSrcPts: { srcX: number; srcY: number }[] = [];
      for (let k = 0; k < relPts.length; k++) {
        const canvX = bestDrawX + relPts[k].x * bestScale;
        const canvY = bestDrawY + relPts[k].y * bestScale;
        if (!isPointInPolygon({ x: canvX, y: canvY }, scaledPts)) {
          overflowSrcPts.push({ srcX: fMinX + relPts[k].x, srcY: fMinY + relPts[k].y });
        }
      }
      console.log(`[SmartPlanner] scaleImageToFitPolygon — scale: ${bestScale.toFixed(3)}, overflow pts: ${overflowSrcPts.length}/${relPts.length}`);

      // 4. Fill black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outSize.w, outSize.h);

      // 5. Draw the layout at the best scale and position, clipped to polygon
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
      for (let i = 1; i < scaledPts.length; i++) ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
      ctx.closePath();
      ctx.clip();
      const imgDrawX = bestDrawX - fMinX * bestScale;
      const imgDrawY = bestDrawY - fMinY * bestScale;
      ctx.drawImage(img, imgDrawX, imgDrawY, img.width * bestScale, img.height * bestScale);
      ctx.restore();

      // 6. Overflow Correction Pass:
      //    For any layout content that sticks outside the polygon, crop just that region
      //    from the source, translate it inward to the nearest empty polygon interior space,
      //    and redraw it — seamlessly connected to the main layout with no gaps or cuts.
      if (overflowSrcPts.length > 5) {
        // Compute bounding box of overflow in source image coordinates
        let ovMinX = Infinity, ovMaxX = -Infinity, ovMinY = Infinity, ovMaxY = -Infinity;
        let avgCanvX = 0, avgCanvY = 0;
        for (const p of overflowSrcPts) {
          if (p.srcX < ovMinX) ovMinX = p.srcX;
          if (p.srcX > ovMaxX) ovMaxX = p.srcX;
          if (p.srcY < ovMinY) ovMinY = p.srcY;
          if (p.srcY > ovMaxY) ovMaxY = p.srcY;
          avgCanvX += imgDrawX + p.srcX * bestScale;
          avgCanvY += imgDrawY + p.srcY * bestScale;
        }
        avgCanvX /= overflowSrcPts.length;
        avgCanvY /= overflowSrcPts.length;

        // Direction to push: toward polygon centroid
        const dirX = polyCx - avgCanvX;
        const dirY = polyCy - avgCanvY;
        const dirLen = Math.hypot(dirX, dirY) || 1;
        const dirNX = dirX / dirLen;
        const dirNY = dirY / dirLen;

        // Walk step-by-step toward centroid until the overflow centroid lands inside polygon
        let corrX = 0, corrY = 0;
        for (let step = 5; step <= 400; step += 5) {
          const testX = avgCanvX + dirNX * step;
          const testY = avgCanvY + dirNY * step;
          if (isPointInPolygon({ x: testX, y: testY }, scaledPts)) {
            corrX = dirNX * step;
            corrY = dirNY * step;
            break;
          }
        }

        if (corrX !== 0 || corrY !== 0) {
          // Add overlap padding so the correction blends seamlessly with the main draw
          const padPx = Math.round(30 / bestScale);
          const cropSrcX = Math.max(0, Math.round(ovMinX) - padPx);
          const cropSrcY = Math.max(0, Math.round(ovMinY) - padPx);
          const cropSrcW = Math.min(img.width - cropSrcX, Math.round(ovMaxX - ovMinX) + padPx * 2);
          const cropSrcH = Math.min(img.height - cropSrcY, Math.round(ovMaxY - ovMinY) + padPx * 2);

          if (cropSrcW > 0 && cropSrcH > 0) {
            const destX = imgDrawX + cropSrcX * bestScale + corrX;
            const destY = imgDrawY + cropSrcY * bestScale + corrY;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
            for (let i = 1; i < scaledPts.length; i++) ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
            ctx.closePath();
            ctx.clip();
            // Draw the overflow crop at the corrected inward position
            ctx.drawImage(img, cropSrcX, cropSrcY, cropSrcW, cropSrcH, destX, destY, cropSrcW * bestScale, cropSrcH * bestScale);
            ctx.restore();
            console.log(`[SmartPlanner] Overflow correction applied — pushed (${corrX.toFixed(0)}, ${corrY.toFixed(0)})px inward`);
          }
        }
      }

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

// buildFloorPlanPromptLocal removed — prompt is now built server-side in /api/generate-floorplan-step1/route.ts
// The debug panel reads the actual prompt returned by the API (step1Data.prompt).

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

    // ── Snap indicator + real-time annotation (while drawing) ─────────────
    if (drawMode && hoverPoint) {
      const pts = drawMode === 'plot' ? plotPoints : sitePoints;
      const color = drawMode === 'plot' ? '#f97316' : '#00f0ff';
      const colorLight = drawMode === 'plot' ? '#fb923c' : '#67e8f9';

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
      y: snapToGrid((e.clientY - rect.top - offsetY) / displayScale),
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

    try {
      // Export layout trace using the custom black/white/red format
      const traceCanvasBase64 = exportBlackWhiteRedTraceForAI(activePts, CANVAS_W, CANVAS_H, currentRatio.falSize);
      
          // Save input trace to debug state
      setDebugStep2TraceImage(traceCanvasBase64);

      console.log('[ConceptGenerator] Calling Direct Concept Generator API...');
      const res = await fetch('/api/generate-concept-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traceCanvasBase64 }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Concept generation failed');

      setDebugStep2SystemPrompt(data.systemPrompt || '');
      setDebugStep2UserPrompt(data.userPrompt || '');

      // Hard-clip the output to the polygon boundary to clean up exterior bleed
      console.log('[ConceptGenerator] Applying hard polygon clip to Grok output...');
      const rawUrls: string[] = data.imageUrls || [];
      const clippedUrls = await Promise.all(
        rawUrls.map(url =>
          scaleImageToFitPolygon(url, activePts, CANVAS_W, CANVAS_H, currentRatio.falSize)
            .catch(() => url)
        )
      );

      setGeneratedImageUrls(clippedUrls);
      setActiveImageIndex(0);
      setShowGeneratedImage(true);
    } catch (err: any) {
      setGenerationError('Concept generation failed: ' + err.message);
      console.error('[ConceptGenerator] Error:', err);
    } finally {
      setIsGeneratingImage(false);
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

              {/* OUTPUT: Grok Generated CAD Blueprint */}
              <div className="flex-1 flex flex-col gap-3 pl-4 min-w-[320px]">
                <div className="text-[9px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /> Grok Edit CAD Output
                </div>

                <div className="flex overflow-x-auto gap-4 shrink-0 pb-2">
                  {generatedImageUrls.map((url, idx) => (
                    <div key={idx} className="flex flex-col gap-1 items-center">
                      <span className="text-[7px] text-purple-400 uppercase">Clipped Blueprint Result</span>
                      <img src={url} className="w-32 h-32 rounded border border-purple-900/40 bg-white object-contain shadow-lg shadow-purple-900/20" />
                    </div>
                  ))}
                </div>

                {/* Prompt Sent to Grok */}
                <div className="flex-1 flex flex-col min-h-0">
                  <span className="text-[7px] text-purple-500 uppercase mb-1">System Instructions Sent to Grok:</span>
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
            <p className="text-[9px] text-green-800 uppercase tracking-wide mt-0.5">Instant Concept Blueprints via Grok Edit</p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <div className="bg-[#0b140b] border border-green-900/40 rounded-lg p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-green-400 uppercase tracking-widest">
                How it works:
              </h3>
              <ul className="text-[9px] text-green-700/90 list-disc pl-4 space-y-1">
                <li>Trace your site boundary using the Plot or Site Extension tools on the canvas.</li>
                <li>All advanced tools (Snapping, Preset shapes, Map overlays, Splitting lines, and Curves) are fully active.</li>
                <li>Click the generate button below. Grok Edit will automatically invent a detailed CAD layout fitting perfectly inside the trace boundaries.</li>
              </ul>
            </div>

            {isGeneratingImage && (
              <div className="flex justify-start">
                <div className="w-full bg-purple-950/30 border border-purple-900/40 rounded-lg px-4 py-3 flex items-center gap-2">
                  <Sparkles size={14} className="animate-pulse text-purple-400 shrink-0" />
                  <span className="text-[10px] text-purple-400">Grok is designing CAD concept plan...</span>
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
