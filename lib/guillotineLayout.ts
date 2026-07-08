/**
 * guillotineLayout.ts
 *
 * Polygon-aware floor plan layout engine.
 *
 * Algorithm:
 *   1. Binary-search a guillotine cut line through the site polygon
 *      using polygon-clipping's intersection/difference to split it exactly.
 *   2. Cut the site into one sub-polygon per flat (vertical cuts, area-proportional).
 *   3. Cut each flat sub-polygon into room sub-polygons
 *      (orientation chosen from the LLM's w/h ratio).
 *   4. Output PlacedRoom[] where every room is already conforming to the
 *      polygon — no clip mask needed.
 *
 * Units: all coordinates are in canvas pixels (1 cell = CELL_PX px = 1 metre).
 */

import polygonClipping from 'polygon-clipping';

export const CELL_PX = 12; // keep in sync with page.tsx

export interface Point { x: number; y: number; }
export interface Room { code: string; name: string; w: number; h: number; area: number; }
export interface Flat { id: string; name: string; rooms: Room[]; }
export interface PlacedRoom {
  code: string;
  name: string;
  flat: string;
  flatIdx: number;
  poly: Point[];   // polygon vertices — may be non-rectangular near slanted edges
  area: number;    // LLM's m² value (for label display)
}

// ── Internal polygon-clipping types ───────────────────────────────────────────
type GeoCoord = [number, number];
type GeoRing  = GeoCoord[];
type GeoPoly  = GeoRing[];          // [outerRing, ...holes]

// ── Geometry primitives ───────────────────────────────────────────────────────

