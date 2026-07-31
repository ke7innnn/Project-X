const fs = require('fs');
const file = 'components/ArchitectAdvisorPanel.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetStr = `          const bbox = polygonBBox(polygon);
          
          // Optimizer: Find the best center (cx, cy), rotation, and scale to maximize the building footprint.
          // We test a 9x9 grid of possible center points across the bounding box, 
          // Optimizer: Find the best center (cx, cy), rotation, aspect ratio, and scale.
          let bestArea = 0;
          let bestScale = 0.15;
          let bestCx = polygonCentroid(polygon).x;
          let bestCy = polygonCentroid(polygon).y;
          let bestAngle = 0;
          let bestRatio = { rw: 1.0, rh: 1.0 };
          
          // Decouple the building aspect ratio from the plot's bounding box
          const baseSize = Math.max(bbox.w, bbox.h) * 0.85;
          const aspectRatios = [
            { rw: 1.0, rh: 1.0 },   // Square
            { rw: 1.25, rh: 1.0 },  // Slightly wide
            { rw: 1.5, rh: 1.0 },   // Wide
            { rw: 1.75, rh: 1.0 },  // Very wide
            { rw: 2.0, rh: 1.0 }    // Extra wide
          ];
          
          const stepsX = 15;
          const stepsY = 15;
          
          for (let ix = 1; ix < stepsX; ix++) {
            for (let iy = 1; iy < stepsY; iy++) {
              const testCx = bbox.minX + (bbox.w * ix) / stepsX;
              const testCy = bbox.minY + (bbox.h * iy) / stepsY;
              
              // Only test centers that are actually inside the plot
              if (!isPointInPolygon({ x: testCx, y: testCy }, polygon)) continue;
              
              for (const ratio of aspectRatios) {
                const maxW = baseSize * ratio.rw;
                const maxH = baseSize * ratio.rh;
                
                // Test 24 rotations (every 15 degrees) for ultra-precise wedging
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
                  // Math optimization: skip if the maximum possible area for this ratio can't beat our bestArea
                  const minRequiredScale = Math.sqrt(bestArea / (ratio.rw * ratio.rh));
                  if (minRequiredScale >= 1.0) continue;
                  
                  let localMaxScale = 0;
                  // Test down in 2% steps (0.02) for much higher precision
                  for (let scale = 1.0; scale > minRequiredScale; scale -= 0.02) {
                    const testShapes = getShapePoints(suggestedShape, testCx, testCy, maxW * scale, maxH * scale);
                    let allInside = true;
                    
                    for (const pts of testShapes) {
                      const rotatedPts = rotateShape(pts, testCx, testCy, angle);
                      const outlinePts = generateShapeOutlinePoints(rotatedPts, 6); // fewer segments for speed
                      for (const pt of outlinePts) {
                        if (!isPointInPolygon(pt, polygon)) {
                          allInside = false;
                          break;
                        }
                      }
                      if (!allInside) break;
                    }
                    
                    if (allInside) {
                      localMaxScale = scale;
                      break;
                    }
                  }
                  
                  const localArea = ratio.rw * ratio.rh * localMaxScale * localMaxScale;
                  if (localArea > bestArea) {
                    bestArea = localArea;
                    bestScale = localMaxScale;
                    bestCx = testCx;
                    bestCy = testCy;
                    bestAngle = angle;
                    bestRatio = ratio;
                  }
                }
              }
            }
          }
          
          // Apply a healthy 10% visual setback margin so it doesn't touch the property line
          const finalScale = bestScale * 0.90;
          const finalW = baseSize * bestRatio.rw * finalScale;
          const finalH = baseSize * bestRatio.rh * finalScale;
          
          // Generate the final shape using the best configuration
          let shapePolygons = getShapePoints(suggestedShape, bestCx, bestCy, finalW, finalH);
          shapePolygons = shapePolygons.map(pts => rotateShape(pts, bestCx, bestCy, bestAngle));
          
          // Calculate the true physical footprint area of the generated building
          let totalBuildingAreaM2 = 0;
          shapePolygons.forEach(pts => {
             // The shoelace formula (polygonAreaM2) naturally handles holes correctly!
             totalBuildingAreaM2 += polygonAreaM2(pts);
          });
          buildingAreaRef.current = totalBuildingAreaM2;
          finalShapePolygonsRef.current = shapePolygons;`;

const replacement = `          let shapePolygons: Point[][] = [];
          let textCx = 0;
          let textCy = 0;
          
          if (!shapeWasModified) {
            const bbox = polygonBBox(polygon);
            let bestArea = 0;
            let bestScale = 0.15;
            let bestCx = polygonCentroid(polygon).x;
            let bestCy = polygonCentroid(polygon).y;
            let bestAngle = 0;
            let bestRatio = { rw: 1.0, rh: 1.0 };
            
            const baseSize = Math.max(bbox.w, bbox.h) * 0.85;
            const aspectRatios = [
              { rw: 1.0, rh: 1.0 },   { rw: 1.25, rh: 1.0 },
              { rw: 1.5, rh: 1.0 },   { rw: 1.75, rh: 1.0 },
              { rw: 2.0, rh: 1.0 }
            ];
            
            const stepsX = 15;
            const stepsY = 15;
            for (let ix = 1; ix < stepsX; ix++) {
              for (let iy = 1; iy < stepsY; iy++) {
                const testCx = bbox.minX + (bbox.w * ix) / stepsX;
                const testCy = bbox.minY + (bbox.h * iy) / stepsY;
                if (!isPointInPolygon({ x: testCx, y: testCy }, polygon)) continue;
                
                for (const ratio of aspectRatios) {
                  const maxW = baseSize * ratio.rw;
                  const maxH = baseSize * ratio.rh;
                  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
                    const minRequiredScale = Math.sqrt(bestArea / (ratio.rw * ratio.rh));
                    if (minRequiredScale >= 1.0) continue;
                    
                    let localMaxScale = 0;
                    for (let scale = 1.0; scale > minRequiredScale; scale -= 0.02) {
                      const testShapes = getShapePoints(suggestedShape, testCx, testCy, maxW * scale, maxH * scale);
                      let allInside = true;
                      for (const pts of testShapes) {
                        const rotatedPts = rotateShape(pts, testCx, testCy, angle);
                        const outlinePts = generateShapeOutlinePoints(rotatedPts, 6);
                        for (const pt of outlinePts) {
                          if (!isPointInPolygon(pt, polygon)) { allInside = false; break; }
                        }
                        if (!allInside) break;
                      }
                      if (allInside) { localMaxScale = scale; break; }
                    }
                    const localArea = ratio.rw * ratio.rh * localMaxScale * localMaxScale;
                    if (localArea > bestArea) {
                      bestArea = localArea; bestScale = localMaxScale; bestCx = testCx; bestCy = testCy; bestAngle = angle; bestRatio = ratio;
                    }
                  }
                }
              }
            }
            
            const finalScale = bestScale * 0.90;
            const finalW = baseSize * bestRatio.rw * finalScale;
            const finalH = baseSize * bestRatio.rh * finalScale;
            
            shapePolygons = getShapePoints(suggestedShape, bestCx, bestCy, finalW, finalH);
            shapePolygons = shapePolygons.map(pts => rotateShape(pts, bestCx, bestCy, bestAngle));
            
            let totalBuildingAreaM2 = 0;
            shapePolygons.forEach(pts => { totalBuildingAreaM2 += polygonAreaM2(pts); });
            buildingAreaRef.current = totalBuildingAreaM2;
            finalShapePolygonsRef.current = shapePolygons;
            textCx = bestCx;
            textCy = bestCy;
          } else {
            shapePolygons = finalShapePolygonsRef.current || [];
            if (shapePolygons.length > 0) {
               const centroid = getShapeCentroid(shapePolygons);
               textCx = centroid.x;
               textCy = centroid.y;
            }
          }`;

code = code.replace(targetStr, replacement);
code = code.replace(/ctx\.fillText\('BUILDING SHAPE', bestCx, bestCy\);/g, "ctx.fillText('BUILDING SHAPE', textCx, textCy);");
fs.writeFileSync(file, code);
