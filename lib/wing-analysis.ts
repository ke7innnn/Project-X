// lib/wing-analysis.ts
// Deterministic shape analysis for the Smart Planner.
// Computes wing tips (outward protrusions), notches (reflex/inward corners),
// and a plain-text geometry summary that gets injected into LLM prompts as
// ground truth — replacing unreliable "count the tips visually" instructions.
//
// Coordinate convention: canvas/screen space — y grows DOWNWARD.

export interface WAPoint {
  x: number;
  y: number;
}

export interface WingTip {
  point: WAPoint;
  angleDeg: number;
  direction: string;
  reach: number; // 0..1, distance from centroid relative to the farthest vertex
}

export interface WingAnalysis {
  isConvex: boolean;
  tipCount: number;
  tips: WingTip[];
  notchCount: number;
  notches: { point: WAPoint; direction: string }[];
  estimatedWings: number;
  complexity: 'simple' | 'medium' | 'complex';
  centroid: WAPoint;
  summaryText: string;
}

function centroidOf(pts: WAPoint[]): WAPoint {
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    a += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Screen coords (y down): 0° = right, 90° = bottom, 180° = left, 270° = top.
function directionLabel(angleDeg: number): string {
  const a = ((angleDeg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return 'right';
  if (a < 67.5) return 'bottom-right';
  if (a < 112.5) return 'bottom';
  if (a < 157.5) return 'bottom-left';
  if (a < 202.5) return 'left';
  if (a < 247.5) return 'top-left';
  if (a < 292.5) return 'top';
  return 'top-right';
}

export function analyzeWings(pts: WAPoint[]): WingAnalysis | null {
  const n = pts.length;
  if (n < 3) return null;

  const c = centroidOf(pts);

  // ── Reflex (inward) corners ────────────────────────────────────────────
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const orient = Math.sign(signedArea) || 1;

  const notches: { point: WAPoint; direction: string }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const cross =
      (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    if (Math.abs(cross) < 1e-6) continue; // collinear, skip
    if (Math.sign(cross) !== orient) {
      const ang = (Math.atan2(cur.y - c.y, cur.x - c.x) * 180) / Math.PI;
      notches.push({ point: cur, direction: directionLabel(ang) });
    }
  }
  const notchCount = notches.length;
  const isConvex = notchCount === 0;

  // ── Protrusion tips: local maxima of distance-from-centroid ───────────
  const dists = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  const maxD = Math.max(...dists) || 1;

  const rawTips: WingTip[] = [];
  for (let i = 0; i < n; i++) {
    const dPrev = dists[(i - 1 + n) % n];
    const dNext = dists[(i + 1) % n];
    if (dists[i] >= dPrev && dists[i] >= dNext && dists[i] >= 0.6 * maxD) {
      const ang = (Math.atan2(pts[i].y - c.y, pts[i].x - c.x) * 180) / Math.PI;
      rawTips.push({
        point: pts[i],
        angleDeg: ang,
        direction: directionLabel(ang),
        reach: dists[i] / maxD,
      });
    }
  }

  // Merge tips within 28° of each other (e.g. the two corners at the end of
  // one bar/arm register as one physical wing tip, not two).
  rawTips.sort((a, b) => a.angleDeg - b.angleDeg);
  const tips: WingTip[] = [];
  for (const t of rawTips) {
    const last = tips[tips.length - 1];
    if (last && Math.abs(t.angleDeg - last.angleDeg) < 28) {
      if (t.reach > last.reach) tips[tips.length - 1] = t;
    } else {
      tips.push(t);
    }
  }
  if (tips.length > 1) {
    const first = tips[0];
    const last = tips[tips.length - 1];
    if (first.angleDeg + 360 - last.angleDeg < 28) {
      if (last.reach > first.reach) tips[0] = last;
      tips.pop();
    }
  }

  // ── Wing estimate ──────────────────────────────────────────────────────
  // Convex shape = one compact mass, no wings. Otherwise wings are protrusion
  // tips separated by notches; an outer elbow corner (L-shape) can register as
  // a tip, so cap by notchCount + 1.
  const estimatedWings = isConvex ? 1 : Math.min(tips.length, notchCount + 1);

  const complexity: 'simple' | 'medium' | 'complex' =
    notchCount === 0 ? 'simple' : notchCount <= 2 ? 'medium' : 'complex';

  const tipList = tips
    .map((t, i) => `tip ${i + 1} pointing ${t.direction} (reach ${(t.reach * 100).toFixed(0)}%)`)
    .join(', ');
  const notchList = notches
    .map((nn, i) => `notch ${i + 1} on the ${nn.direction} side`)
    .join(', ');

  const summaryText = `COMPUTED SHAPE GEOMETRY (calculated mathematically from the exact traced polygon coordinates — this is ground truth; trust it over any visual estimate):
- Vertices: ${n}. Inward notches (reflex corners): ${notchCount}${notchList ? ` [${notchList}]` : ''}.
- Outward protrusion tips: ${tips.length}${tipList ? ` [${tipList}]` : ''}.
- Shape complexity: ${complexity}.
- Wing capacity: ${
    isConvex
      ? 'This is a compact CONVEX mass with NO separate wings — treat it as ONE zone. Default to 1 flat, subdividing only if the usable area clearly supports more.'
      : `approximately ${estimatedWings} distinct wing(s). Suggest AT MOST ${estimatedWings} flats (one flat per wing) unless the user explicitly requests more.`
  }
- Place the shared stair/lift core near the centroid area where the wings meet.`;

  return {
    isConvex,
    tipCount: tips.length,
    tips,
    notchCount,
    notches,
    estimatedWings,
    complexity,
    centroid: c,
    summaryText,
  };
}
