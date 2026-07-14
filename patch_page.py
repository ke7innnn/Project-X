import re

with open('app/smart-planner/page.tsx', 'r') as f:
    content = f.read()

# 1. Fix bounding box detection threshold > 120
content = re.sub(
    r'if \(data\[idx\] > 50 \|\| data\[idx\+1\] > 50 \|\| data\[idx\+2\] > 50\)',
    'if (data[idx] > 120 || data[idx+1] > 120 || data[idx+2] > 120)',
    content
)

# 2. Fix scale to 0.75
content = re.sub(
    r'const scale = Math.min\(scaleW, scaleH\) \* 0\.70;',
    'const scale = Math.min(scaleW, scaleH) * 0.75;',
    content
)

# 3. Add mathematical cropping logic
crop_logic = """      ctx.drawImage(img, drawX, drawY, img.width * scale, img.height * scale);

      // --- CROP LOGIC ---
      // Mathematically guarantee no pixels exist outside the polygon
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(scaledPts[0].x, scaledPts[0].y);
      for (let i = 1; i < scaledPts.length; i++) {
        ctx.lineTo(scaledPts[i].x, scaledPts[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // --- END CROP LOGIC ---
"""
content = re.sub(
    r'      ctx.drawImage\(img, drawX, drawY, img.width \* scale, img.height \* scale\);',
    crop_logic,
    content
)

with open('app/smart-planner/page.tsx', 'w') as f:
    f.write(content)
