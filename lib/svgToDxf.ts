import DxfWriter from 'dxf-writer';

interface Point {
  x: number;
  y: number;
}

// Helper to draw a cubic Bezier curve using line segmentation
function drawBezier(
  dxf: DxfWriter,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  segments: number = 8
) {
  let prev = p0;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
    const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
    dxf.drawLine(prev.x, prev.y, x, y);
    prev = { x, y };
  }
}

export function convertSvgToDxf(rawSvg: string, rooms: any[], scalePpm: number): string {
  const dxf = new DxfWriter();
  
  // Set DXF units to Millimeters.
  // 1 meter in real world = 1000 DXF units.
  // Pixel to meter scale: px / scalePpm
  // Final scale factor to mm: 1000 / scalePpm.
  const scale = 1000 / (scalePpm || 20); 
  
  dxf.setUnits('Millimeters');

  // Draw vectorized walls
  dxf.addLayer('WALLS', DxfWriter.ACI.WHITE, 'CONTINUOUS');
  dxf.setActiveLayer('WALLS');

  const pathRegex = /d="([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(rawSvg)) !== null) {
    const d = match[1];
    const tokens = d.match(/[a-zA-Z]+|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g) || [];
    
    let currentPt: Point = { x: 0, y: 0 };
    let startPt: Point = { x: 0, y: 0 };
    let i = 0;
    
    while (i < tokens.length) {
      const cmd = tokens[i];
      if (cmd === 'M' || cmd === 'm') {
        if (i + 2 <= tokens.length) {
          const x = parseFloat(tokens[i+1]) * scale;
          const y = parseFloat(tokens[i+2]) * scale;
          const isRelative = cmd === 'm';
          const nx = isRelative ? currentPt.x + x : x;
          const ny = isRelative ? currentPt.y - y : -y; // SVG Y goes down, DXF Y goes up
          
          currentPt = { x: nx, y: ny };
          startPt = { x: nx, y: ny };
          i += 3;
        } else {
          i++;
        }
      } else if (cmd === 'L' || cmd === 'l') {
        if (i + 2 <= tokens.length) {
          const x = parseFloat(tokens[i+1]) * scale;
          const y = parseFloat(tokens[i+2]) * scale;
          const isRelative = cmd === 'l';
          const nx = isRelative ? currentPt.x + x : x;
          const ny = isRelative ? currentPt.y - y : -y;
          
          dxf.drawLine(currentPt.x, currentPt.y, nx, ny);
          currentPt = { x: nx, y: ny };
          i += 3;
        } else {
          i++;
        }
      } else if (cmd === 'C' || cmd === 'c') {
        if (i + 6 <= tokens.length) {
          const isRelative = cmd === 'c';
          
          const x1 = parseFloat(tokens[i+1]) * scale;
          const y1 = parseFloat(tokens[i+2]) * scale;
          const p1 = {
            x: isRelative ? currentPt.x + x1 : x1,
            y: isRelative ? currentPt.y - y1 : -y1
          };

          const x2 = parseFloat(tokens[i+3]) * scale;
          const y2 = parseFloat(tokens[i+4]) * scale;
          const p2 = {
            x: isRelative ? currentPt.x + x2 : x2,
            y: isRelative ? currentPt.y - y2 : -y2
          };

          const x3 = parseFloat(tokens[i+5]) * scale;
          const y3 = parseFloat(tokens[i+6]) * scale;
          const p3 = {
            x: isRelative ? currentPt.x + x3 : x3,
            y: isRelative ? currentPt.y - y3 : -y3
          };

          drawBezier(dxf, currentPt, p1, p2, p3);
          currentPt = p3;
          i += 7;
        } else {
          i++;
        }
      } else if (cmd === 'Z' || cmd === 'z') {
        dxf.drawLine(currentPt.x, currentPt.y, startPt.x, startPt.y);
        currentPt = startPt;
        i++;
      } else {
        i++;
      }
    }
  }

  // Draw room labels and boundaries
  dxf.addLayer('ROOMS', DxfWriter.ACI.CYAN, 'CONTINUOUS');
  dxf.setActiveLayer('ROOMS');

  rooms.forEach(r => {
    const cx = (r.x + r.width / 2) * scale;
    const cy = -(r.y + r.height / 2) * scale;
    const rx = r.x * scale;
    const ry = -r.y * scale;
    const rw = r.width * scale;
    const rh = -r.height * scale;

    // Draw a rectangle outlining the room
    dxf.drawLine(rx, ry, rx + rw, ry);
    dxf.drawLine(rx + rw, ry, rx + rw, ry + rh);
    dxf.drawLine(rx + rw, ry + rh, rx, ry + rh);
    dxf.drawLine(rx, ry + rh, rx, ry);

    // Place label text in center
    dxf.drawText(cx, cy, 150, 0, r.label || 'Room');
  });

  return dxf.toDxfString();
}
