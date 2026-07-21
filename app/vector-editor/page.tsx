'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Ruler, CheckCircle, Loader2, Send, RotateCcw, RotateCw, AlertTriangle, Layers, ZoomIn, ZoomOut, Maximize, Download } from 'lucide-react';
import { convertSvgToDxf } from '../../lib/svgToDxf';
import DynamicFloorplan from '@/components/DynamicFloorplan';

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface RoomShape {
  id: string;
  label: string | null;
  shape: 'rect' | 'polygon';
  x: number; y: number; width: number; height: number;
  points?: { x: number; y: number }[];
  verified: boolean;
  color: string;
}

interface VectorSchema {
  scale: { pixelsPerMeter: number | null };
  rooms: RoomShape[];
  rawSvg: string;
  imageWidth: number;
  imageHeight: number;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
}

type EditorStage = 'upload' | 'vectorizing' | 'verify' | 'calibrate' | 'edit';

const ROOM_COLORS = [
  'rgba(0,240,255,0.25)', 'rgba(139,92,246,0.25)', 'rgba(16,185,129,0.25)',
  'rgba(245,158,11,0.25)', 'rgba(239,68,68,0.25)', 'rgba(236,72,153,0.25)',
  'rgba(59,130,246,0.25)', 'rgba(251,191,36,0.25)', 'rgba(34,197,94,0.25)',
];
const ROOM_STROKE_COLORS = [
  '#00f0ff','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6','#fbbf24','#22c55e',
];

/* ─── Build room boxes from OCR room data ────────────────────────────────────── */
function buildRoomsFromOCR(
  ocrRooms: { name: string; label?: string; cx?: number; cy?: number; wPct?: number; hPct?: number }[],
  imgW: number,
  imgH: number
): RoomShape[] {
  const filtered = ocrRooms.filter(r => r.name && r.name.trim().length > 1);

  return filtered.map((r, i) => {
    // Use Gemini's estimated position percentages, scaled to actual image pixels
    const cx = (r.cx ?? (0.1 + (i % 4) * 0.22)) * imgW;
    const cy = (r.cy ?? (0.1 + Math.floor(i / 4) * 0.25)) * imgH;
    const bw = Math.max(60, (r.wPct ?? 0.18) * imgW);
    const bh = Math.max(40, (r.hPct ?? 0.14) * imgH);
    return {
      id: `room_${i}`,
      label: r.label || r.name.trim(),
      shape: 'rect' as const,
      x: Math.max(0, cx - bw / 2),
      y: Math.max(0, cy - bh / 2),
      width: bw,
      height: bh,
      verified: false,
      color: ROOM_COLORS[i % ROOM_COLORS.length],
    };
  });
}

/* ─── Deterministic geometry mutations ──────────────────────────────────────── */


