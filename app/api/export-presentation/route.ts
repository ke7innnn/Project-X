import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { format, mode, theme, projectData } = body;

    if (format === 'pdf') {
      return NextResponse.json({ error: 'PDF generation is coming soon. Please use PPTX for now.' }, { status: 400 });
    }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    // Theme Configs & Color Tokens
    const isCream = theme === 'cream';
    const bgColor = isCream ? 'FAF7F0' : '0B0B0D';
    const primaryColor = isCream ? '1A1712' : 'F4F1EB';
    const secondaryColor = isCream ? '1A1712' : 'F4F1EB';
    const mutedColor = isCream ? '6B6357' : '8A867E';
    const accentColor = isCream ? '243D2C' : 'C9A96A';
    const borderHex = isCream ? 'DAD2C4' : '222226';
    const headingFont = isCream ? 'Georgia' : 'Franklin Gothic Medium';
    const textFont = isCream ? 'Arial' : 'Calibri';

    if (mode === 'auto') {
      const { assets } = body;
      const totalSlides = 5 + (assets.angles ? assets.angles.length : 0);
      let currentIdx = 0;

      // Slide 1: Cover
      const titleSlide = pptx.addSlide();
      titleSlide.background = { color: bgColor };
      titleSlide.addText(projectData.projectName?.toUpperCase() || 'ARCHITECTURAL CONCEPT', {
        x: 1.0, y: 2.2, w: 11, h: 1.5,
        fontSize: 38, color: primaryColor, bold: true, fontFace: headingFont
      });
      titleSlide.addText('PROJECT SPECIFICATIONS & CONCEPT DESIGNS', {
        x: 1.0, y: 3.6, w: 11, h: 0.8,
        fontSize: 16, color: accentColor, fontFace: textFont, bold: true
      });
      titleSlide.addText('Pinnacle Studios • Branded Proposal', {
        x: 1.0, y: 6.2, w: 11, h: 0.5,
        fontSize: 10, color: mutedColor, fontFace: textFont
      });

      const addSlideDecorations = (slideObj: PptxGenJS.Slide, titleStr: string, indexVal: number) => {
        slideObj.addText(`${(indexVal + 1).toString().padStart(2, '0')} // ${titleStr.toUpperCase()}`, {
          x: 1.0, y: 0.4, w: 10, h: 0.4, fontSize: 10, color: accentColor, fontFace: textFont, bold: true
        });
        slideObj.addShape(pptx.ShapeType.line, { x: 1.0, y: 0.8, w: 11.3, h: 0.0, line: { color: borderHex, width: 1 } });
        slideObj.addText(`${(indexVal + 1).toString().padStart(2, '0')} / ${totalSlides.toString().padStart(2, '0')}`, {
          x: 11.0, y: 6.8, w: 1.3, h: 0.4, fontSize: 10, color: accentColor, fontFace: textFont, align: 'right', bold: true
        });
      };

      // Slide 2: Hero External Render
      if (assets.hero) {
        currentIdx++;
        const heroSlide = pptx.addSlide();
        heroSlide.background = { color: bgColor };
        addSlideDecorations(heroSlide, 'Hero Exterior View', currentIdx);
        heroSlide.addImage({ data: assets.hero, x: 1.0, y: 1.4, w: 11.3, h: 5.0, sizing: { type: 'contain', w: 11.3, h: 5.0 } });
      }

      // Slide 3: Concept Layout (Floor Plan)
      if (assets.floorPlan) {
        currentIdx++;
        const fpSlide = pptx.addSlide();
        fpSlide.background = { color: bgColor };
        addSlideDecorations(fpSlide, 'Primary Concept Layout', currentIdx);
        fpSlide.addImage({ data: assets.floorPlan, x: 1.0, y: 1.4, w: 11.3, h: 5.0, sizing: { type: 'contain', w: 11.3, h: 5.0 } });
      }

      // Slides 4-6: Exterior Angle Views
      if (assets.angles && assets.angles.length > 0) {
        assets.angles.forEach((angleUrl: string, idx: number) => {
          currentIdx++;
          const angleSlide = pptx.addSlide();
          angleSlide.background = { color: bgColor };
          addSlideDecorations(angleSlide, `Exterior Perspective — View ${idx + 1}`, currentIdx);
          angleSlide.addImage({ data: angleUrl, x: 1.0, y: 1.4, w: 11.3, h: 5.0, sizing: { type: 'contain', w: 11.3, h: 5.0 } });
        });
      }

      // Slide 7: Specifications Sheet
      currentIdx++;
      const specSlide = pptx.addSlide();
      specSlide.background = { color: bgColor };
      addSlideDecorations(specSlide, 'Zoning & Specification Matrix', currentIdx);
      
      const params = projectData.collectedParameters || {};
      let yPos = 1.6;
      const addSpec = (label: string, val: any) => {
        if (val !== undefined && val !== null && val !== '') {
          specSlide.addText(`${label.toUpperCase()}:`, { x: 1.0, y: yPos, w: 4, h: 0.4, fontSize: 13, color: primaryColor, bold: true, fontFace: headingFont });
          specSlide.addText(val.toString(), { x: 4.5, y: yPos, w: 7.8, h: 0.4, fontSize: 13, color: secondaryColor, fontFace: textFont });
          yPos += 0.55;
        }
      };
      addSpec('Plot Width / Length', params.plotWidth && params.plotHeight ? `${params.plotWidth}m x ${params.plotHeight}m` : '100m x 100m');
      addSpec('Calculated Plot Area', params.plotArea ? `${params.plotArea} sqm` : null);
      addSpec('Number of Stories', params.floors ? `${params.floors} floors` : null);
      addSpec('Orientation / Aspect', params.orientation || 'North');
      addSpec('Vastu Rules Applied', params.vastuRules && params.vastuRules.length > 0 ? params.vastuRules.join(', ') : 'Standard compliance');
      addSpec('Surrounding Context', params.surroundings || 'Urban standard plot');

      // Slide 8: Disclaimer
      currentIdx++;
      const disclaimerSlide = pptx.addSlide();
      disclaimerSlide.background = { color: bgColor };
      addSlideDecorations(disclaimerSlide, 'Regulatory & Legal Disclaimer', currentIdx);
      disclaimerSlide.addText(
        "This conceptual presentation was generated by AI (AutoArch) and is intended for design visualization and planning purposes only. " +
        "It does not constitute final architectural, structural, electrical, or plumbing engineering drawings. " +
        "All dimensions, layouts, area calculations, and rendered visuals are indicative and subject to professional verification, " +
        "site surveys, and local civic building code compliance.",
        { x: 1.0, y: 1.8, w: 11.3, h: 4.5, fontSize: 14, color: secondaryColor, align: 'left', valign: 'top', lineSpacing: 24, fontFace: textFont }
      );

    } else {
      // --- CUSTOM DECK MODE ---
      const { slides } = body;
      if (!slides || !Array.isArray(slides)) {
        return NextResponse.json({ error: 'Missing slides array in custom deck request' }, { status: 400 });
      }

      const totalSlides = slides.length;

      slides.forEach((slide: any, idx: number) => {
        const customSlide = pptx.addSlide();
        customSlide.background = { color: bgColor };

        const addSlideDecorations = (slideObj: PptxGenJS.Slide, titleStr: string) => {
          slideObj.addText(`${(idx + 1).toString().padStart(2, '0')} // ${titleStr.toUpperCase()}`, {
            x: 1.0, y: 0.4, w: 10, h: 0.4, fontSize: 10, color: accentColor, fontFace: textFont, bold: true
          });
          slideObj.addShape(pptx.ShapeType.line, { x: 1.0, y: 0.8, w: 11.3, h: 0.0, line: { color: borderHex, width: 1 } });
          slideObj.addText(`${(idx + 1).toString().padStart(2, '0')} / ${totalSlides.toString().padStart(2, '0')}`, {
            x: 11.0, y: 6.8, w: 1.3, h: 0.4, fontSize: 10, color: accentColor, fontFace: textFont, align: 'right', bold: true
          });
        };

        if (slide.layout === 'cover') {
          if (slide.imageUrls && slide.imageUrls[0]) {
            // Full-bleed image background cover
            customSlide.addImage({ data: slide.imageUrls[0], x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'cover', w: 13.33, h: 7.5 } });
            // Add subtle dark gradient/panel overlay at bottom for title readability
            customSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 4.5, w: 13.33, h: 3.0, fill: { color: '000000', transparency: 30 } });
            customSlide.addText(slide.title?.toUpperCase() || 'ARCHITECTURAL CONCEPT', {
              x: 1.0, y: 4.8, w: 11.3, h: 1.0, fontSize: 36, color: 'FFFFFF', bold: true, fontFace: headingFont
            });
            customSlide.addText(slide.subtitle?.toUpperCase() || '', {
              x: 1.0, y: 5.9, w: 11.3, h: 0.5, fontSize: 14, color: 'E4E4E7', fontFace: textFont, bold: true
            });
            customSlide.addText(slide.body || '', {
              x: 1.0, y: 6.5, w: 11.3, h: 0.5, fontSize: 10, color: 'A1A1AA', fontFace: textFont
            });
          } else {
            // Elegant text cover layout
            customSlide.addText('PROJECT BRIEFING', { x: 1.0, y: 1.6, w: 11.3, h: 0.4, fontSize: 11, color: accentColor, bold: true, fontFace: textFont });
            customSlide.addText(slide.title?.toUpperCase() || 'ARCHITECTURAL BRIEF', {
              x: 1.0, y: 2.1, w: 11.3, h: 1.6, fontSize: 44, color: primaryColor, bold: true, fontFace: headingFont
            });
            customSlide.addShape(pptx.ShapeType.line, { x: 1.0, y: 3.8, w: 3.0, h: 0.0, line: { color: accentColor, width: 2 } });
            customSlide.addText(slide.subtitle?.toUpperCase() || '', {
              x: 1.0, y: 4.1, w: 11.3, h: 0.6, fontSize: 15, color: accentColor, fontFace: textFont, bold: true
            });
            customSlide.addText(slide.body || '', {
              x: 1.0, y: 4.8, w: 11.3, h: 1.8, fontSize: 11, color: mutedColor, fontFace: textFont
            });
          }
        } else if (slide.layout === 'image-full') {
          if (slide.imageUrls && slide.imageUrls[0]) {
            customSlide.addImage({ data: slide.imageUrls[0], x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'cover', w: 13.33, h: 7.5 } });
            customSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.0, w: 13.33, h: 1.5, fill: { color: '000000', transparency: 30 } });
            customSlide.addText(slide.title?.toUpperCase() || 'VISUAL ELEVATION', {
              x: 1.0, y: 6.2, w: 11.3, h: 0.4, fontSize: 13, color: 'FFFFFF', bold: true, fontFace: headingFont
            });
            customSlide.addText(slide.body || '', {
              x: 1.0, y: 6.7, w: 11.3, h: 0.5, fontSize: 10, color: 'E4E4E7', fontFace: textFont
            });
          } else {
            addSlideDecorations(customSlide, 'Full Perspective');
            customSlide.addText('[NO IMAGE PLACED]', { x: 1, y: 3, w: 11.3, h: 1, fontSize: 16, color: primaryColor, align: 'center', fontFace: headingFont });
          }
        } else if (slide.layout === 'image+text') {
          addSlideDecorations(customSlide, slide.subtitle || 'Concept Profile');
          customSlide.addText(slide.title || 'SLIDE TITLE', { x: 1.0, y: 1.4, w: 4.8, h: 0.8, fontSize: 24, color: primaryColor, bold: true, fontFace: headingFont });
          customSlide.addShape(pptx.ShapeType.line, { x: 1.0, y: 2.3, w: 1.5, h: 0.0, line: { color: accentColor, width: 1.5 } });
          customSlide.addText(slide.body || '', { x: 1.0, y: 2.6, w: 4.8, h: 3.8, fontSize: 12, color: secondaryColor, align: 'left', valign: 'top', fontFace: textFont });
          
          if (slide.imageUrls && slide.imageUrls[0]) {
            customSlide.addImage({ data: slide.imageUrls[0], x: 6.4, y: 1.4, w: 5.9, h: 5.0, sizing: { type: 'cover', w: 5.9, h: 5.0 } });
          }
        } else if (slide.layout === 'grid') {
          addSlideDecorations(customSlide, slide.subtitle || 'Grid Portfolio');
          customSlide.addText(slide.title || 'VISUAL MATRIX', { x: 1.0, y: 1.4, w: 11.3, h: 0.6, fontSize: 20, color: primaryColor, bold: true, fontFace: headingFont });
          
          const imgUrls = slide.imageUrls || [];
          if (imgUrls.length >= 3) {
            customSlide.addImage({ data: imgUrls[0], x: 1.0, y: 2.2, w: 3.5, h: 4.2, sizing: { type: 'cover', w: 3.5, h: 4.2 } });
            customSlide.addImage({ data: imgUrls[1], x: 4.9, y: 2.2, w: 3.5, h: 4.2, sizing: { type: 'cover', w: 3.5, h: 4.2 } });
            customSlide.addImage({ data: imgUrls[2], x: 8.8, y: 2.2, w: 3.5, h: 4.2, sizing: { type: 'cover', w: 3.5, h: 4.2 } });
          } else if (imgUrls.length === 2) {
            customSlide.addImage({ data: imgUrls[0], x: 1.0, y: 2.2, w: 5.4, h: 4.2, sizing: { type: 'cover', w: 5.4, h: 4.2 } });
            customSlide.addImage({ data: imgUrls[1], x: 6.9, y: 2.2, w: 5.4, h: 4.2, sizing: { type: 'cover', w: 5.4, h: 4.2 } });
          } else if (imgUrls.length === 1) {
            customSlide.addImage({ data: imgUrls[0], x: 1.0, y: 2.2, w: 11.3, h: 4.2, sizing: { type: 'cover', w: 11.3, h: 4.2 } });
          }
        } else if (slide.layout === 'table') {
          addSlideDecorations(customSlide, slide.subtitle || 'Specifications Sheet');
          customSlide.addText(slide.title || 'SPECIFICATION MATRIX', { x: 1.0, y: 1.4, w: 11.3, h: 0.6, fontSize: 20, color: primaryColor, bold: true, fontFace: headingFont });
          
          let ty = 2.4;
          const addMatrixRow = (l: string, v: string) => {
            customSlide.addText(l, { x: 1.0, y: ty, w: 4.5, h: 0.4, fontSize: 12, color: mutedColor, fontFace: textFont });
            customSlide.addText(v, { x: 5.8, y: ty, w: 6.5, h: 0.4, fontSize: 12, color: primaryColor, bold: true, fontFace: textFont });
            customSlide.addShape(pptx.ShapeType.line, { x: 1.0, y: ty + 0.45, w: 11.3, h: 0.0, line: { color: borderHex, width: 0.5 } });
            ty += 0.6;
          };
          addMatrixRow('DESIGN CATEGORY', 'RESIDENTIAL DWELLING');
          addMatrixRow('LEVEL CONSTELLATION', '3 LEVELS CONFIG');
          addMatrixRow('ZONING RULES APPLIED', 'STANDARD CIVIL CODES');
          if (slide.body) {
            customSlide.addText(slide.body, { x: 1.0, y: ty + 0.2, w: 11.3, h: 0.8, fontSize: 11, color: secondaryColor, fontFace: textFont });
          }
        } else if (slide.layout === 'contact') {
          customSlide.addText('PROJECT INQUIRY', { x: 1.0, y: 1.8, w: 11.3, h: 0.4, fontSize: 11, color: accentColor, bold: true, fontFace: textFont, align: 'center' });
          customSlide.addText(slide.title || 'GET IN TOUCH', { x: 1.0, y: 2.3, w: 11.3, h: 0.8, fontSize: 34, color: primaryColor, bold: true, align: 'center', fontFace: headingFont });
          customSlide.addText(slide.subtitle || 'Pinnacle Studios', { x: 1.0, y: 3.2, w: 11.3, h: 0.5, fontSize: 15, color: mutedColor, align: 'center', fontFace: textFont });
          customSlide.addShape(pptx.ShapeType.line, { x: 5.6, y: 4.0, w: 2.0, h: 0.0, line: { color: accentColor, width: 2 } });
          customSlide.addText(slide.body || 'info@pinnaclestudios.com | +1 555-0199', { x: 1.0, y: 4.4, w: 11.3, h: 2.0, fontSize: 13, color: primaryColor, align: 'center', fontFace: textFont, lineSpacing: 24 });
        }
      });
    }

    // Write to buffer
    const buffer = await pptx.write({ outputType: 'nodebuffer' });

    const safeFilename = (projectData.projectName || 'presentation')
      .replace(/[^\x00-\x7F]/g, '-') // Replace non-ASCII (e.g. em-dash) with hyphens
      .replace(/["\\]/g, '');        // Strip quotes and backslashes

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${safeFilename}.pptx"`
      }
    });
  } catch (error: any) {
    console.error('Presentation export error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
