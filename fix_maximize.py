import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

maximize_func = """function maximizePoints(pts: Point[], outW: number, outH: number, padding: number = 20): Point[] {
  if (pts.length === 0) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const polyW = maxX - minX;
  const polyH = maxY - minY;
  if (polyW === 0 || polyH === 0) return pts;

  const targetW = outW - padding * 2;
  const targetH = outH - padding * 2;
  const scale = Math.min(targetW / polyW, targetH / polyH);

  const polyCx = minX + polyW / 2;
  const polyCy = minY + polyH / 2;
  const outCx = outW / 2;
  const outCy = outH / 2;

  return pts.map(p => ({
    x: outCx + (p.x - polyCx) * scale,
    y: outCy + (p.y - polyCy) * scale
  }));
}

function scalePoints(pts: Point[], fromW: number, fromH: number, toW: number, toH: number): Point[] {"""

content = content.replace('function scalePoints(pts: Point[], fromW: number, fromH: number, toW: number, toH: number): Point[] {', maximize_func)

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
