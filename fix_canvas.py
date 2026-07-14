import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

# Fix exportCanvasForAI
old_canvas = """  // 1. Pure white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  // 2. Site polygon — this is the ONLY visual element the AI needs
  if (scaledSitePts.length >= 3) {
    // Light gray interior fill (distinguishes building interior from outside white)
    ctx.fillStyle = '#f0f0f0';
    drawPolygonPath(ctx, scaledSitePts);
    ctx.fill();

    // Thick black outer walls (the AI must preserve these exactly)
    ctx.strokeStyle = '#000000';"""

new_canvas = """  // 1. Solid BLACK background (as requested by the AI prompt)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, outSize.w, outSize.h);

  // 2. Site polygon — this is the ONLY visual element the AI needs
  if (scaledSitePts.length >= 3) {
    // Pure WHITE interior fill
    ctx.fillStyle = '#ffffff';
    drawPolygonPath(ctx, scaledSitePts);
    ctx.fill();

    // Thick white outer walls (to make the shape slightly bolder)
    ctx.strokeStyle = '#ffffff';"""

content = content.replace(old_canvas, new_canvas)

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
