import DxfWriter from 'dxf-writer';

export function generateDXF(
  roomDimensions: Record<string, string>,
  roomLabels: Record<string, string>,
  plotWidth: number,
  plotHeight: number
): string {
  const d = new DxfWriter();
  
  // Set units to Meters
  // 1 unit in DXF = 1 meter.
  d.setUnits('Meters');
  
  // Draw plot boundary
  const pw = plotWidth;
  const ph = plotHeight;
  
  d.addLayer('BOUNDARY', DxfWriter.ACI.RED, 'CONTINUOUS');
  d.setActiveLayer('BOUNDARY');
  
  // Plot boundary box (1:1 Meters)
  d.drawLine(0, 0, pw, 0);
  d.drawLine(pw, 0, pw, ph);
  d.drawLine(pw, ph, 0, ph);
  d.drawLine(0, ph, 0, 0);

  // Add North arrow
  d.addLayer('SYMBOLS', DxfWriter.ACI.YELLOW, 'CONTINUOUS');
  d.setActiveLayer('SYMBOLS');
  const arrowX = pw - 2;
  const arrowY = ph - 2;
  d.drawLine(arrowX, arrowY, arrowX, arrowY + 1.0);
  d.drawLine(arrowX, arrowY + 1.0, arrowX - 0.2, arrowY + 0.6);
  d.drawLine(arrowX, arrowY + 1.0, arrowX + 0.2, arrowY + 0.6);
  d.drawText(arrowX, arrowY + 1.2, 0.25, 0, 'N');

  // Draw rooms on ROOMS layer
  d.addLayer('ROOMS', DxfWriter.ACI.WHITE, 'CONTINUOUS');
  d.setActiveLayer('ROOMS');
  
  // Layout side-by-side as placeholders since the user is expected to trace them in AutoCAD.
  let currentX = 1.0;
  let currentY = 1.0;

  for (const [letter, label] of Object.entries(roomLabels)) {
    const dim = roomDimensions[letter];
    if (!dim) continue;
    
    // Parse '4x5m' or '4×5m'
    const parts = dim.toLowerCase().replace('m', '').split(/x|×|\*/);
    if (parts.length === 2) {
      const w = parseFloat(parts[0].trim());
      const h = parseFloat(parts[1].trim());
      
      if (!isNaN(w) && !isNaN(h)) {
        // Draw room box (1:1 Meters)
        d.drawLine(currentX, currentY, currentX + w, currentY);
        d.drawLine(currentX + w, currentY, currentX + w, currentY + h);
        d.drawLine(currentX + w, currentY + h, currentX, currentY + h);
        d.drawLine(currentX, currentY + h, currentX, currentY);
        
        // Add label (text height 0.2 meters)
        d.drawText(currentX + w / 2, currentY + h / 2, 0.2, 0, `${letter} - ${label}`);
        
        currentX += w + 1.0; // Next room 1m to the right
      }
    }
  }

  return d.toDxfString();
}