/** Shoelace formula — exact area in px² */
export function polygonAreaPx(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

/** Area in m² (divides px² by CELL_PX²) */
export function polygonAreaM2(pts: Point[]): number {
  return polygonAreaPx(pts) / (CELL_PX * CELL_PX);
}

/** Centroid of a polygon (for label placement) */
export function polygonCentroid(pts: Point[]): Point {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const f = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * f;
    cy += (pts[i].y + pts[j].y) * f;
    a += f;
  }
  if (Math.abs(a) < 0.001) return pts[0] ?? { x: 0, y: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Axis-aligned bounding box */
function bb(pts: Point[]) {
  const xs = pts.map(p => p.x); const ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// ── Format converters ─────────────────────────────────────────────────────────

function toGeoRing(pts: Point[]): GeoRing {
  const ring: GeoRing = pts.map(p => [p.x, p.y]);
  // polygon-clipping needs closed rings
  ring.push([pts[0].x, pts[0].y]);
  return ring;
}

function fromGeoRing(ring: GeoRing): Point[] {
  // Drop the closing duplicate point
  const pts = ring.map(([x, y]) => ({ x, y }));
  if (pts.length > 1) {
    const f = pts[0], l = pts[pts.length - 1];
    if (Math.abs(f.x - l.x) < 0.01 && Math.abs(f.y - l.y) < 0.01) pts.pop();
  }
  return pts;
}

/** Extract the largest-area outer ring from a MultiPolygon result */
function bestRing(result: ReturnType<typeof polygonClipping.intersection>): Point[] {
  if (!result.length) return [];
  let best: Point[] = [];
  let bestArea = 0;
  for (const poly of result) {
    if (!poly[0]) continue;
    const pts = fromGeoRing(poly[0]);
    const a = polygonAreaPx(pts);
    if (a > bestArea) { bestArea = a; best = pts; }
  }
  return best;
}

// ── Core guillotine cut ───────────────────────────────────────────────────────

const HUGE = 999999;

/**
 * Binary-search a cut line so that the LEFT/TOP piece has area ≈ targetAreaPx.
 * Uses polygon-clipping for exact intersection/difference.
 * Returns [leftOrTopPoly, rightOrBottomPoly].
 */
export function cutPolygon(
  polyPts: Point[],
  targetAreaPx: number,
  orientation: 'vertical' | 'horizontal'
): [Point[], Point[]] {
  const totalArea = polygonAreaPx(polyPts);
  if (totalArea < 1 || polyPts.length < 3) return [polyPts, []];

  // Clamp so we never ask for more than exists
  const target = Math.max(totalArea * 0.01, Math.min(totalArea * 0.99, targetAreaPx));

  const box = bb(polyPts);
  const geoPoly: GeoPoly = [toGeoRing(polyPts)];

  let lo = orientation === 'vertical' ? box.minX : box.minY;
  let hi = orientation === 'vertical' ? box.maxX : box.maxY;
  let bestMid = (lo + hi) / 2;

  for (let iter = 0; iter < 36; iter++) {
    const mid = (lo + hi) / 2;

    // Half-plane that captures the left/top side of the cut
    const clipRect: GeoPoly = [
      orientation === 'vertical'
        ? [[-HUGE, -HUGE], [mid, -HUGE], [mid, HUGE], [-HUGE, HUGE], [-HUGE, -HUGE]]
        : [[-HUGE, -HUGE], [HUGE, -HUGE], [HUGE, mid], [-HUGE, mid], [-HUGE, -HUGE]]
    ];

    const inter = polygonClipping.intersection(geoPoly, clipRect);
    const leftPts = bestRing(inter);
    if (leftPts.length === 0) { lo = mid; continue; }

    const leftArea = polygonAreaPx(leftPts);
    bestMid = mid;

    if (Math.abs(leftArea - target) / totalArea < 0.002) break; // 0.2% tolerance
    if (leftArea < target) lo = mid; else hi = mid;
  }

  // Final cut at bestMid
  const finalClip: GeoPoly = [
    orientation === 'vertical'
      ? [[-HUGE, -HUGE], [bestMid, -HUGE], [bestMid, HUGE], [-HUGE, HUGE], [-HUGE, -HUGE]]
      : [[-HUGE, -HUGE], [HUGE, -HUGE], [HUGE, bestMid], [-HUGE, bestMid], [-HUGE, -HUGE]]
  ];

  const leftResult  = polygonClipping.intersection(geoPoly, finalClip);
  const rightResult = polygonClipping.difference(geoPoly, finalClip);

  const leftPts  = bestRing(leftResult)  || polyPts;
  const rightPts = bestRing(rightResult) || [];

  return [leftPts.length >= 3 ? leftPts : polyPts, rightPts];
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * layoutRoomsByGuillotine
 *
 * Takes the actual traced site polygon (in canvas pixels) and the LLM's
 * room schedule. Returns an array of PlacedRoom where each room's `poly`
 * is a sub-polygon of the site — not a rectangle approximation.
 *
 * Cut orientation is chosen from the LLM's w/h ratio:
 *   wide room  (w >= h) → horizontal cut → horizontal strip, correct aspect
 *   tall room  (h > w)  → vertical cut   → vertical column, correct aspect
 */
export function layoutRoomsByGuillotine(
  flats: Flat[],
  sitePtsPx: Point[]
): PlacedRoom[] {
  const placed: PlacedRoom[] = [];
  if (sitePtsPx.length < 3 || flats.length === 0) return placed;

  // ── 1. Split site into per-flat regions (vertical cuts) ───────────────────
  const flatAreasPx2 = flats.map(f =>
    f.rooms.reduce((s, r) => s + r.area * CELL_PX * CELL_PX, 0)
  );

  let remainingSite = sitePtsPx;
  const flatRegions: { flat: Flat; flatIdx: number; poly: Point[] }[] = [];

  for (let i = 0; i < flats.length; i++) {
    if (remainingSite.length < 3) break;

    if (i === flats.length - 1) {
      // Last flat gets whatever remains
      flatRegions.push({ flat: flats[i], flatIdx: i, poly: remainingSite });
    } else {
      const [flatPoly, rest] = cutPolygon(remainingSite, flatAreasPx2[i], 'vertical');
      if (flatPoly.length >= 3) flatRegions.push({ flat: flats[i], flatIdx: i, poly: flatPoly });
      remainingSite = rest.length >= 3 ? rest : [];
    }
  }

  // ── 2. Split each flat region into rooms ──────────────────────────────────
  flatRegions.forEach(({ flat, flatIdx, poly: flatPoly }) => {
    if (flatPoly.length < 3) return;

    let remainingFlat = flatPoly;

    flat.rooms.forEach((room, roomIdx) => {
      if (remainingFlat.length < 3) return;
      const isLast = roomIdx === flat.rooms.length - 1;
      const roomAreaPx2 = room.area * CELL_PX * CELL_PX;

      // LLM-informed cut orientation:
      // wide room → horizontal strip (cut horizontally) → fills the width
      // tall room → vertical column (cut vertically)    → fills the height
      const orient: 'vertical' | 'horizontal' = room.w >= room.h ? 'horizontal' : 'vertical';

      let roomPoly: Point[];
      if (isLast) {
        roomPoly = remainingFlat;
      } else {
        const [rp, rest] = cutPolygon(remainingFlat, roomAreaPx2, orient);
        roomPoly = rp;
        remainingFlat = rest.length >= 3 ? rest : [];
      }

      if (roomPoly.length >= 3) {
        placed.push({
          code: room.code,
          name: room.name,
          flat: flat.id,
          flatIdx,
          poly: roomPoly,
          area: room.area,
        });
      }
    });
  });

  return placed;
}
