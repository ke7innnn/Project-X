'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  MASTER_SHAPES_50, 
  ShapeDefinition, 
  ShapeCategory 
} from '@/lib/shapeLibrary50';
import { 
  Building, 
  Compass, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Download, 
  Copy, 
  Check, 
  ArrowRight, 
  Layers, 
  Search, 
  Filter, 
  Sparkles, 
  Sun, 
  Moon, 
  Sliders, 
  Info, 
  Wind, 
  ShieldCheck, 
  FileCode,
  ArrowLeft,
  Eye,
  Grid
} from 'lucide-react';
import { generateSpecializedLayout, getShapeTypology } from '@/lib/architecturalLayoutEngine';

export default function ShapeStudioPage() {
  const router = useRouter();

  // State Management
  const [selectedShapeId, setSelectedShapeId] = useState<string>('batman-insignia');
  const [selectedCategory, setSelectedCategory] = useState<ShapeCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Plot Dimension States (in meters)
  const [plotWidthM, setPlotWidthM] = useState<number>(80);
  const [plotLengthM, setPlotLengthM] = useState<number>(80);
  
  // Architectural Unit Partitioning & BHK States
  const [unitCount, setUnitCount] = useState<number>(4); // 2, 3, 4, 5, 6, 7, 8
  const [bhkType, setBhkType] = useState<'1bhk' | '2bhk' | '3bhk' | '4bhk'>('3bhk');
  const [showPartitions, setShowPartitions] = useState<boolean>(true);
  const [showExteriorBoxes, setShowExteriorBoxes] = useState<boolean>(true);
  const [showLivingBalconyFlow, setShowLivingBalconyFlow] = useState<boolean>(true);

  // Canvas Display Preferences
  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('dark');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [gridSpacingM, setGridSpacingM] = useState<number>(10);
  const [showCore, setShowCore] = useState<boolean>(true);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [showVertices, setShowVertices] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active Shape Lookup
  const selectedShape = useMemo(() => {
    return MASTER_SHAPES_50.find(s => s.id === selectedShapeId) || MASTER_SHAPES_50[0];
  }, [selectedShapeId]);

  // Filtered Shape List
  const filteredShapes = useMemo(() => {
    return MASTER_SHAPES_50.filter(s => {
      const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
      const matchesSearch = searchQuery.trim() === '' || 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.inspiration.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTag = !activeTag || s.tags.includes(activeTag);
      return matchesCategory && matchesSearch && matchesTag;
    });
  }, [selectedCategory, searchQuery, activeTag]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    MASTER_SHAPES_50.forEach(s => s.tags.forEach(t => set.add(t)));
    return Array.from(set).slice(0, 18);
  }, []);

  // Compute Active Polygon & Math Metrics
  const { polygonPts, holePolygons, areaM2, perimeterM, coreAreaM2, usableAreaM2 } = useMemo(() => {
    const cx = plotWidthM / 2;
    const cy = plotLengthM / 2;
    const pts = selectedShape.getPolygon(cx, cy, plotWidthM, plotLengthM);
    const holes = selectedShape.getHoles ? selectedShape.getHoles(cx, cy, plotWidthM, plotLengthM) : [];

    // Polygon Area (Shoelace formula)
    let rawArea = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      rawArea += pts[i].x * pts[j].y;
      rawArea -= pts[j].x * pts[i].y;
    }
    let totalArea = Math.abs(rawArea) / 2;

    // Deduct holes
    if (holes.length > 0) {
      for (const hole of holes) {
        let holeArea = 0;
        for (let i = 0; i < hole.length; i++) {
          const j = (i + 1) % hole.length;
          holeArea += hole[i].x * hole[j].y;
          holeArea -= hole[j].x * hole[i].y;
        }
        totalArea -= Math.abs(holeArea) / 2;
      }
    }

    // Perimeter
    let totalPerimeter = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      totalPerimeter += Math.sqrt(dx * dx + dy * dy);
    }

    // Core Estimation (Elevators + Stairs + Shaft)
    const core = Math.min(180, Math.max(60, totalArea * 0.12));
    const usable = Math.max(0, totalArea - core);

    return {
      polygonPts: pts,
      holePolygons: holes,
      areaM2: Math.round(totalArea),
      perimeterM: Math.round(totalPerimeter),
      coreAreaM2: Math.round(core),
      usableAreaM2: Math.round(usable),
    };
  }, [selectedShape, plotWidthM, plotLengthM]);

  // ── Render 2D Canvas ───────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const isDark = canvasTheme === 'dark';

    // 1. Background Fill
    ctx.fillStyle = isDark ? '#08080f' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Padding & Scale Factor
    const padding = 70;
    const availW = width - padding * 2;
    const availH = height - padding * 2;

    const scaleX = availW / plotWidthM;
    const scaleY = availH / plotLengthM;
    const scale = Math.min(scaleX, scaleY) * zoomLevel;

    const originX = (width - plotWidthM * scale) / 2;
    const originY = (height - plotLengthM * scale) / 2;

    const toCanvasX = (mX: number) => originX + mX * scale;
    const toCanvasY = (mY: number) => originY + mY * scale;

    // 2. Draw 10m Grid
    if (showGrid) {
      ctx.lineWidth = 1;
      const step = gridSpacingM;
      for (let x = 0; x <= plotWidthM; x += step) {
        ctx.strokeStyle = isDark ? (x % (step * 2) === 0 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)') : (x % (step * 2) === 0 ? 'rgba(0, 80, 160, 0.15)' : 'rgba(0, 0, 0, 0.05)');
        ctx.beginPath();
        ctx.moveTo(toCanvasX(x), toCanvasY(0));
        ctx.lineTo(toCanvasX(x), toCanvasY(plotLengthM));
        ctx.stroke();

        // Grid Meter Labels
        ctx.font = '9px monospace';
        ctx.fillStyle = isDark ? 'rgba(0, 240, 255, 0.35)' : 'rgba(0, 80, 160, 0.5)';
        ctx.fillText(`${x}m`, toCanvasX(x) + 3, toCanvasY(plotLengthM) + 14);
      }

      for (let y = 0; y <= plotLengthM; y += step) {
        ctx.strokeStyle = isDark ? (y % (step * 2) === 0 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)') : (y % (step * 2) === 0 ? 'rgba(0, 80, 160, 0.15)' : 'rgba(0, 0, 0, 0.05)');
        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), toCanvasY(y));
        ctx.lineTo(toCanvasX(plotWidthM), toCanvasY(y));
        ctx.stroke();

        ctx.font = '9px monospace';
        ctx.fillStyle = isDark ? 'rgba(0, 240, 255, 0.35)' : 'rgba(0, 80, 160, 0.5)';
        ctx.fillText(`${y}m`, toCanvasX(0) - 28, toCanvasY(y) + 3);
      }
    }

    // 3. Draw Plot Boundary Box
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.2)';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(originX, originY, plotWidthM * scale, plotLengthM * scale);
    ctx.setLineDash([]);

    // 4. Draw Shape Polygon
    if (polygonPts.length > 2) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(toCanvasX(polygonPts[0].x), toCanvasY(polygonPts[0].y));
      for (let i = 1; i < polygonPts.length; i++) {
        ctx.lineTo(toCanvasX(polygonPts[i].x), toCanvasY(polygonPts[i].y));
      }
      ctx.closePath();

      // Cut out holes if any
      if (holePolygons.length > 0) {
        for (const hole of holePolygons) {
          ctx.moveTo(toCanvasX(hole[0].x), toCanvasY(hole[0].y));
          for (let i = 1; i < hole.length; i++) {
            ctx.lineTo(toCanvasX(hole[i].x), toCanvasY(hole[i].y));
          }
          ctx.closePath();
        }
      }

      // Shaded Plate Fill
      const grad = ctx.createRadialGradient(
        toCanvasX(plotWidthM / 2), toCanvasY(plotLengthM / 2), 10,
        toCanvasX(plotWidthM / 2), toCanvasY(plotLengthM / 2), (plotWidthM * scale) / 1.5
      );
      if (isDark) {
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.28)');
        grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.18)');
        grad.addColorStop(1, 'rgba(14, 165, 233, 0.08)');
      } else {
        grad.addColorStop(0, 'rgba(2, 132, 199, 0.22)');
        grad.addColorStop(0.7, 'rgba(5, 150, 105, 0.14)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.06)');
      }

      ctx.fillStyle = grad;
      ctx.fill('evenodd');

      // Outline
      ctx.strokeStyle = isDark ? '#00f0ff' : '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = isDark ? 'rgba(0, 240, 255, 0.4)' : 'transparent';
      ctx.shadowBlur = isDark ? 8 : 0;
      ctx.stroke();
      ctx.restore();
    }

    // 5. Generate Specialized Architectural Typology Layout (Tailored to Shape's Wings)
    const cx = plotWidthM / 2;
    const cy = plotLengthM / 2;
    const layout = generateSpecializedLayout(selectedShapeId, polygonPts, plotWidthM, plotLengthM, unitCount, bhkType);

    // 5a. Draw Central Core & Natural Light / Ventilation / Entrance Corridor
    if (showCore) {
      const core = layout.core;
      const coreCanvasX = toCanvasX(core.x - core.width / 2);
      const coreCanvasY = toCanvasY(core.y - core.length / 2);
      const coreCanvasW = core.width * scale;
      const coreCanvasH = core.length * scale;

      // Daylight / Smoke Ventilation / Main Entrance Shaft
      if (layout.lightShaft) {
        const shaft = layout.lightShaft;
        const shaftCanvasX = toCanvasX(shaft.x);
        const shaftCanvasW = shaft.width * scale;
        const shaftCanvasTopY = coreCanvasY + coreCanvasH;
        const shaftCanvasBottomY = toCanvasY(plotLengthM);

        ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.18)' : 'rgba(2, 132, 199, 0.15)';
        ctx.fillRect(shaftCanvasX, shaftCanvasTopY, shaftCanvasW, shaftCanvasBottomY - shaftCanvasTopY);
        ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(shaftCanvasX, shaftCanvasTopY, shaftCanvasW, shaftCanvasBottomY - shaftCanvasTopY);
        ctx.setLineDash([]);

        // Label
        ctx.save();
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1';
        ctx.textAlign = 'center';
        const shaftMidY = (shaftCanvasTopY + shaftCanvasBottomY) / 2;
        ctx.fillText('☀️ LIGHT & VENT SHAFT', toCanvasX(cx), shaftMidY - 5);
        ctx.font = '7px monospace';
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.fillText('🚪 MAIN ENTRANCE LOBBY', toCanvasX(cx), shaftMidY + 6);
        ctx.restore();
      }

      // Circulation Corridor Loop wrapping Core
      const corridorPad = 3.5 * scale;
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(coreCanvasX - corridorPad, coreCanvasY - corridorPad, coreCanvasW + corridorPad * 2, coreCanvasH + corridorPad * 2);
      ctx.setLineDash([]);

      // Core Background & Elevation Lift Bank
      ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(217, 119, 6, 0.25)';
      ctx.fillRect(coreCanvasX, coreCanvasY, coreCanvasW, coreCanvasH);

      // Core Border
      ctx.strokeStyle = isDark ? '#f59e0b' : '#d97706';
      ctx.lineWidth = 2;
      ctx.strokeRect(coreCanvasX, coreCanvasY, coreCanvasW, coreCanvasH);

      // Lift / Stair Internal Markings
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = isDark ? '#fbbf24' : '#b45309';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🛗 ${core.lifts}× PASSENGER LIFTS`, toCanvasX(core.x), toCanvasY(core.y) - 8);
      ctx.fillText(`🪜 ${core.stairs}× FIRE STAIRS`, toCanvasX(core.x), toCanvasY(core.y) + 4);
      ctx.font = '7px monospace';
      ctx.fillStyle = isDark ? '#fde68a' : '#78350f';
      ctx.fillText(`CORE: ${Math.round(core.width)}m × ${Math.round(core.length)}m`, toCanvasX(core.x), toCanvasY(core.y) + 16);
    }

    // ── 6. DRAW SPECIALIZED ARCHITECTURAL UNIT WINGS & ROOMS ───────────────
    if (showPartitions && polygonPts.length > 2) {
      // STRICT POLYGON CLIPPING: Nothing can ever bleed outside the facade
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(toCanvasX(polygonPts[0].x), toCanvasY(polygonPts[0].y));
      for (let i = 1; i < polygonPts.length; i++) {
        ctx.lineTo(toCanvasX(polygonPts[i].x), toCanvasY(polygonPts[i].y));
      }
      ctx.closePath();
      ctx.clip();

      layout.units.forEach((unit) => {
        // 1. Draw Unit Demarcation Walls
        if (unit.boundaryPts.length > 1) {
          ctx.save();
          ctx.strokeStyle = unit.stroke;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(toCanvasX(unit.boundaryPts[0].x), toCanvasY(unit.boundaryPts[0].y));
          for (let p = 1; p < unit.boundaryPts.length; p++) {
            ctx.lineTo(toCanvasX(unit.boundaryPts[p].x), toCanvasY(unit.boundaryPts[p].y));
          }
          ctx.stroke();
          ctx.restore();
        }

        // 2. Draw Specialized Rooms Inside the Wing
        if (showExteriorBoxes) {
          unit.rooms.forEach((rm) => {
            if (rm.pts.length > 1) {
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(toCanvasX(rm.pts[0].x), toCanvasY(rm.pts[0].y));
              for (let p = 1; p < rm.pts.length; p++) {
                ctx.lineTo(toCanvasX(rm.pts[p].x), toCanvasY(rm.pts[p].y));
              }
              ctx.closePath();

              if (rm.isBalcony) {
                // Sleek Emerald Balcony Deck
                ctx.fillStyle = isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)';
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 2.5;
                ctx.fill();
                ctx.stroke();
              } else {
                ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(241, 245, 249, 0.9)';
                ctx.strokeStyle = rm.color;
                ctx.lineWidth = 1.8;
                ctx.fill();
                ctx.stroke();

                // Distinct Corner Accent Tab
                ctx.fillStyle = rm.color;
                ctx.fillRect(toCanvasX(rm.pts[0].x), toCanvasY(rm.pts[0].y), 4, 4);
              }

              // Clean Icon Only (No Text Clutter)
              const midX = rm.pts.reduce((acc, p) => acc + p.x, 0) / rm.pts.length;
              const midY = rm.pts.reduce((acc, p) => acc + p.y, 0) / rm.pts.length;

              ctx.font = '11px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(rm.icon, toCanvasX(midX), toCanvasY(midY));
              ctx.restore();
            }
          });

          // Living Room to Balcony Seamless Sliding Flow (Clean Minimal Line)
          if (showLivingBalconyFlow && unit.balconyCenter) {
            ctx.save();
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(toCanvasX(unit.livingRoomCenter.x), toCanvasY(unit.livingRoomCenter.y));
            ctx.lineTo(toCanvasX(unit.balconyCenter.x), toCanvasY(unit.balconyCenter.y));
            ctx.stroke();
            ctx.restore();
          }
        }

        // 3. Sleek Minimal Unit Badge (Just F1, F2, F3...)
        ctx.save();
        const badgeX = toCanvasX(unit.livingRoomCenter.x);
        const badgeY = toCanvasY(unit.livingRoomCenter.y);

        ctx.fillStyle = isDark ? '#090d16' : '#ffffff';
        ctx.strokeStyle = unit.stroke;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, 14, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = unit.stroke;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.label, badgeX, badgeY);
        ctx.restore();

        // 4. Unit Entrance Door along Central Corridor
        ctx.save();
        ctx.font = 'bold 8.5px monospace';
        ctx.fillStyle = unit.stroke;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🚪 ${unit.label}`, toCanvasX(unit.entranceDoor.x), toCanvasY(unit.entranceDoor.y));
        ctx.restore();
      });

      ctx.restore(); // Close strict polygon clipping
    }

    // 7. Draw Vertices (Nodes)
    if (showVertices) {
      for (let i = 0; i < polygonPts.length; i++) {
        const pt = polygonPts[i];
        const vx = toCanvasX(pt.x);
        const vy = toCanvasY(pt.y);

        ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
        ctx.beginPath();
        ctx.arc(vx, vy, 3.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = isDark ? '#00f0ff' : '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Vertex Index Number
        ctx.font = '8px monospace';
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.7)';
        ctx.textAlign = 'left';
        ctx.fillText(`P${i + 1}`, vx + 5, vy - 4);
      }
    }

    // 8. Draw Dimensions Overlays
    if (showDimensions) {
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1';
      ctx.textAlign = 'center';

      // Width Dimension (Top)
      const topY = originY - 18;
      ctx.fillText(`WIDTH: ${plotWidthM}m`, originX + (plotWidthM * scale) / 2, topY);
      ctx.strokeStyle = isDark ? '#38bdf8' : '#0369a1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, topY + 4);
      ctx.lineTo(originX + plotWidthM * scale, topY + 4);
      ctx.stroke();

      // Length Dimension (Right)
      const rightX = originX + plotWidthM * scale + 18;
      ctx.save();
      ctx.translate(rightX, originY + (plotLengthM * scale) / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(`LENGTH: ${plotLengthM}m`, 0, 0);
      ctx.restore();
    }

    // 9. North Arrow Compass
    const compassX = width - 45;
    const compassY = 45;
    ctx.save();
    ctx.strokeStyle = isDark ? '#00f0ff' : '#0284c7';
    ctx.fillStyle = isDark ? '#00f0ff' : '#0284c7';
    ctx.lineWidth = 1.5;

    // North Pointer
    ctx.beginPath();
    ctx.moveTo(compassX, compassY - 18);
    ctx.lineTo(compassX - 6, compassY + 8);
    ctx.lineTo(compassX, compassY + 3);
    ctx.lineTo(compassX + 6, compassY + 8);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 9px monospace';
    ctx.fillText('N', compassX - 3, compassY - 22);
    ctx.restore();

  }, [
    canvasTheme,
    plotWidthM,
    plotLengthM,
    selectedShape,
    showGrid,
    gridSpacingM,
    showCore,
    showDimensions,
    showVertices,
    zoomLevel,
    polygonPts,
    holePolygons,
    unitCount,
    bhkType,
    showPartitions,
    showExteriorBoxes,
    showLivingBalconyFlow
  ]);

  // Redraw canvas whenever dependencies change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Export Canvas PNG
  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedShape.id}-footprint-schematic.png`;
    a.click();
  };

  // Copy Polygon JSON Vertices
  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(polygonPts, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Direct Transfer to Idea Generator
  const handleSendToGenerator = () => {
    const params = new URLSearchParams({
      footprintShape: selectedShape.id,
      customFootprintText: selectedShape.name,
      overallWidth: plotWidthM.toString(),
      overallLength: plotLengthM.toString(),
      totalUnits: unitCount.toString(),
      units1BHK: bhkType === '1bhk' ? unitCount.toString() : '0',
      units2BHK: bhkType === '2bhk' ? unitCount.toString() : '0',
      units3BHK: bhkType === '3bhk' ? unitCount.toString() : '0',
      units4BHK: bhkType === '4bhk' ? unitCount.toString() : '0',
    });
    router.push(`/idea-generation?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#050508] text-white flex flex-col font-sans selection:bg-cyan-500/30">
      
      {/* ── Top Header Navigation Bar ──────────────────────────────────────── */}
      <header className="h-16 border-b border-cyan-500/20 bg-[#090912]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <Link 
            href="/projects" 
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-mono"
          >
            <ArrowLeft className="w-4 h-4" /> Projects
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Building className="w-4 h-4 text-black font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wider uppercase text-white font-mono">
                  SHAPE STUDIO <span className="text-cyan-400 font-normal">/ 50 MASTER ARCHITECTURAL FOOTPRINTS</span>
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  V2.0 CAD LAB
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                Interactive geometry laboratory, real-time plate calculations & 2D CAD blueprint simulation
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCanvasTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono flex items-center gap-1.5 transition-all text-gray-300 hover:text-white"
            title="Toggle Canvas Theme"
          >
            {canvasTheme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" /> Blueprint Mode
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-cyan-400" /> Dark CAD
              </>
            )}
          </button>

          <button
            onClick={handleSendToGenerator}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-xs font-mono flex items-center gap-2 shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            TEST WITH TOWER GENERATOR
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* ── Main 3-Column Layout ───────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ── COLUMN 1: Left Shape Browser & Library ─────────────────────────── */}
        <aside className="w-80 border-r border-white/10 bg-[#08080e] flex flex-col h-[calc(100vh-4rem)]">
          
          {/* Search & Category Filter Header */}
          <div className="p-4 border-b border-white/10 flex flex-col gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search 50 shapes (e.g. Zaha, Burj, Wave, Leaf)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-cyan-300 placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Tabs */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2 py-1 rounded text-[10px] font-mono font-semibold tracking-wider uppercase transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                    : 'text-gray-400 hover:text-white bg-white/5 border border-transparent'
                }`}
              >
                ALL ({MASTER_SHAPES_50.length})
              </button>
              <button
                onClick={() => setSelectedCategory('architectural')}
                className={`px-2 py-1 rounded text-[10px] font-mono font-semibold tracking-wider uppercase transition-all ${
                  selectedCategory === 'architectural'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                    : 'text-gray-400 hover:text-white bg-white/5 border border-transparent'
                }`}
              >
                🏛️ TOWERS (20)
              </button>
              <button
                onClick={() => setSelectedCategory('geometric')}
                className={`px-2 py-1 rounded text-[10px] font-mono font-semibold tracking-wider uppercase transition-all ${
                  selectedCategory === 'geometric'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/50'
                    : 'text-gray-400 hover:text-white bg-white/5 border border-transparent'
                }`}
              >
                📐 GEOMETRIC (15)
              </button>
              <button
                onClick={() => setSelectedCategory('biophilic')}
                className={`px-2 py-1 rounded text-[10px] font-mono font-semibold tracking-wider uppercase transition-all ${
                  selectedCategory === 'biophilic'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                    : 'text-gray-400 hover:text-white bg-white/5 border border-transparent'
                }`}
              >
                🌿 BIOPHILIC (15)
              </button>
            </div>

            {/* Tag Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              <button
                onClick={() => setActiveTag(null)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono shrink-0 transition-colors ${
                  activeTag === null
                    ? 'bg-white/20 text-white font-bold'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                All Tags
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono shrink-0 transition-colors ${
                    activeTag === tag
                      ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400 font-bold'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Shape List */}
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scrollbar">
            {filteredShapes.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-xs font-mono">
                No shapes matching your filter.
              </div>
            ) : (
              filteredShapes.map((shape, idx) => {
                const isSelected = shape.id === selectedShapeId;
                return (
                  <button
                    key={shape.id}
                    onClick={() => setSelectedShapeId(shape.id)}
                    className={`w-full p-2.5 rounded-lg border text-left transition-all flex flex-col gap-1 group ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-400/60 shadow-md shadow-cyan-950/50'
                        : 'bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold tracking-wider text-white flex items-center gap-1.5 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          shape.category === 'architectural' ? 'bg-emerald-400' :
                          shape.category === 'geometric' ? 'bg-purple-400' : 'bg-amber-400'
                        }`} />
                        {idx + 1}. {shape.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold bg-white/5 text-cyan-300 border border-white/10 shrink-0">
                        {shape.efficiency}% EFF
                      </span>
                    </div>

                    <span className="text-[9px] text-gray-400 truncate">
                      {shape.inspiration}
                    </span>

                    <div className="flex items-center gap-1 overflow-hidden mt-0.5">
                      {shape.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[8px] text-gray-500 font-mono">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ── COLUMN 2: Center Interactive 2D CAD Canvas ────────────────────── */}
        <main className="flex-1 flex flex-col bg-[#040407] relative overflow-hidden">
          
          {/* Canvas Floating Toolbar */}
          <div className="h-14 border-b border-white/10 bg-black/40 backdrop-blur px-4 flex items-center justify-between z-10 gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                {selectedShape.name}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                ({plotWidthM}m × {plotLengthM}m)
              </span>
            </div>

            {/* Quick Unit Count & BHK Type Switchers */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {/* Unit Count Selector */}
              <div className="flex items-center bg-black/50 p-1 rounded-lg border border-white/10 shrink-0">
                <span className="text-[9px] font-mono font-bold text-gray-400 px-2 uppercase tracking-wider">UNITS:</span>
                {[2, 3, 4, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setUnitCount(n)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                      unitCount === n
                        ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {n}F
                  </button>
                ))}
              </div>

              {/* BHK Type Selector */}
              <div className="flex items-center bg-black/50 p-1 rounded-lg border border-white/10 shrink-0">
                <span className="text-[9px] font-mono font-bold text-gray-400 px-2 uppercase tracking-wider">BHK:</span>
                {(['1bhk', '2bhk', '3bhk', '4bhk'] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setBhkType(b)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all uppercase ${
                      bhkType === b
                        ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {b.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Canvas Toggles */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowPartitions(!showPartitions)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors ${
                  showPartitions
                    ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
                title="Toggle Unit Partition Lines"
              >
                <Layers className="w-3 h-3" /> Divisions
              </button>

              <button
                onClick={() => setShowExteriorBoxes(!showExteriorBoxes)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors ${
                  showExteriorBoxes
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
                title="Toggle Facade Room Boxes"
              >
                <Eye className="w-3 h-3" /> Rooms
              </button>

              <button
                onClick={() => setShowCore(!showCore)}
                className={`px-2.5 py-1 rounded text-[10px] font-mono flex items-center gap-1 border transition-colors ${
                  showCore
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
                title="Toggle Central Core"
              >
                <Grid className="w-3 h-3" /> Core
              </button>

              <div className="h-4 w-px bg-white/10 mx-1" />

              <button
                onClick={() => setZoomLevel(z => Math.max(0.6, z - 0.15))}
                className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-gray-400 w-8 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(z => Math.min(2.0, z + 0.15))}
                className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(1.0)}
                className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* HTML5 Canvas Viewport */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
            <canvas
              ref={canvasRef}
              width={850}
              height={650}
              className="w-full h-full max-w-[850px] max-h-[650px] object-contain rounded-xl border border-white/10 shadow-2xl shadow-black/80"
            />
          </div>

          {/* Bottom Dimension Slider Controls */}
          <div className="h-16 border-t border-white/10 bg-[#090912] px-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Width Slider */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">WIDTH:</span>
                <input
                  type="range"
                  min={40}
                  max={140}
                  step={5}
                  value={plotWidthM}
                  onChange={(e) => setPlotWidthM(Number(e.target.value))}
                  className="w-32 accent-cyan-400 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-white w-10">{plotWidthM}m</span>
              </div>

              {/* Length Slider */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">LENGTH:</span>
                <input
                  type="range"
                  min={40}
                  max={140}
                  step={5}
                  value={plotLengthM}
                  onChange={(e) => setPlotLengthM(Number(e.target.value))}
                  className="w-32 accent-cyan-400 cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-white w-10">{plotLengthM}m</span>
              </div>
            </div>

            {/* Canvas Bottom Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyJson}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors"
                title="Copy Polygon JSON Vertices"
              >
                {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedJson ? 'COPIED!' : 'COPY JSON'}
              </button>

              <button
                onClick={handleDownloadPng}
                className="px-3 py-1.5 rounded-lg bg-cyan-950 border border-cyan-500/30 text-xs font-mono flex items-center gap-1.5 text-cyan-300 hover:text-white hover:bg-cyan-900 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> EXPORT CAD PNG
              </button>
            </div>
          </div>
        </main>

        {/* ── COLUMN 3: Right Inspector & Engineering Metrics HUD ───────────── */}
        <aside className="w-96 border-l border-white/10 bg-[#08080e] p-5 flex flex-col gap-5 overflow-y-auto h-[calc(100vh-4rem)]">
          
          {/* Active Shape Specification Card */}
          <div className="flex flex-col gap-2 p-4 rounded-xl bg-black/40 border border-white/10">
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider ${
                selectedShape.category === 'architectural' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                selectedShape.category === 'geometric' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {selectedShape.category.toUpperCase()} MASTERPIECE
              </span>
              <span className="text-[10px] font-mono text-gray-400">
                {selectedShape.defaultAspect}
              </span>
            </div>

            <h2 className="text-base font-bold text-white font-mono tracking-wide">
              {selectedShape.name}
            </h2>

            <p className="text-xs text-cyan-400 font-mono">
              Inspiration: <span className="text-white">{selectedShape.inspiration}</span>
            </p>

            <p className="text-xs text-gray-400 leading-relaxed">
              {selectedShape.description}
            </p>
          </div>

          {/* Architectural Unit Partitioning & BHK Selector HUD */}
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-gradient-to-br from-purple-950/20 to-cyan-950/20 border border-purple-500/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-purple-300 uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                SPECIALIZED WING LAYOUT
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                {unitCount} UNITS • {bhkType.toUpperCase()}
              </span>
            </div>

            {/* Architectural Typology Identifier Pill */}
            <div className="p-2 rounded-lg bg-black/50 border border-cyan-500/30 flex items-center justify-between">
              <span className="text-[9px] font-mono text-gray-400 uppercase">TYPOLOGY:</span>
              <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">
                {getShapeTypology(selectedShapeId) === 'cross-4wing' ? '✖️ 4-WING CROSS' :
                 getShapeTypology(selectedShapeId) === 'triad-3wing' ? '🔱 3-WING TRIAD' :
                 getShapeTypology(selectedShapeId) === 'chevron-2wing' ? '📐 2-WING CHEVRON' :
                 getShapeTypology(selectedShapeId) === 'linear-slab' ? '🏢 LINEAR SLAB' : '💎 MULTI-FACETED'}
              </span>
            </div>

            {/* Flat Count Pill Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-mono text-gray-400 uppercase">Select Number of Flats:</span>
              <div className="grid grid-cols-6 gap-1">
                {[2, 3, 4, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setUnitCount(n)}
                    className={`py-1.5 rounded text-xs font-mono font-bold transition-all ${
                      unitCount === n
                        ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-black shadow-md shadow-purple-500/30 scale-105'
                        : 'bg-black/40 text-gray-400 hover:text-white border border-white/5 hover:border-white/20'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* BHK Typology Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] font-mono text-gray-400 uppercase">Select Room Box Density (BHK):</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { key: '1bhk', label: '1 BHK', boxes: '4 Boxes' },
                  { key: '2bhk', label: '2 BHK', boxes: '5 Boxes' },
                  { key: '3bhk', label: '3 BHK', boxes: '6 Boxes' },
                  { key: '4bhk', label: '4 BHK', boxes: '7 Boxes' },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => setBhkType(item.key as any)}
                    className={`p-2 rounded-lg text-center flex flex-col items-center gap-0.5 border transition-all ${
                      bhkType === item.key
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-md shadow-emerald-950'
                        : 'bg-black/40 border-white/5 text-gray-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <span className={`text-xs font-mono font-bold ${bhkType === item.key ? 'text-emerald-300' : 'text-gray-300'}`}>
                      {item.label}
                    </span>
                    <span className="text-[8px] font-mono text-gray-500">
                      {item.boxes}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Partition Metrics */}
            <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-white/10">
              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 font-mono uppercase">Area / Flat</span>
                <span className="text-xs font-bold text-cyan-300 font-mono">
                  ~{Math.round(usableAreaM2 / unitCount)} m²
                </span>
                <span className="text-[8px] text-gray-400 font-mono">
                  ~{Math.round((usableAreaM2 / unitCount) * 10.764)} sq.ft
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-gray-500 font-mono uppercase">Facade Rooms</span>
                <span className="text-xs font-bold text-emerald-300 font-mono">
                  {unitCount * (bhkType === '1bhk' ? 4 : bhkType === '2bhk' ? 5 : bhkType === '3bhk' ? 6 : 7)} Rooms
                </span>
                <span className="text-[8px] text-gray-400 font-mono">
                  {unitCount} Attached Balconies
                </span>
              </div>
            </div>
          </div>

          {/* Geometric & Floor Plate Calculations HUD */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              PHYSICAL METRICS & PLATE RATIOS
            </span>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-black/40 border border-white/10 flex flex-col gap-0.5">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Gross Footprint</span>
                <span className="text-base font-bold text-white font-mono">{areaM2.toLocaleString()} m²</span>
                <span className="text-[8px] text-gray-400 font-mono">~{Math.round(areaM2 * 10.764).toLocaleString()} sq.ft</span>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-white/10 flex flex-col gap-0.5">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Plate Efficiency</span>
                <span className="text-base font-bold text-emerald-400 font-mono">{selectedShape.efficiency}%</span>
                <span className="text-[8px] text-emerald-500/80 font-mono">High Density</span>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-white/10 flex flex-col gap-0.5">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Central Core</span>
                <span className="text-base font-bold text-amber-400 font-mono">{coreAreaM2} m²</span>
                <span className="text-[8px] text-gray-400 font-mono">Lifts, Stairs & Shaft</span>
              </div>

              <div className="p-3 rounded-lg bg-black/40 border border-white/10 flex flex-col gap-0.5">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Usable Habitable</span>
                <span className="text-base font-bold text-cyan-400 font-mono">{usableAreaM2.toLocaleString()} m²</span>
                <span className="text-[8px] text-gray-400 font-mono">For Flat Units</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Total Perimeter</span>
                <span className="text-sm font-bold text-white font-mono">{perimeterM} meters</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[9px] text-gray-500 font-mono uppercase">Polygon Nodes</span>
                <span className="text-sm font-bold text-cyan-400 font-mono">{polygonPts.length} vertices</span>
              </div>
            </div>
          </div>

          {/* Architectural Ventilation & Wing Analysis */}
          <div className="flex flex-col gap-2.5 p-4 rounded-xl bg-gradient-to-br from-cyan-950/20 to-emerald-950/20 border border-cyan-500/20">
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5" />
              VENTILATION & DAYLIGHT CAPABILITY
            </span>

            <div className="flex flex-col gap-1.5 text-xs text-gray-300">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">Cross-Ventilation Score:</span>
                <span className="text-emerald-400 font-bold font-mono">94 / 100</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">Max Wing Depth:</span>
                <span className="text-white font-bold font-mono">~11.5m (Ideal)</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400">Living Room Flow:</span>
                <span className="text-emerald-300 font-bold font-mono">
                  100% Balcony Connected
                </span>
              </div>
            </div>
          </div>

          {/* Action CTA Button */}
          <button
            onClick={handleSendToGenerator}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 text-black font-bold text-xs font-mono flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-95 transition-all mt-auto"
          >
            <Sparkles className="w-4 h-4" />
            SYNTHESIZE 2D FLOOR PLAN WITH THIS SHAPE
          </button>
        </aside>

      </div>

    </div>
  );
}
