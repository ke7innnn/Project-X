'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  Canvas, 
  Rect, 
  Line, 
  Circle, 
  IText, 
  Group, 
  Path,
  loadSVGFromString,
  FabricObject,
  FabricImage
} from 'fabric';
import { 
  MousePointer, 
  Edit3, 
  Square, 
  Eraser, 
  Type, 
  Trash2, 
  RotateCcw, 
  Check, 
  X,
  DoorOpen,
  SquareSlash,
  Bed,
  Tv,
  Utensils,
  Maximize2,
  Upload
} from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';

interface VectorEditorProps {
  onClose: () => void;
}

type EditorMode = 'select' | 'wall' | 'rect' | 'erase-mask' | 'text';

export default function VectorEditor({ onClose }: VectorEditorProps) {
  const { currentFloorPlan, setCurrentFloorPlan } = useArchitectStore();
  const [mode, setMode] = useState<EditorMode>('select');
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [vectorizeError, setVectorizeError] = useState<string | null>(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);

  // States to keep track of drawing operations
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const activeObjectRef = useRef<FabricObject | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadDrawing = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1];
        const canvas = fabricCanvasRef.current;
        if (canvas) {
          canvas.clear();
          canvas.backgroundColor = '#0a0a0f';
          canvas.renderAll();
          triggerVectorize(base64, canvas);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Initialize Fabric Canvas
  useEffect(() => {
    console.log('Fabric bundle check: FabricImage is loaded', !!FabricImage);
    if (!canvasRef.current || !canvasContainerRef.current) return;

    // Use container dimensions for responsive canvas sizing
    const width = canvasContainerRef.current.clientWidth || 700;
    const height = canvasContainerRef.current.clientHeight || 550;

    const canvas = new Canvas(canvasRef.current, {
      width,
      height,
      backgroundColor: '#0a0a0f', // Dark cyberpunk blueprint background
      selectionColor: 'rgba(0, 240, 255, 0.15)',
      selectionBorderColor: '#00f0ff',
      selectionLineWidth: 1,
    });

    fabricCanvasRef.current = canvas;

    // Handle window resize
    const handleResize = () => {
      if (!canvasContainerRef.current || !fabricCanvasRef.current) return;
      const w = canvasContainerRef.current.clientWidth;
      const h = canvasContainerRef.current.clientHeight;
      fabricCanvasRef.current.setDimensions({ width: w, height: h });
      fabricCanvasRef.current.renderAll();
    };
    window.addEventListener('resize', handleResize);

    // Initial vectorize if a floor plan exists
    if (currentFloorPlan) {
      triggerVectorize(currentFloorPlan, canvas);
    }

    // Set up canvas event listeners for custom drawing modes
    canvas.on('mouse:down', (options: any) => {
      const activeMode = mode; // capture current mode
      const pointer = options.scenePoint || options.pointer;
      if (activeMode === 'select' || !pointer) return;

      isDrawingRef.current = true;
      startPointRef.current = { x: pointer.x, y: pointer.y };

      if (activeMode === 'wall') {
        // Draw straight line wall
        const line = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
          stroke: '#00f0ff', // Cyberpunk blueprint active wall color
          strokeWidth: 6,
          selectable: false,
          evented: false,
        });
        canvas.add(line);
        activeObjectRef.current = line;
      } else if (activeMode === 'rect') {
        // Draw solid wall block
        const rect = new Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: '#00f0ff',
          opacity: 0.8,
          selectable: false,
          evented: false,
        });
        canvas.add(rect);
        activeObjectRef.current = rect;
      } else if (activeMode === 'erase-mask') {
        // Erase mask: draw block that matches canvas background color to mask out elements
        const mask = new Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: '#0a0a0f', // Mask matches background color
          opacity: 1,
          selectable: false,
          evented: false,
        });
        // Tag this object as an erase mask so we can handle it during export conversion
        mask.set('data', { type: 'erase-mask' });
        canvas.add(mask);
        activeObjectRef.current = mask;
      }

      canvas.renderAll();
    });

    canvas.on('mouse:move', (options: any) => {
      const pointer = options.scenePoint || options.pointer;
      if (!isDrawingRef.current || !pointer || !startPointRef.current || !activeObjectRef.current) return;
      const start = startPointRef.current;
      const activeObj = activeObjectRef.current;

      if (activeObj.type === 'line') {
        (activeObj as any).set({ x2: pointer.x, y2: pointer.y });
      } else if (activeObj.type === 'rect') {
        const width = pointer.x - start.x;
        const height = pointer.y - start.y;
        
        activeObj.set({
          left: width < 0 ? pointer.x : start.x,
          top: height < 0 ? pointer.y : start.y,
          width: Math.abs(width),
          height: Math.abs(height)
        });
      }

      canvas.renderAll();
    });

    canvas.on('mouse:up', () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (activeObjectRef.current) {
        const obj = activeObjectRef.current;
        obj.set({
          selectable: true,
          evented: true,
        });
        obj.setCoords();
      }

      activeObjectRef.current = null;
      startPointRef.current = null;
      
      // Auto return to select mode after drawing to allow transforming
      setMode('select');
      fabricCanvasRef.current?.renderAll();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
    };
  }, []);

  // Update object selection / draw state based on current mode selection
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    if (mode === 'select') {
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        obj.selectable = true;
        obj.evented = true;
      });
    } else {
      // In drawing modes, disable canvas element selection
      canvas.selection = false;
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
      canvas.discardActiveObject();
    }
    canvas.renderAll();
  }, [mode]);

  // Request SVG vectorization from Next.js backend API
  const triggerVectorize = async (base64Img: string, canvasInstance?: Canvas) => {
    const canvas = canvasInstance || fabricCanvasRef.current;
    if (!canvas) return;

    setIsVectorizing(true);
    setVectorizeError(null);

    try {
      const res = await fetch('/api/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentFloorPlanBase64: base64Img })
      });

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.svg) {
        // Load SVG string into Fabric objects
        const loaded = await loadSVGFromString(data.svg);
        if (loaded && loaded.objects) {
          const objects = loaded.objects.filter(obj => obj !== null) as FabricObject[];
          
          if (objects.length > 0) {
            const canvasW = canvas.width || 700;
            const canvasH = canvas.height || 550;

            // Compute manually the bounding box of all paths to fit canvas
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            objects.forEach((obj) => {
              const left = obj.left || 0;
              const top = obj.top || 0;
              const width = obj.width || 0;
              const height = obj.height || 0;
              
              minX = Math.min(minX, left);
              minY = Math.min(minY, top);
              maxX = Math.max(maxX, left + width);
              maxY = Math.max(maxY, top + height);
            });

            const groupW = maxX - minX;
            const groupH = maxY - minY;

            const scaleX = (canvasW - 80) / (groupW || 1);
            const scaleY = (canvasH - 80) / (groupH || 1);
            const scale = Math.min(scaleX, scaleY, 1); // Keep max scale 1

            const offsetX = (canvasW - groupW * scale) / 2 - minX * scale;
            const offsetY = (canvasH - groupH * scale) / 2 - minY * scale;

            objects.forEach((obj) => {
              obj.set({
                scaleX: (obj.scaleX || 1) * scale,
                scaleY: (obj.scaleY || 1) * scale,
                left: (obj.left || 0) * scale + offsetX,
                top: (obj.top || 0) * scale + offsetY,
                selectable: true,
                hasControls: true
              });
              canvas.add(obj);
            });

            canvas.renderAll();
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setVectorizeError((err.stack || err.message) + ' (Line: ' + typeof Line + ', Rect: ' + typeof Rect + ', Group: ' + typeof Group + ')');
    } finally {
      setIsVectorizing(false);
    }
  };

  // Add editable text block (e.g. room label)
  const handleAddText = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const text = new IText('Room Label', {
      left: (canvas.width || 700) / 2 - 50,
      top: (canvas.height || 550) / 2 - 15,
      fontFamily: 'monospace',
      fill: '#00f0ff',
      fontSize: 16,
      fontWeight: 'bold',
      borderColor: '#00f0ff',
      cornerColor: '#00f0ff',
      editingBorderColor: '#00f0ff',
      clearInvisibleWidthLimit: true
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    setMode('select');
  };

  // Delete selected objects
  const handleDeleteSelected = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  };

  // Clear all items on the canvas
  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear the canvas?')) {
      fabricCanvasRef.current?.clear();
      // Restore blueprint dark background
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.backgroundColor = '#0a0a0f';
        fabricCanvasRef.current.renderAll();
      }
    }
  };

  // Symbol placement utilities
  const addSymbol = (type: 'door' | 'window' | 'bed' | 'sofa' | 'dining' | 'bath') => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const left = (canvas.width || 700) / 2;
    const top = (canvas.height || 550) / 2;

    let group: Group;

    const defaultProps = { stroke: '#00f0ff', strokeWidth: 2, fill: 'transparent' };

    switch (type) {
      case 'door': {
        const frame = new Line([0, 40, 0, 0], defaultProps);
        const arc = new Path('M 0 0 A 40 40 0 0 1 40 40', {
          ...defaultProps,
          strokeWidth: 1.5,
          strokeDashArray: [3, 3]
        });
        const bottomLine = new Line([0, 40, 40, 40], { ...defaultProps, strokeWidth: 1, opacity: 0.5 });
        group = new Group([frame, arc, bottomLine]);
        break;
      }
      case 'window': {
        const outline1 = new Line([0, 0, 60, 0], defaultProps);
        const glass = new Line([0, 6, 60, 6], { ...defaultProps, strokeWidth: 1 });
        const outline2 = new Line([0, 12, 60, 12], defaultProps);
        const capL = new Line([0, 0, 0, 12], defaultProps);
        const capR = new Line([60, 0, 60, 12], defaultProps);
        group = new Group([outline1, glass, outline2, capL, capR]);
        break;
      }
      case 'bed': {
        const frame = new Rect({ width: 50, height: 65, ...defaultProps });
        const pillow1 = new Rect({ left: 6, top: 6, width: 16, height: 10, ...defaultProps });
        const pillow2 = new Rect({ left: 28, top: 6, width: 16, height: 10, ...defaultProps });
        const sheet = new Line([0, 22, 50, 22], defaultProps);
        group = new Group([frame, pillow1, pillow2, sheet]);
        break;
      }
      case 'sofa': {
        const back = new Rect({ width: 70, height: 50, ...defaultProps });
        const seat = new Rect({ left: 8, top: 12, width: 54, height: 38, ...defaultProps });
        const armL = new Rect({ left: 0, top: 12, width: 8, height: 38, ...defaultProps });
        const armR = new Rect({ left: 62, top: 12, width: 8, height: 38, ...defaultProps });
        group = new Group([back, seat, armL, armR]);
        break;
      }
      case 'dining': {
        const table = new Rect({ left: 12, top: 12, width: 56, height: 36, ...defaultProps });
        const chair1 = new Circle({ left: 20, top: 0, radius: 5, ...defaultProps });
        const chair2 = new Circle({ left: 44, top: 0, radius: 5, ...defaultProps });
        const chair3 = new Circle({ left: 20, top: 50, radius: 5, ...defaultProps });
        const chair4 = new Circle({ left: 44, top: 50, radius: 5, ...defaultProps });
        group = new Group([table, chair1, chair2, chair3, chair4]);
        break;
      }
      case 'bath': {
        const tub = new Rect({ width: 60, height: 30, rx: 8, ry: 8, ...defaultProps });
        const drain = new Circle({ left: 8, top: 12, radius: 3, ...defaultProps });
        group = new Group([tub, drain]);
        break;
      }
    }

    group.set({
      left: left - group.width / 2,
      top: top - group.height / 2,
      selectable: true,
      hasControls: true
    });

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
    setMode('select');
  };

  // Convert the dark blueprint canvas into a clean high-contrast black-on-white image for AI routing
  const handleSaveAndApply = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // 1. Temporarily swap styles to high-contrast black-and-white
    canvas.backgroundColor = '#ffffff';
    
    canvas.forEachObject((obj) => {
      // Convert custom erase masks to match new white background
      const data = obj.get('data') as any;
      if (data && data.type === 'erase-mask') {
        obj.set('fill', '#ffffff');
      } else {
        // Convert active cyan vectors/strokes to clean black
        if (obj.stroke === '#00f0ff') {
          obj.set('stroke', '#000000');
        }
        if (obj.fill === '#00f0ff') {
          obj.set('fill', '#000000');
        }

        // Apply to child objects if grouped (like furniture symbols)
        if (obj.type === 'group') {
          (obj as any).forEachObject((child: any) => {
            if (child.stroke === '#00f0ff') child.set('stroke', '#000000');
            if (child.fill === '#00f0ff') child.set('fill', '#000000');
          });
        }
      }
    });

    canvas.renderAll();

    // 2. Export base64 PNG data
    const dataUrl = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1.5 // Export at higher resolution
    });
    const base64Data = dataUrl.split(',')[1];

    // 3. Restore dark blueprint visualization styles
    canvas.backgroundColor = '#0a0a0f';
    canvas.forEachObject((obj) => {
      const data = obj.get('data') as any;
      if (data && data.type === 'erase-mask') {
        obj.set('fill', '#0a0a0f');
      } else {
        if (obj.stroke === '#000000') {
          obj.set('stroke', '#00f0ff');
        }
        if (obj.fill === '#000000') {
          obj.set('fill', '#00f0ff');
        }

        if (obj.type === 'group') {
          (obj as any).forEachObject((child: any) => {
            if (child.stroke === '#000000') child.set('stroke', '#00f0ff');
            if (child.fill === '#000000') child.set('fill', '#00f0ff');
          });
        }
      }
    });

    canvas.renderAll();

    // 4. Update core app store state and close editor
    setCurrentFloorPlan(base64Data);
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-[#06060a] z-50 flex flex-col font-mono text-white rounded-xl border border-gray-800 shadow-2xl">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 bg-[#0d0d12]">
        <div className="flex items-center gap-3">
          <span className="text-[#FFB000] text-sm animate-pulse">✦</span>
          <h2 className="text-sm tracking-[2px] uppercase font-bold text-gray-300">
            PRO CAD VECTOR EDITOR
          </h2>
        </div>
        <div className="flex gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUploadDrawing} 
            accept="image/png, image/jpeg"
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#334155] border border-slate-700 text-xs text-slate-100 font-semibold transition-colors"
          >
            <Upload size={14} /> Upload Custom Drawing
          </button>
          
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors"
          >
            <X size={14} /> Cancel
          </button>
          <button 
            onClick={handleSaveAndApply}
            className="flex items-center gap-2 px-4 py-1.5 rounded bg-[#FFB000] hover:bg-[#c8a84b] text-xs text-black font-bold transition-colors shadow-[0_0_10px_rgba(255,176,0,0.2)]"
          >
            <Check size={14} /> Save & Apply
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <div className="w-16 bg-[#0a0a0f] border-r border-gray-900 flex flex-col items-center py-6 gap-4">
          <button 
            title="Select & Move (V)"
            onClick={() => setMode('select')}
            className={`w-10 h-10 rounded flex items-center justify-center transition-all ${mode === 'select' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <MousePointer size={18} />
          </button>
          <button 
            title="Draw Line Wall (L)"
            onClick={() => setMode('wall')}
            className={`w-10 h-10 rounded flex items-center justify-center transition-all ${mode === 'wall' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <Edit3 size={18} />
          </button>
          <button 
            title="Draw Rect Pillar / Wall (R)"
            onClick={() => setMode('rect')}
            className={`w-10 h-10 rounded flex items-center justify-center transition-all ${mode === 'rect' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <Square size={18} />
          </button>
          <button 
            title="Erase Mask (E)"
            onClick={() => setMode('erase-mask')}
            className={`w-10 h-10 rounded flex items-center justify-center transition-all ${mode === 'erase-mask' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <Eraser size={18} />
          </button>
          <button 
            title="Add Text Label (T)"
            onClick={handleAddText}
            className="w-10 h-10 rounded flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-white transition-all"
          >
            <Type size={18} />
          </button>
          
          <div className="w-8 border-b border-gray-800/80 my-2" />

          <button 
            title="Delete Selected"
            onClick={handleDeleteSelected}
            className="w-10 h-10 rounded flex items-center justify-center text-red-500 hover:bg-red-950/20 transition-all"
          >
            <Trash2 size={18} />
          </button>
          <button 
            title="Clear All"
            onClick={handleClearAll}
            className="w-10 h-10 rounded flex items-center justify-center text-red-700 hover:bg-red-950/10 transition-all"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Dynamic Canvas Workspace Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-[#07070a]">
          {/* Top Info Bar */}
          <div className="px-6 py-2 border-b border-gray-900 bg-[#0d0d12]/50 flex justify-between text-[11px] text-gray-500">
            <span>MODE: <strong className="text-cyan-400 uppercase">{mode}</strong></span>
            {isVectorizing && <span className="text-[#FFB000] animate-pulse">Running image vectorization tracing...</span>}
            {vectorizeError && <span className="text-red-400">⚠️ {vectorizeError}</span>}
          </div>

          {/* Interactive Fabric Canvas Container */}
          <div 
            ref={canvasContainerRef}
            className="flex-1 relative flex items-center justify-center p-4 overflow-hidden"
            style={{
              backgroundImage: 'radial-gradient(circle, #1a1e2b 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          >
            <canvas ref={canvasRef} className="border border-cyan-500/10 rounded shadow-[0_0_20px_rgba(0,240,255,0.03)]" />
          </div>

          {/* Bottom Symbol Drawer */}
          <div className="border-t border-gray-900 bg-[#09090d] px-6 py-4 flex flex-col gap-2">
            <span className="text-[10px] tracking-[2.5px] uppercase text-gray-500 block font-bold">
              CAD Architecture Library (Place Symbols)
            </span>
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => addSymbol('door')}
                className="flex items-center gap-2 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/10 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded transition-all text-gray-300"
              >
                <DoorOpen size={14} className="text-cyan-400" /> Door
              </button>
              <button 
                onClick={() => addSymbol('window')}
                className="flex items-center gap-2 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/10 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded transition-all text-gray-300"
              >
                <SquareSlash size={14} className="text-cyan-400" /> Window
              </button>
              <button 
                onClick={() => addSymbol('bed')}
                className="flex items-center gap-2 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/10 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded transition-all text-gray-300"
              >
                <Bed size={14} className="text-cyan-400" /> Bed
              </button>
              <button 
                onClick={() => addSymbol('sofa')}
                className="flex items-center gap-2 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/10 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded transition-all text-gray-300"
              >
                <Tv size={14} className="text-cyan-400" /> Sofa
              </button>
              <button 
                onClick={() => addSymbol('dining')}
                className="flex items-center gap-2 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/10 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded transition-all text-gray-300"
              >
                <Utensils size={14} className="text-cyan-400" /> Dining
              </button>
              <button 
                onClick={() => addSymbol('bath')}
                className="flex items-center gap-2 bg-[#121622] hover:bg-[#1a2033] border border-cyan-500/10 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded transition-all text-gray-300"
              >
                <Maximize2 size={14} className="text-cyan-400" /> Tub
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
