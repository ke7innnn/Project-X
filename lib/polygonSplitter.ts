export type Point = { x: number; y: number };

export function polygonArea(pts: Point[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(pts: Point[]): Point {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const factor = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * factor;
    cy += (pts[i].y + pts[j].y) * factor;
    a += factor;
  }
  if (a === 0) return pts[0];
  a /= 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Split a convex polygon with a line defined by two points A and B
// Returns [leftPolygon, rightPolygon]
export function splitPolygon(poly: Point[], a: Point, b: Point): [Point[], Point[]] {
  const left: Point[] = [];
  const right: Point[] = [];

  const cross = (p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  
  const getIntersection = (p1: Point, p2: Point) => {
    const d1 = cross(p1);
    const d2 = cross(p2);
    const t = d1 / (d1 - d2);
    return {
      x: p1.x + t * (p2.x - p1.x),
      y: p1.y + t * (p2.y - p1.y)
    };
  };

  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    
    const d1 = cross(p1);
    const d2 = cross(p2);

    if (d1 >= 0) left.push(p1);
    if (d1 <= 0) right.push(p1);

    // If points are on opposite sides, they intersect
    if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) {
      const intersect = getIntersection(p1, p2);
      left.push(intersect);
      right.push(intersect);
    }
  }

  return [left, right];
}

// Sweeps a line across the polygon at a given angle to find the exact split that yields the target area ratio.
export function splitPolygonByRatio(poly: Point[], targetRatio: number, angle: number = 0): [Point[], Point[]] {
  const totalArea = polygonArea(poly);
  if (totalArea === 0 || poly.length < 3) return [poly, []];
  
  // Clamp ratio between 0.01 and 0.99 to avoid creating zero-area polygons due to rounding
  const safeRatio = Math.max(0.01, Math.min(0.99, targetRatio));
  const targetArea = totalArea * safeRatio;

  // Find min and max projection of polygon on the perpendicular to the sweep line
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -dir.y, y: dir.x };
  
  let minP = Infinity, maxP = -Infinity;
  poly.forEach(p => {
    const proj = p.x * perp.x + p.y * perp.y;
    if (proj < minP) minP = proj;
    if (proj > maxP) maxP = proj;
  });

  // Binary search for the split line
  let low = minP;
  let high = maxP;
  let bestLeft: Point[] = poly;
  let bestRight: Point[] = [];
  
  for (let iter = 0; iter < 30; iter++) {
    const mid = (low + high) / 2;
    // Define line passing through mid on the perpendicular axis
    const ptOnLine = { x: mid * perp.x, y: mid * perp.y };
    const pt2 = { x: ptOnLine.x + dir.x, y: ptOnLine.y + dir.y };
    
    const [left, right] = splitPolygon(poly, ptOnLine, pt2);
    const areaLeft = polygonArea(left);
    
    bestLeft = left;
    bestRight = right;

    if (Math.abs(areaLeft - targetArea) < 0.5) break; // Close enough
    
    if (areaLeft < targetArea) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return [bestLeft, bestRight];
}

export type SubdivideItem = { id: string; weight: number; data?: any };

// Recursively slices a polygon using an alternating BSP tree approach to match target area weights perfectly.
export function subdividePolygon(poly: Point[], items: SubdivideItem[], angle: number = 0): { item: SubdivideItem; poly: Point[] }[] {
  if (items.length === 0 || poly.length < 3) return [];
  if (items.length === 1) return [{ item: items[0], poly }];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return items.map(item => ({ item, poly: [] }));

  // Find a split point in the items array that balances weight best
  let bestDiff = Infinity;
  let splitIdx = 1;
  let leftWeight = 0;

  for (let i = 0; i < items.length - 1; i++) {
    leftWeight += items[i].weight;
    const rightWeight = totalWeight - leftWeight;
    const diff = Math.abs(leftWeight - rightWeight);
    if (diff < bestDiff) {
      bestDiff = diff;
      splitIdx = i + 1;
    }
  }

  const leftItems = items.slice(0, splitIdx);
  const rightItems = items.slice(splitIdx);
  const targetRatio = leftItems.reduce((sum, i) => sum + i.weight, 0) / totalWeight;

  const [leftPoly, rightPoly] = splitPolygonByRatio(poly, targetRatio, angle);

  // Alternate slicing angle by 90 degrees (Math.PI/2) for next depth level, adding a slight random noise to avoid parallel artifacts
  const nextAngle = angle + Math.PI / 2 + (Math.random() * 0.2 - 0.1);

  return [
    ...subdividePolygon(leftPoly, leftItems, nextAngle),
    ...subdividePolygon(rightPoly, rightItems, nextAngle)
  ];
}
