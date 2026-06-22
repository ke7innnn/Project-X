import DxfWriter from 'dxf-writer';

export function generateDXF(
  roomDimensions: Record<string, string>,
  roomLabels: Record<string, string>,
  plotWidth: number,
  plotHeight: number
): string {
  const d = new DxfWriter();
  
  // Set units to Millimeters (which is usually default or by drawing units)
  // We'll just write everything in mm.
  d.setUnits('Millimeters');
  
  // Draw plot boundary
  const pw = plotWidth * 1000;
  const ph = plotHeight * 1000;
  
  d.addLayer('BOUNDARY', DxfWriter.ACI.RED, 'CONTINUOUS');
  d.setActiveLayer('BOUNDARY');
  
  // Plot boundary box
  d.drawLine(0, 0, pw, 0);
  d.drawLine(pw, 0, pw, ph);
  d.drawLine(pw, ph, 0, ph);
  d.drawLine(0, ph, 0, 0);

  // Add North arrow
  d.addLayer('SYMBOLS', DxfWriter.ACI.YELLOW, 'CONTINUOUS');
  d.setActiveLayer('SYMBOLS');
  const arrowX = pw - 2000;
  const arrowY = ph - 2000;
  d.drawLine(arrowX, arrowY, arrowX, arrowY + 1000);
  d.drawLine(arrowX, arrowY + 1000, arrowX - 200, arrowY + 600);
  d.drawLine(arrowX, arrowY + 1000, arrowX + 200, arrowY + 600);
  d.drawText(arrowX, arrowY + 1200, 200, 0, 'N');

  // Draw rooms
  d.addLayer('ROOMS', DxfWriter.ACI.WHITE, 'CONTINUOUS');
  d.setActiveLayer('ROOMS');
  
  // We don't have exact coordinates from the AI, just dimensions.
  // In a real DXF generation we would try to pack them or just lay them out side by side.
  // We will layout side-by-side as placeholders since the user is expected to trace them in AutoCAD.
  let currentX = 1000;
  let currentY = 1000;

  for (const [letter, label] of Object.entries(roomLabels)) {
    const dim = roomDimensions[letter];
    if (!dim) continue;
    
    // Parse '4x5m' or '4×5m'
    const parts = dim.toLowerCase().replace('m', '').split(/x|×|\\*/);
    if (parts.length === 2) {
      const w = parseFloat(parts[0].trim()) * 1000;
      const h = parseFloat(parts[1].trim()) * 1000;
      
      if (!isNaN(w) && !isNaN(h)) {
        // Draw room box
        d.drawLine(currentX, currentY, currentX + w, currentY);
        d.drawLine(currentX + w, currentY, currentX + w, currentY + h);
        d.drawLine(currentX + w, currentY + h, currentX, currentY + h);
        d.drawLine(currentX, currentY + h, currentX, currentY);
        
        // Add label
        d.drawText(currentX + w / 2, currentY + h / 2, 200, 0, `${letter} - ${label}`);
        
        currentX += w + 1000; // Next room 1m to the right
      }
    }
  }

  return d.toDxfString();
}