function applyIntent(schema: VectorSchema, intent: any, lockFootprint: boolean): { schema: VectorSchema; message: string } | { error: string } {
  const ppm = schema.scale.pixelsPerMeter;
  const rooms = [...schema.rooms.map(r => ({ ...r }))];

  const findRoom = (target: string): RoomShape | undefined => {
    const t = target.toLowerCase();
    return rooms.find(r => r.label?.toLowerCase().includes(t));
  };

  if (intent.action === 'resize') {
    const room = findRoom(intent.target);
    if (!room) return { error: `Could not find room: "${intent.target}"` };
    if (!ppm) return { error: 'Please calibrate scale first before resizing with real-world units.' };
    
    let wPx = intent.width, hPx = intent.height;
    if (intent.unit === 'm') { wPx = intent.width * ppm; hPx = intent.height * ppm; }
    else if (intent.unit === 'ft') { wPx = intent.width * ppm / 3.281; hPx = intent.height * ppm / 3.281; }
    else if (intent.unit === 'sqft' && intent.width && !intent.height) {
      const sqPx = intent.width * (ppm / 3.281) ** 2;
      wPx = Math.sqrt(sqPx * (room.width / room.height));
      hPx = sqPx / wPx;
    }

    const oldBox = { x: room.x, y: room.y, width: room.width, height: room.height };

    let newImageWidth = schema.imageWidth;
    let newImageHeight = schema.imageHeight;

    // Update dimensions and position with safety clamps
    if (lockFootprint) {
      // Clamp room dimensions so they don't exceed the outer footprint (minus 40px buffer for neighbors)
      const maxAllowedW = Math.max(20, schema.imageWidth - 40);
      const maxAllowedH = Math.max(20, schema.imageHeight - 40);
      room.width = Math.max(20, Math.min(wPx, maxAllowedW));
      room.height = Math.max(20, Math.min(hPx, maxAllowedH));

      // Resize from center
      const cx = oldBox.x + oldBox.width / 2;
      const cy = oldBox.y + oldBox.height / 2;
      const targetX = cx - room.width / 2;
      const targetY = cy - room.height / 2;

      // Keep the room positioned inside the outer footprint [20, max - 20]
      room.x = Math.max(20, Math.min(targetX, schema.imageWidth - room.width - 20));
      room.y = Math.max(20, Math.min(targetY, schema.imageHeight - room.height - 20));
    } else {
      const scaleX = wPx / oldBox.width;
      const scaleY = hPx / oldBox.height;
      newImageWidth = schema.imageWidth * scaleX;
      newImageHeight = schema.imageHeight * scaleY;

      rooms.forEach(r => {
        r.x = r.x * scaleX;
        r.y = r.y * scaleY;
        r.width = r.width * scaleX;
        r.height = r.height * scaleY;
      });

      room.width = wPx;
      room.height = hPx;
      room.x = oldBox.x * scaleX;
      room.y = oldBox.y * scaleY;
    }
    const newSvg = schema.rawSvg;
    
    const idx = rooms.findIndex(r => r.id === room.id);
    rooms[idx] = room;
    return { 
      schema: { 
        ...schema, 
        rawSvg: newSvg,
        imageWidth: newImageWidth,
        imageHeight: newImageHeight
      }, 
      message: `✅ Resized "${room.label}" to ${intent.width}×${intent.height} ${intent.unit}. ${
        lockFootprint 
          ? 'The adjacent spaces were scaled to lock the outer footprint.' 
          : 'The entire floor plan dynamically stretched to fit.'
      }` 
    };
  }

  if (intent.action === 'rename') {
    const room = findRoom(intent.target);
    if (!room) return { error: `Could not find room: "${intent.target}"` };
    room.label = intent.new_label;
    const idx = rooms.findIndex(r => r.id === room.id);
    rooms[idx] = room;
    return { schema: { ...schema, rooms }, message: `✅ Renamed to "${intent.new_label}".` };
  }

  if (intent.action === 'clarify') {
    return { error: intent.message };
  }

  return { error: `Action "${intent.action}" is not yet supported in this beta.` };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function VectorEditorPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  
  const [stage, setStage] = useState<EditorStage>('upload');
  const [schema, setSchema] = useState<VectorSchema | null>(null);
  const [history, setHistory] = useState<VectorSchema[]>([]);
  const [redoStack, setRedoStack] = useState<VectorSchema[]>([]);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>('');
  const [lockFootprint, setLockFootprint] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: 'system', content: '🔬 **Vector Sandbox Beta** — Upload a floor plan to begin. I will vectorize it, label the rooms, and let you edit with precise measurements.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  
  // Calibration state
  const [calibPoints, setCalibPoints] = useState<{ x: number; y: number }[]>([]);
  const [calibDistance, setCalibDistance] = useState('');
  const [calibUnit, setCalibUnit] = useState<'m' | 'ft'>('m');
  const [isCalibrating, setIsCalibrating] = useState(false);

  // Generative JSON Layout state
  const [layoutState, setLayoutState] = useState<any>(null);
  const [layoutHistory, setLayoutHistory] = useState<any[]>([]);
  const [layoutRedoStack, setLayoutRedoStack] = useState<any[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  /* ── Upload & Vectorize ──────────────────────────────────────────────────── */
  const handleUpload = useCallback(async (file: File) => {
    setStage('vectorizing');
    addChat('system', '⚙️ Extracting floor plan layout using Vision AI...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setOriginalImage(base64);

      try {
        const res = await fetch('/api/extract-layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        setLayoutState(data.layout);
        
        // Build a dummy VectorSchema to satisfy UI checks
        const fakeSchema: VectorSchema = {
          scale: { pixelsPerMeter: 20 },
          rooms: data.layout.rooms.map((r: any) => ({
            id: r.id,
            label: r.label,
            shape: 'rect',
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            verified: true,
            color: 'rgba(0,0,0,0)'
          })),
          rawSvg: '',
          imageWidth: data.layout.exterior_shell.width,
          imageHeight: data.layout.exterior_shell.height,
        };

        setSchema(fakeSchema);
        setStage('edit');
        addChat('system', `✅ Layout successfully extracted! You can now instruct the AI to redesign the floor plan. Try asking: *"Make the bedroom 3x4 meters"*`);
      } catch (err: any) {
        addChat('error', `Failed to extract layout: ${err.message}`);
        setStage('upload');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const addChat = (role: ChatMessage['role'], content: string) => {
    setChat(prev => [...prev, { role, content }]);
  };

  /* ── Calibration ─────────────────────────────────────────────────────────── */
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (stage !== 'calibrate' || !isCalibrating) return;
    const svg = e.currentTarget;
    
    // Create an SVGPoint for the click coordinates
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    
    // Transform screen coordinates directly into the SVG's internal viewBox coordinate system
    const screenCTM = svg.getScreenCTM();
    if (!screenCTM) return;
    
    const svgP = pt.matrixTransform(screenCTM.inverse());

    if (calibPoints.length < 2) {
      setCalibPoints(prev => [...prev, { x: svgP.x, y: svgP.y }]);
    }
  };

  const applyCalibration = () => {
    if (calibPoints.length !== 2 || !calibDistance || !schema) return;
    const dist = parseFloat(calibDistance);
    if (isNaN(dist) || dist <= 0) return;

    const dx = calibPoints[1].x - calibPoints[0].x;
    const dy = calibPoints[1].y - calibPoints[0].y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const ppm = calibUnit === 'm' ? pixelDist / dist : pixelDist / (dist / 3.281);

    setSchema(prev => prev ? { ...prev, scale: { pixelsPerMeter: ppm } } : prev);
    setCalibPoints([]);
    setCalibDistance('');
    setIsCalibrating(false);
    setStage('edit');
    addChat('system', `✅ Scale calibrated! **1 meter = ${ppm.toFixed(1)} pixels**. You can now edit rooms with real-world measurements. Try: *"Make the kitchen 4x3 meters"*`);
  };

  /* ── AI Chat Edit ────────────────────────────────────────────────────────── */
  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || isProcessing || !layoutState) return;
    
    setChatInput('');
    addChat('user', msg);
    setIsProcessing(true);

    try {
      const res = await fetch('/api/redesign-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layoutState, prompt: msg }),
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      setLayoutHistory(prev => [...prev, layoutState]);
      setLayoutRedoStack([]);
      setLayoutState(data.layout);

      // Keep dummy schema rooms in sync
      const fakeSchema: VectorSchema = {
        scale: { pixelsPerMeter: 20 },
        rooms: data.layout.rooms.map((r: any) => ({
          id: r.id,
          label: r.label,
          shape: 'rect',
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          verified: true,
          color: 'rgba(0,0,0,0)'
        })),
        rawSvg: '',
        imageWidth: data.layout.exterior_shell.width,
        imageHeight: data.layout.exterior_shell.height,
      };
      setSchema(fakeSchema);

      addChat('assistant', `🛠️ **Redesign Complete!** Recalculated room boundaries inside the exterior shell to match your request.`);
    } catch (err: any) {
      addChat('error', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportDxf = () => {
    if (!schema) return;
    try {
      const scalePpm = schema.scale.pixelsPerMeter || 20;
      const dxfContent = convertSvgToDxf(schema.rawSvg, schema.rooms, scalePpm);
      
      const blob = new Blob([dxfContent], { type: 'application/dxf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `floorplan_edit.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addChat('system', '💾 **DXF Exported successfully!** You can now open this file directly in AutoCAD, Revit, or Illustrator.');
    } catch (e: any) {
      addChat('error', `Failed to export DXF: ${e.message}`);
    }
  };

  /* ── Undo/Redo ───────────────────────────────────────────────────────────── */
  const handleUndo = () => {
    if (layoutHistory.length === 0 || !layoutState) return;
    setLayoutRedoStack(prev => [layoutState, ...prev]);
    setLayoutState(layoutHistory[layoutHistory.length - 1]);
    setLayoutHistory(prev => prev.slice(0, -1));

    const histLayout = layoutHistory[layoutHistory.length - 1];
    if (histLayout) {
      const fakeSchema: VectorSchema = {
        scale: { pixelsPerMeter: 20 },
        rooms: histLayout.rooms.map((r: any) => ({
          id: r.id,
          label: r.label,
          shape: 'rect',
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          verified: true,
          color: 'rgba(0,0,0,0)'
        })),
        rawSvg: '',
        imageWidth: histLayout.exterior_shell.width,
        imageHeight: histLayout.exterior_shell.height,
      };
      setSchema(fakeSchema);
    }
  };
  const handleRedo = () => {
    if (layoutRedoStack.length === 0 || !layoutState) return;
    setLayoutHistory(prev => [...prev, layoutState]);
    setLayoutState(layoutRedoStack[0]);
    setLayoutRedoStack(prev => prev.slice(1));

    const nextLayout = layoutRedoStack[0];
    if (nextLayout) {
      const fakeSchema: VectorSchema = {
        scale: { pixelsPerMeter: 20 },
        rooms: nextLayout.rooms.map((r: any) => ({
          id: r.id,
          label: r.label,
          shape: 'rect',
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          verified: true,
          color: 'rgba(0,0,0,0)'
        })),
        rawSvg: '',
        imageWidth: nextLayout.exterior_shell.width,
        imageHeight: nextLayout.exterior_shell.height,
      };
      setSchema(fakeSchema);
    }
  };

  /* ── Verify all rooms ────────────────────────────────────────────────────── */
  const handleVerifyAndCalibrate = () => {
    if (!schema) return;
    const updated = { ...schema, rooms: schema.rooms.map(r => ({ ...r, verified: true })) };
    setSchema(updated);
    setStage('calibrate');
    setIsCalibrating(true);
    addChat('system', '📐 **Scale Calibration** — Click two points on a known wall or dimension line on the plan, then enter the real-world distance.');
  };

  const skipCalibration = () => {
    setStage('edit');
    addChat('system', '⚠️ Scale skipped. You can resize rooms visually, but real-world unit editing (meters/feet) will not be available until you calibrate. Click **Calibrate Scale** to add it later.');
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  const viewW = schema?.imageWidth || 800;
  const viewH = schema?.imageHeight || 600;

  return (
    <div className="fixed inset-0 bg-[#060610] flex flex-col font-mono text-white overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-[#0a0a1a]/80 backdrop-blur z-20 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-cyan-500/60 hover:text-cyan-400 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <Layers size={16} className="text-cyan-400" />
          <span className="text-cyan-400 font-bold tracking-[2px] uppercase text-sm">Vector Sandbox</span>
          <span className="text-[10px] bg-purple-500/20 border border-purple-400/40 text-purple-300 px-2 py-0.5 rounded-full tracking-wider">β BETA</span>
        </div>
        <div className="flex items-center gap-2">
          {schema && (
            <>
              <button onClick={handleUndo} disabled={history.length === 0}
                className="p-1.5 rounded border border-cyan-500/20 text-cyan-500/50 hover:text-cyan-400 hover:border-cyan-400/40 disabled:opacity-30 transition-all">
                <RotateCcw size={14} />
              </button>
              <button onClick={handleRedo} disabled={redoStack.length === 0}
                className="p-1.5 rounded border border-cyan-500/20 text-cyan-500/50 hover:text-cyan-400 hover:border-cyan-400/40 disabled:opacity-30 transition-all">
                <RotateCw size={14} />
              </button>
              {stage === 'edit' && (
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-cyan-400 hover:text-cyan-300 mr-2 select-none">
                  <input
                    type="checkbox"
                    checked={lockFootprint}
                    onChange={(e) => setLockFootprint(e.target.checked)}
                    className="rounded bg-[#0f0f20] border-cyan-500/30 text-cyan-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Lock Footprint</span>
                </label>
              )}
              {schema.scale.pixelsPerMeter && (
                <span className="text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded tracking-wider">
                  SCALE: 1m = {schema.scale.pixelsPerMeter.toFixed(0)}px
                </span>
              )}
              {stage === 'edit' && !schema.scale.pixelsPerMeter && (
                <button onClick={() => { setStage('calibrate'); setIsCalibrating(true); }}
                  className="text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-2 py-0.5 rounded tracking-wider hover:bg-yellow-500/20">
                  CALIBRATE SCALE
                </button>
              )}
              <button onClick={handleExportDxf}
                className="text-[10px] flex items-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-black px-2.5 py-1 rounded font-bold transition-all ml-1">
                <Download size={12} />
                <span>EXPORT DXF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* SVG Preview Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Stage Indicator */}
          <div className="px-4 py-2 border-b border-cyan-500/10 bg-[#08081a]/60 shrink-0 flex items-center justify-between">
            <div className="flex gap-3 text-[10px] tracking-wider uppercase">
              {['upload','verify','calibrate','edit'].map((s, i) => (
                <span key={s} className={`px-2 py-0.5 rounded ${
                  stage === s ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40' :
                  ['upload','verify','calibrate','edit'].indexOf(stage) > i ? 'text-blue-400' : 'text-cyan-500/30'
                }`}>
                  {i+1}. {s}
                </span>
              ))}
            </div>
            {schema && (
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="p-1 text-cyan-500/50 hover:text-cyan-400"><ZoomIn size={14}/></button>
                <span className="text-[10px] text-cyan-500/60">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="p-1 text-cyan-500/50 hover:text-cyan-400"><ZoomOut size={14}/></button>
                <button onClick={() => setZoom(1)} className="p-1 text-cyan-500/50 hover:text-cyan-400"><Maximize size={14}/></button>
              </div>
            )}
          </div>

          {/* Canvas Area */}
          <div className="flex-1 overflow-auto bg-[#04040e] p-4 relative" ref={svgContainerRef}>
            <div className="min-w-max min-h-full flex items-center justify-center">
            {stage === 'upload' && (
              <div
                className="w-full max-w-lg border-2 border-dashed border-cyan-500/30 rounded-xl p-16 flex flex-col items-center gap-4 cursor-pointer hover:border-cyan-400/60 hover:bg-cyan-500/5 transition-all group"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
              >
                <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center group-hover:bg-cyan-500/20 transition-all">
                  <Upload size={28} className="text-cyan-400" />
                </div>
                <div className="text-center">
                  <p className="text-cyan-300 font-bold tracking-[2px] uppercase text-sm">Upload Floor Plan</p>
                  <p className="text-cyan-500/50 text-[11px] mt-1 tracking-wide">PNG, JPG — clean digital blueprints work best</p>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </div>
            )}

            {stage === 'vectorizing' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 size={48} className="text-cyan-400 animate-spin" />
                <p className="text-cyan-400 tracking-[3px] uppercase text-sm animate-pulse">Extracting Layout using Vision AI...</p>
              </div>
            )}

            {schema && (stage === 'verify' || stage === 'calibrate' || stage === 'edit') && (
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s', margin: 'auto' }}>
                {stage === 'edit' && layoutState ? (
                  <div style={{ width: layoutState.exterior_shell.width, height: layoutState.exterior_shell.height }}>
                    <DynamicFloorplan layout={layoutState} rawSvg={schema?.rawSvg || ''} />
                  </div>
                ) : (
                  <svg
                    width={viewW} height={viewH}
                    viewBox={`0 0 ${viewW} ${viewH}`}
                    style={{ cursor: isCalibrating ? 'crosshair' : 'default', background: '#fff', display: 'block', maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                    onClick={handleSvgClick}
                  >
                    {/* Original image — hidden in edit mode so we only see the vectors we are warping */}
                    {originalImage && stage !== 'edit' && (
                      <image href={originalImage} x={0} y={0} width={viewW} height={viewH} opacity={0.85} style={{ pointerEvents: 'none' }} />
                    )}
                    {/* Raw SVG paths — Neon overlay during setup, Solid Blueprint during Edit */}
                    <g opacity={stage === 'edit' ? 1.0 : 0.65}
                      dangerouslySetInnerHTML={{ 
                        __html: schema.rawSvg
                          .replace(/<svg[^>]*>|<\/svg>/g, '')
                          .replace(/fill="[^"]*"/g, stage === 'edit' ? 'fill="#1e293b"' : 'fill="#00f0ff"')
                          .replace(/stroke="[^"]*"/g, 'stroke="none"')
                      }}
                    />
                    {/* Room overlays */}
                    {schema.rooms.map((room, i) => {
                      const strokeColor = ROOM_STROKE_COLORS[i % ROOM_STROKE_COLORS.length];
                      const isSelected = selectedRoom === room.id;
                      return (
                        <g key={room.id} onClick={e => { if (!isCalibrating) { e.stopPropagation(); setSelectedRoom(room.id); setEditingLabel(room.label || ''); } }}
                          style={{ cursor: 'pointer' }}>
                          <rect
                            x={room.x} y={room.y} width={room.width} height={room.height}
                            fill={room.color}
                            stroke={isSelected ? '#ffffff' : strokeColor}
                            strokeWidth={isSelected ? 3 : 2}
                            strokeDasharray={room.verified ? 'none' : '6,3'}
                            rx={3}
                          />
                          <text
                            x={room.x + room.width / 2} y={room.y + room.height / 2}
                            textAnchor="middle" dominantBaseline="middle"
                            fill={isSelected ? '#ffffff' : strokeColor}
                            fontSize={Math.max(9, Math.min(15, room.width / 7, room.height / 2.5))}
                            fontFamily="monospace" fontWeight="bold"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            {room.label || `Room ${i + 1}`}
                          </text>
                        </g>
                      );
                    })}
                    {/* Calibration points */}
                    {calibPoints.map((pt, i) => (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r={6} fill="#fbbf24" stroke="#ffffff" strokeWidth={2} />
                        <text x={pt.x + 10} y={pt.y - 8} fill="#fbbf24" fontSize={12} fontFamily="monospace">{i === 0 ? 'A' : 'B'}</text>
                      </g>
                    ))}
                    {calibPoints.length === 2 && (
                      <line x1={calibPoints[0].x} y1={calibPoints[0].y} x2={calibPoints[1].x} y2={calibPoints[1].y}
                        stroke="#fbbf24" strokeWidth={2} strokeDasharray="6,4" />
                    )}
                  </svg>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Verification / Calibration Controls */}
          {stage === 'verify' && schema && (
            <div className="border-t border-cyan-500/20 bg-[#0a0a1a]/80 p-4 flex flex-wrap items-start gap-4 shrink-0">
              {selectedRoom && (
                <div className="flex items-center gap-2">
                  <input
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    placeholder="Room label..."
                    className="bg-[#0f0f20] border border-cyan-500/30 rounded px-3 py-1.5 text-[12px] text-cyan-300 focus:outline-none focus:border-cyan-400 w-40"
                  />
                  <button onClick={() => {
                    if (!editingLabel.trim()) return;
                    setSchema(prev => prev ? { ...prev, rooms: prev.rooms.map(r => r.id === selectedRoom ? { ...r, label: editingLabel.trim() } : r) } : prev);
                    setSelectedRoom(null);
                  }} className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 rounded text-[11px] hover:bg-cyan-500/30 transition-all uppercase tracking-wider">
                    Save Label
                  </button>
                </div>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={handleVerifyAndCalibrate}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 border border-cyan-400/60 text-cyan-300 rounded text-[11px] hover:bg-cyan-500/30 transition-all uppercase tracking-wider font-bold">
                  <CheckCircle size={14} /> Verify &amp; Calibrate
                </button>
                <button onClick={() => { setStage('edit'); addChat('system', '⚠️ Skipped verification. Proceeding to edit mode.'); }}
                  className="px-4 py-2 bg-[#0f0f20] border border-cyan-500/20 text-cyan-500/60 rounded text-[11px] hover:text-cyan-400 transition-all uppercase tracking-wider">
                  Skip
                </button>
              </div>
            </div>
          )}

          {stage === 'calibrate' && (
            <div className="border-t border-yellow-500/30 bg-[#0a0a1a]/80 p-4 flex flex-wrap items-center gap-4 shrink-0">
              <div className="flex items-center gap-2 text-yellow-400 text-[11px] uppercase tracking-wider">
                <Ruler size={14} />
                <span>{calibPoints.length === 0 ? 'Click Point A' : calibPoints.length === 1 ? 'Click Point B' : 'Enter distance below'}</span>
              </div>
              {calibPoints.length === 2 && (
                <>
                  <input type="number" value={calibDistance} onChange={e => setCalibDistance(e.target.value)}
                    placeholder="Real distance..."
                    className="bg-[#0f0f20] border border-yellow-500/30 rounded px-3 py-1.5 text-[12px] text-yellow-300 focus:outline-none focus:border-yellow-400 w-32" />
                  <select value={calibUnit} onChange={e => setCalibUnit(e.target.value as 'm' | 'ft')}
                    className="bg-[#0f0f20] border border-yellow-500/30 rounded px-2 py-1.5 text-[12px] text-yellow-300 focus:outline-none">
                    <option value="m">meters</option>
                    <option value="ft">feet</option>
                  </select>
                  <button onClick={applyCalibration}
                    className="flex items-center gap-2 px-4 py-1.5 bg-yellow-500/20 border border-yellow-400/60 text-yellow-300 rounded text-[11px] hover:bg-yellow-500/30 uppercase tracking-wider font-bold">
                    <CheckCircle size={13} /> Apply Scale
                  </button>
                  <button onClick={() => setCalibPoints([])} className="text-[11px] text-yellow-500/50 hover:text-yellow-400 uppercase tracking-wider">Reset Points</button>
                </>
              )}
              <button onClick={skipCalibration} className="ml-auto text-[11px] text-cyan-500/50 hover:text-cyan-400 uppercase tracking-wider">Skip Calibration</button>
            </div>
          )}
        </div>

        {/* Right Chat Panel */}
        <div className="w-80 border-l border-cyan-500/20 flex flex-col bg-[#08081a]/90 shrink-0">
          <div className="px-4 py-3 border-b border-cyan-500/20 shrink-0">
            <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase font-bold">AI Vector Chat</span>
          </div>

          {/* Room List */}
          {schema && schema.rooms.length > 0 && (
            <div className="border-b border-cyan-500/10 p-3 shrink-0">
              <p className="text-[9px] tracking-[2px] text-cyan-500/50 uppercase mb-2">Detected Rooms</p>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {schema.rooms.map((room, i) => (
                  <button key={room.id} onClick={() => { setSelectedRoom(room.id); setEditingLabel(room.label || ''); }}
                    style={{ borderColor: ROOM_STROKE_COLORS[i % ROOM_STROKE_COLORS.length] + '80', color: ROOM_STROKE_COLORS[i % ROOM_STROKE_COLORS.length] }}
                    className={`text-[9px] px-2 py-0.5 rounded border bg-transparent hover:opacity-80 transition-all uppercase tracking-wide ${selectedRoom === room.id ? 'opacity-100' : 'opacity-60'}`}>
                    {room.label || `Room ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {chat.map((msg, i) => (
              <div key={i} className={`text-[11px] leading-relaxed ${
                msg.role === 'user' ? 'text-white bg-cyan-500/10 border border-cyan-500/20 rounded px-2 py-1.5 self-end max-w-[90%]' :
                msg.role === 'assistant' ? 'text-cyan-300 bg-[#0f0f1f] border border-cyan-500/10 rounded px-2 py-1.5' :
                msg.role === 'error' ? 'text-orange-400 bg-orange-500/5 border border-orange-500/20 rounded px-2 py-1.5 flex gap-1.5 items-start' :
                'text-cyan-500/70 italic text-[10px]'
              }`}>
                {msg.role === 'error' && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
                {msg.content}
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2 text-cyan-500/60 text-[11px]">
                <Loader2 size={12} className="animate-spin" /> Parsing intent...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="border-t border-cyan-500/20 p-3 shrink-0">
            {stage !== 'edit' ? (
              <p className="text-[10px] text-cyan-500/40 text-center tracking-wider uppercase">Complete setup to unlock chat editing</p>
            ) : (
              <form onSubmit={e => { e.preventDefault(); handleChatSend(); }} className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder='Try: "Make kitchen 4x3m"'
                  className="flex-1 bg-[#0f0f20] border border-cyan-500/20 rounded px-3 py-2 text-[11px] text-cyan-300 placeholder-cyan-500/30 focus:outline-none focus:border-cyan-400/60"
                />
                <button type="submit" disabled={isProcessing || !chatInput.trim()}
                  className="px-3 py-2 bg-cyan-500/20 border border-cyan-400/40 text-cyan-400 rounded hover:bg-cyan-500/30 disabled:opacity-30 transition-all">
                  <Send size={13} />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
