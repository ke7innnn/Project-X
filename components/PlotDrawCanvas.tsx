'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { PenTool, MousePointer2, Circle, Square, Minus, Eraser, Undo2, Check, X, RotateCcw } from 'lucide-react';

type Tool = 'freehand' | 'line' | 'rect' | 'circle' | 'eraser';

interface PlotDrawCanvasProps {
  onComplete: () => void;
}

export default function PlotDrawCanvas({ onComplete }: PlotDrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('freehand');
  const [brushSize, setBrushSize] = useState(4);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(10); // 10px = 1m by default
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);

  useEffect(() => {
    // Initialize canvas
    if (canvasRef.current && containerRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set canvas internal size to 1024x1024 to match grok output ratio
        canvas.width = 1024;
        canvas.height = 1024;
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        saveState();
      }
    }
  }, []);

  const saveState = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(imageData);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const undo = () => {
    if (historyIndex > 0 && canvasRef.current) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.putImageData(history[newIndex], 0, 0);
      }
    }
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        saveState();
      }
    }
  };

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Scale coordinates to internal 1024x1024 resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const drawDistanceLabel = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const distancePx = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const distanceMeters = (distancePx / pixelsPerMeter).toFixed(1);
    
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    ctx.save();
    ctx.font = '16px monospace';
    ctx.fillStyle = '#FFB000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Draw background for text
    const textWidth = ctx.measureText(`${distanceMeters}m`).width;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(midX - textWidth/2 - 4, midY - 20, textWidth + 8, 20);
    
    ctx.fillStyle = '#FFB000';
    ctx.fillText(`${distanceMeters}m`, midX, midY - 2);
    ctx.restore();
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    setIsDrawing(true);
    setStartX(x);
    setStartY(y);
    
    setSnapshot(ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height));

    if (tool === 'freehand' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !canvasRef.current || !snapshot) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);

    if (tool === 'freehand' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : '#000000';
      ctx.lineWidth = tool === 'eraser' ? brushSize * 2 : brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      // Shape tools
      ctx.putImageData(snapshot, 0, 0);
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      if (tool === 'line') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(x, y);
        ctx.stroke();
        drawDistanceLabel(ctx, startX, startY, x, y);
      } else if (tool === 'rect') {
        ctx.rect(startX, startY, x - startX, y - startY);
        ctx.stroke();
        drawDistanceLabel(ctx, startX, startY, x, startY);
        drawDistanceLabel(ctx, startX, startY, startX, y);
      } else if (tool === 'circle') {
        const radius = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        drawDistanceLabel(ctx, startX, startY, x, y);
      }
    }
  };

  const handleEnd = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
  };

  const handleFinish = () => {
    if (canvasRef.current) {
      // Save the canvas to store
      const base64 = canvasRef.current.toDataURL('image/png');
      useArchitectStore.getState().setManualPlotImage(base64);
      onComplete();
    }
  };

  return (
    <div className="w-full flex flex-col bg-[#0f0f18] rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-[#0a0a0f]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-gray-900 rounded p-1 border border-gray-800">
            <button onClick={() => setTool('freehand')} className={`p-2 rounded ${tool === 'freehand' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:text-white'}`}>
              <PenTool size={16} />
            </button>
            <button onClick={() => setTool('line')} className={`p-2 rounded ${tool === 'line' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:text-white'}`}>
              <Minus size={16} />
            </button>
            <button onClick={() => setTool('rect')} className={`p-2 rounded ${tool === 'rect' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:text-white'}`}>
              <Square size={16} />
            </button>
            <button onClick={() => setTool('circle')} className={`p-2 rounded ${tool === 'circle' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:text-white'}`}>
              <Circle size={16} />
            </button>
            <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-[#FFB000] text-black' : 'text-gray-400 hover:text-white'}`}>
              <Eraser size={16} />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Brush:</span>
            <input 
              type="range" 
              min="1" max="20" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseInt(e.target.value))}
              className="w-24 accent-[#FFB000]"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Scale (1m = X px):</span>
            <input 
              type="number" 
              min="1" max="100" 
              value={pixelsPerMeter} 
              onChange={(e) => setPixelsPerMeter(parseInt(e.target.value) || 10)}
              className="w-16 bg-gray-900 border border-gray-700 text-white rounded p-1 text-sm text-center focus:border-[#FFB000] focus:outline-none"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={historyIndex <= 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 rounded bg-gray-900 border border-gray-800">
            <Undo2 size={16} />
          </button>
          <button onClick={clearCanvas} className="p-2 text-gray-400 hover:text-white rounded bg-gray-900 border border-gray-800">
            <RotateCcw size={16} />
          </button>
          <button onClick={handleFinish} className="flex items-center gap-2 px-4 py-2 bg-[#FFB000] hover:bg-[#D8B78D] text-black font-bold text-xs uppercase tracking-widest rounded ml-2">
            <Check size={16} /> Done Tracing
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef} 
        className="w-full flex items-center justify-center bg-gray-900 p-4"
        style={{ height: '60vh' }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseOut={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          className="bg-white rounded shadow-lg touch-none max-w-full max-h-full object-contain cursor-crosshair"
          style={{ aspectRatio: '1/1' }}
        />
      </div>
      
      <div className="p-3 bg-gray-900 border-t border-gray-800 text-center">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">
          Draw your plot boundary. It must form a closed shape. This will strictly constrain the generated floor plan.
        </p>
      </div>
    </div>
  );
}
