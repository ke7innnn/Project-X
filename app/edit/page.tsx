'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, PenTool, Loader2, UploadCloud, Folder, Search, Plus, MapPin, Clock, Trash2, Map, Brush, Eraser, Undo2, Box, Type, Move, Check, X, Minus, Ruler, MousePointerClick } from 'lucide-react';
import CinematicIntro from '@/components/CinematicIntro';
import SaveToProjectModal from '@/components/SaveToProjectModal';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { convertSvgToDxf } from '@/lib/svgToDxf';

export default function EditPage() {
  const router = useRouter();
  const { currentFloorPlan, floorPlanHistory, setCurrentFloorPlan, collectedParameters, roomDimensions, sessionId, projectName, placeName, replaceState } = useArchitectStore();
  const switchSession = useArchitectStore(state => state.switchSession);

  const [prompt, setPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // DXF Conversion Modal State
  type DxfPhase = 'idle' | 'tracing' | 'preview' | 'error';
  const [dxfPhase, setDxfPhase] = useState<DxfPhase>('idle');
  const [dxfSvg, setDxfSvg] = useState<string | null>(null);
  const [dxfBlob, setDxfBlob] = useState<Blob | null>(null);
  const [dxfError, setDxfError] = useState<string | null>(null);

  // Pre-page Project Selection Dashboard state
  const [showSelector, setShowSelector] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newPlaceName, setNewPlaceName] = useState('');

  // Inpaint State
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasInpaint, setHasInpaint] = useState(false);
  const [drawingHistory, setDrawingHistory] = useState<string[]>([]);
  const [strokeRedoHistory, setStrokeRedoHistory] = useState<string[]>([]);
  const [floorPlanRedoStack, setFloorPlanRedoStack] = useState<string[]>([]);
  
  const [isTextMode, setIsTextMode] = useState(false);
  const [brushMode, setBrushMode] = useState<'brush' | 'eraser' | 'text'>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [textInput, setTextInput] = useState({ active: false, x: 0, y: 0, text: '' });
  const [textDrag, setTextDrag] = useState({ isDragging: false, startX: 0, startY: 0, initialInputX: 0, initialInputY: 0 });

  // Scale Calibration State
  type CalibStep = 'idle' | 'point1' | 'point2' | 'input';
  const [calibStep, setCalibStep] = useState<CalibStep>('idle');
  const [calibPoints, setCalibPoints] = useState<{ x: number; y: number }[]>([]);
  const [calibScale, setCalibScale] = useState<{ pxPerFt: number; pxPerM: number } | null>(null);
  const [calibDistInput, setCalibDistInput] = useState('');
  const [calibUnit, setCalibUnit] = useState<'ft' | 'm'>('ft');
  const calibImgRef = useRef<HTMLDivElement>(null);

  // Room Picker (Click-a-Room) State
  const [isRoomPickerMode, setIsRoomPickerMode] = useState(false);
  const [pickedRoomName, setPickedRoomName] = useState('');
  const [showRoomNamePopup, setShowRoomNamePopup] = useState(false);
  const [pickedRoomPreview, setPickedRoomPreview] = useState<{ x: number; y: number } | null>(null);

  // AI OCR Room Reader State
  interface RoomData { name: string; dimensions?: string; areaSqft?: number; label?: string; }
  interface OCRResult { rooms: RoomData[]; bhkType?: string; totalAreaSqft?: number; confidence: string; }
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const runOCR = async (imageBase64: string) => {
    setIsOcrLoading(true);
    setOcrError(null);
    try {
      const res = await fetch('/api/ocr-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOcrResult(data);
    } catch (err: any) {
      setOcrError('Could not read plan labels. Try a clearer image.');
      console.warn('[OCR]', err.message);
    } finally {
      setIsOcrLoading(false);
    }
  };

  useEffect(() => {
    if (!textDrag.isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - textDrag.startX;
      const dy = e.clientY - textDrag.startY;
      setTextInput(prev => ({ ...prev, x: textDrag.initialInputX + dx, y: textDrag.initialInputY + dy }));
    };
    const handleMouseUp = () => {
      setTextDrag(prev => ({ ...prev, isDragging: false }));
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [textDrag]);

  // Keyboard shortcuts: Ctrl+Z = Undo, Ctrl+Shift+Z / Ctrl+Y = Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return; // don't intercept typing
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPlanHistory, floorPlanRedoStack]);

  useEffect(() => {
    const resizeCanvas = () => {
      if (imgRef.current && canvasRef.current) {
        const newW = imgRef.current.clientWidth;
        const newH = imgRef.current.clientHeight;
        if (newW === 0 || newH === 0) return;
        
        if (canvasRef.current.width !== newW || canvasRef.current.height !== newH) {
          // Save before resize
          const existingData = canvasRef.current.width > 0 && canvasRef.current.height > 0 ? canvasRef.current.toDataURL() : null;
          
          canvasRef.current.width = newW;
          canvasRef.current.height = newH;
          
          if (existingData) {
            const img = new Image();
            img.onload = () => {
              if (canvasRef.current) {
                canvasRef.current.getContext('2d')?.drawImage(img, 0, 0, newW, newH);
              }
            };
            img.src = existingData;
          }
        }
      }
    };
    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [isInpaintMode, isTextMode, currentFloorPlan]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ((!isInpaintMode && !isTextMode) || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    
    if (isTextMode) {
      if (textInput.active && textInput.text) {
        burnTextToImage(true);
      }
      setTextInput({ active: true, x, y, text: '' });
      return;
    }

    // Save current canvas state to history before drawing new stroke
    setDrawingHistory(prev => [...prev, canvas.toDataURL()]);
    setStrokeRedoHistory([]);

    setIsDrawing(true);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isInpaintMode || !canvasRef.current) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.globalCompositeOperation = brushMode === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = brushMode === 'eraser' ? 'rgba(0,0,0,1)' : 'rgba(0, 255, 0, 0.4)';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    // Reset composite operation to default
    ctx.globalCompositeOperation = 'source-over';
    
    setHasInpaint(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      canvasRef.current.getContext('2d')?.closePath();
    }
  };

  const clearInpaint = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    setHasInpaint(false);
    setDrawingHistory([]);
    setStrokeRedoHistory([]);
  };

  const undoStroke = () => {
    if (drawingHistory.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentState = canvas.toDataURL();
    setStrokeRedoHistory(prev => [...prev, currentState]);

    const previousStateDataUrl = drawingHistory[drawingHistory.length - 1];
    const img = new Image();
    img.src = previousStateDataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setDrawingHistory(prev => prev.slice(0, -1));
      if (drawingHistory.length === 1) {
        setHasInpaint(false);
      }
    };
  };

  const redoStroke = () => {
    if (strokeRedoHistory.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentState = canvas.toDataURL();
    setDrawingHistory(prev => [...prev, currentState]);

    const nextStateDataUrl = strokeRedoHistory[strokeRedoHistory.length - 1];
    const img = new Image();
    img.src = nextStateDataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setStrokeRedoHistory(prev => prev.slice(0, -1));
      setHasInpaint(true);
    };
  };

  const burnTextToImage = (preserveState = false) => {
    try {
      if (!textInput.active || !textInput.text || !imgRef.current) {
        if (!preserveState) setTextInput({ active: false, x: 0, y: 0, text: '' });
        return;
      }
      
      const canvas = document.createElement('canvas');
      const img = imgRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(img, 0, 0);
      
      // Scale coordinates from display size to natural size
      const scaleX = canvas.width / img.clientWidth;
      const scaleY = canvas.height / img.clientHeight;
      
      ctx.font = `bold ${brushSize * scaleX}px sans-serif`;
      ctx.fillStyle = '#000000'; // Draw in Black for blueprints
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(textInput.text, textInput.x * scaleX, textInput.y * scaleY);
      
      const newBase64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      
      // Add to redo stack
      replaceState({
        currentFloorPlan: newBase64,
        floorPlanHistory: [...(floorPlanHistory || []), currentFloorPlan as string]
      });
      setFloorPlanRedoStack([]);
      
      if (!preserveState) {
        setTextInput({ active: false, x: 0, y: 0, text: '' });
      }
    } catch (e: any) {
      alert("Error burning text: " + e.message);
      if (!preserveState) setTextInput({ active: false, x: 0, y: 0, text: '' });
    }
  };

  const downloadAsPng = () => {
    if (!currentFloorPlan) return;
    const link = document.createElement('a');
    link.href = currentFloorPlan.startsWith('data:image/') ? currentFloorPlan : `data:image/jpeg;base64,${currentFloorPlan}`;
    link.download = `${projectName || 'floorplan'}_edited.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Flood fill: detect room from a clicked pixel on the displayed image,
  // paint it green on the inpaint canvas, and return the room region.
  const floodFillRoom = (clickX: number, clickY: number) => {
    if (!imgRef.current || !canvasRef.current) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;

    // Draw image to offscreen canvas at display resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const octx = offscreen.getContext('2d')!;
    octx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = octx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const W = canvas.width;
    const H = canvas.height;
    const filled = new Uint8Array(W * H);

    // Threshold: white-ish pixels = room interior, dark = walls
    const isLight = (idx: number) => data[idx] > 200 && data[idx + 1] > 200 && data[idx + 2] > 200;

    const startIdx = (Math.floor(clickY) * W + Math.floor(clickX));
    if (!isLight(startIdx * 4)) {
      // Clicked on a wall — search nearby for a light pixel
      let found = false;
      for (let r = 1; r <= 15 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const nx = Math.floor(clickX) + dx;
            const ny = Math.floor(clickY) + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nidx = ny * W + nx;
            if (isLight(nidx * 4)) {
              clickX = nx; clickY = ny; found = true;
            }
          }
        }
      }
      if (!found) return;
    }

    // BFS flood fill
    const queue: number[] = [Math.floor(clickY) * W + Math.floor(clickX)];
    filled[queue[0]] = 1;
    const MAX_FILL = W * H * 0.5; // Don't fill more than 50% of the image
    let count = 0;
    while (queue.length > 0 && count < MAX_FILL) {
      const cur = queue.pop()!;
      count++;
      const cx = cur % W;
      const cy = Math.floor(cur / W);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!filled[ni] && isLight(ni * 4)) {
          filled[ni] = 1;
          queue.push(ni);
        }
      }
    }

    // Paint filled region green on inpaint canvas
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const out = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      if (filled[i]) {
        out.data[i * 4] = 0;
        out.data[i * 4 + 1] = 255;
        out.data[i * 4 + 2] = 0;
        out.data[i * 4 + 3] = 100; // semi-transparent green
      }
    }
    ctx.putImageData(out, 0, 0);
    setHasInpaint(true);
    setDrawingHistory([canvas.toDataURL()]);
  };

  useEffect(() => {
    if (sessionId) {
      setShowSelector(false);
    }
  }, [sessionId]);

  // Auto-run OCR when a floor plan loads into the editor (from workspace or project)
  useEffect(() => {
    if (currentFloorPlan && !ocrResult && !isOcrLoading) {
      runOCR(currentFloorPlan);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFloorPlan]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showSelector) {
      fetchProjects();
      interval = setInterval(fetchProjects, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showSelector]);

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data, error } = await supabase
        .from('edit_projects')
        .select('session_id, state, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

const getRoomSpecificCADInstructions = (userInput: string) => {
  const clean = userInput.toLowerCase();
  
  if (clean.includes('pool') || clean.includes('swimming')) {
    return 'Draw a detailed 2D plan view architectural swimming pool layout inside the green area. Use standard black blueprint drawing symbols: show the pool outline, steps/stairs, water depth lines, and an optional wood deck or tile coping border surrounding the pool. Keep it strictly in the black and white 2D drafting style.';
  }
  if (clean.includes('kitchen')) {
    return 'Draw a standard 2D kitchen layout inside the green area: countertops, kitchen sink basin, range/stove burners, refrigerator space, and cabinets in black CAD outline style.';
  }
  if (clean.includes('bath') || clean.includes('toilet') || clean.includes('washroom')) {
    return 'Draw bathroom details in 2D plan view: a bathtub, toilet, washbasin, and shower cabinet using standard black blueprint CAD symbols.';
  }
  if (clean.includes('bed')) {
    return 'Draw a detailed bedroom layout: double or single bed outlines with pillows, bedside tables, wardrobes, and closets in black line art.';
  }
  if (clean.includes('living') || clean.includes('lounge') || clean.includes('hall')) {
    return 'Draw living room furniture configurations: couch/sofa outlines, a coffee table, media console, and armchairs in clean black CAD lines.';
  }
  if (clean.includes('garden') || clean.includes('yard') || clean.includes('lawn') || clean.includes('outdoor') || clean.includes('patio')) {
    return 'Draw outdoor landscaping features inside the green area: paving stones grid, circular tree/shrub blueprint symbols, grass hatch texturing, and simple patio furniture symbols.';
  }
  if (clean.includes('parking') || clean.includes('garage') || clean.includes('car')) {
    return 'Draw car parking layouts: parking spaces with clean 2D outline symbols of parked cars.';
  }
  if (clean === 'empty' || clean === 'empty room' || clean === 'no furniture') {
    return 'Completely vacate the space. Erase all furniture, fixtures, appliances, text labels, and structural details from inside this room, leaving it entirely blank/empty. Keep only the outer bounding walls and doors.';
  }
  
  return `Erase the existing contents and draw a clean, detailed 2D plan view layout for a "${userInput}" inside this room. Use standard architectural CAD blueprint furniture symbols.`;
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

const blendImagesWithMask = (
  originalImg: HTMLImageElement,
  editedImg: HTMLImageElement,
  maskCanvas: HTMLCanvasElement
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = originalImg.naturalWidth;
  canvas.height = originalImg.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Draw the original image first
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

  // 2. Create an offscreen canvas for the mask, scaled to the natural size
  const maskTempCanvas = document.createElement('canvas');
  maskTempCanvas.width = canvas.width;
  maskTempCanvas.height = canvas.height;
  const maskTempCtx = maskTempCanvas.getContext('2d');
  if (maskTempCtx) {
    // DILATION: Use a strong blur to expand the mask smoothly in all directions.
    // This creates a conformal shape that hugs the paint strokes and avoids the 
    // "corner overlap" problem of an axis-aligned bounding box.
    maskTempCtx.filter = 'blur(25px)';
    
    // Draw multiple times to increase the alpha intensity (since user brush is 0.4 opacity)
    maskTempCtx.drawImage(maskCanvas, 0, 0, maskTempCanvas.width, maskTempCanvas.height);
    maskTempCtx.drawImage(maskCanvas, 0, 0, maskTempCanvas.width, maskTempCanvas.height);
    maskTempCtx.drawImage(maskCanvas, 0, 0, maskTempCanvas.width, maskTempCanvas.height);
    maskTempCtx.drawImage(maskCanvas, 0, 0, maskTempCanvas.width, maskTempCanvas.height);
  }

  // 3. Create an offscreen canvas for the edited image
  const editedTempCanvas = document.createElement('canvas');
  editedTempCanvas.width = canvas.width;
  editedTempCanvas.height = canvas.height;
  const editedTempCtx = editedTempCanvas.getContext('2d');
  if (editedTempCtx) {
    editedTempCtx.drawImage(editedImg, 0, 0, editedTempCanvas.width, editedTempCanvas.height);
  }

  // 4. Perform pixel-level blending using the dilated conformal mask
  const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const maskData = maskTempCtx ? maskTempCtx.getImageData(0, 0, canvas.width, canvas.height) : null;
  const editedData = editedTempCtx ? editedTempCtx.getImageData(0, 0, canvas.width, canvas.height) : null;

  if (maskData && editedData) {
    const pixels = originalData.data;
    const maskPixels = maskData.data;
    const editedPixels = editedData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = maskPixels[i + 3];
      
      // If the dilated mask has even a tiny bit of opacity, we consider it inside the edit zone.
      // This copies the AI's generated pixels only for the expanded stroke area.
      if (alpha > 5) {
        pixels[i] = editedPixels[i];
        pixels[i + 1] = editedPixels[i + 1];
        pixels[i + 2] = editedPixels[i + 2];
        pixels[i + 3] = editedPixels[i + 3];
      }
    }
    ctx.putImageData(originalData, 0, 0);
  }

  return canvas.toDataURL('image/png');
};

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !currentFloorPlan || isEditing) return;

    setIsEditing(true);
    setError(null);
    
    let finalPayloadBase64 = currentFloorPlan;
    let finalPrompt = prompt;

    if (isInpaintMode && hasInpaint && canvasRef.current && imgRef.current) {
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = imgRef.current.naturalWidth;
      compositeCanvas.height = imgRef.current.naturalHeight;
      const ctx = compositeCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imgRef.current, 0, 0, compositeCanvas.width, compositeCanvas.height);
        ctx.drawImage(canvasRef.current, 0, 0, compositeCanvas.width, compositeCanvas.height);
        finalPayloadBase64 = compositeCanvas.toDataURL('image/png');
        
        const cleanPrompt = prompt.trim();
        const displayPrompt = cleanPrompt.replace(/^replace\s+green\s+with:\s*/i, '').trim();

        finalPrompt = `Modify the green painted area: ${displayPrompt}`;
      }
    }

    try {
      const editRes = await fetch('/api/edit-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentFloorPlanBase64: finalPayloadBase64,
          editInstruction: finalPrompt,
          collectedParameters: {
            ...collectedParameters,
            ...(calibScale ? {
              scaleInfo: `This floor plan has been calibrated: 1 foot = ${calibScale.pxPerFt.toFixed(2)} pixels (display). Use this to understand proportions.`
            } : {})
          },
          roomDimensions,
          isInpaint: isInpaintMode && hasInpaint,
          skipTranslation: false
        })
      });
      const editData = await editRes.json();
      
      if (editData.editedFloorPlan) {
        setCurrentFloorPlan(editData.editedFloorPlan);
        setPrompt('');
        clearInpaint();
        setFloorPlanRedoStack([]); // Clear redo stack on new edit
      } else {
        setError('Edit failed. Please try a different instruction.');
      }
    } catch (err) {
      setError('An error occurred while connecting to Groq. Please try again.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCurrentFloorPlan(base64);
        setPrompt('');
        setFloorPlanRedoStack([]);
        setOcrResult(null);
        runOCR(base64);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUndo = () => {
    if (floorPlanHistory && floorPlanHistory.length > 1) {
      const newHistory = [...floorPlanHistory];
      const poppedPlan = newHistory.pop(); // Remove current one
      if (poppedPlan) {
        setFloorPlanRedoStack(prev => [...prev, poppedPlan]);
      }
      const prevPlan = newHistory[newHistory.length - 1];
      replaceState({
        currentFloorPlan: prevPlan,
        floorPlanHistory: newHistory
      });
    }
  };

  const handleRedo = () => {
    if (floorPlanRedoStack.length > 0) {
      const newRedoStack = [...floorPlanRedoStack];
      const nextPlan = newRedoStack.pop();
      if (nextPlan) {
        setFloorPlanRedoStack(newRedoStack);
        const newHistory = [...floorPlanHistory, nextPlan];
        replaceState({
          currentFloorPlan: nextPlan,
          floorPlanHistory: newHistory
        });
      }
    }
  };

  const handleConvertToDxf = async () => {
    if (!currentFloorPlan) return;
    // Route to the dedicated pipeline page instead of showing a modal
    router.push('/png-to-dxf');
  };

  const downloadDxf = () => {
    if (!dxfBlob) return;
    const url = URL.createObjectURL(dxfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (projectName || 'floorplan') + '.dxf';
    a.click();
    URL.revokeObjectURL(url);
    setDxfPhase('idle');
  };

  return (
    <main className="flex flex-col w-full h-screen bg-[#0a0a0f] text-cyan-500 font-mono overflow-hidden relative">
      <CinematicIntro 
        videoPath="/stage videos/Chapter 2 - 'THE TRANSFORMATION INTO ARCHITECTURE'.mp4" 
        title="Chapter 2 - THE TRANSFORMATION INTO ARCHITECTURE" 
      />

      {/* Subtle animated background gradient */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0" />

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-[#1e1810] bg-[#0f0f18]/80 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              if (sessionId) {
                useArchitectStore.setState({ phase: 'search' });
                router.push(`/workspace/${sessionId}`);
              } else {
                router.push('/');
              }
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all group"
          >
            <ArrowLeft className="text-cyan-500/70 group-hover:text-cyan-400" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              Edit Matrix
            </h1>
            <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase">
              {projectName ? `Project: ${projectName} (${placeName || 'Unknown Location'})` : 'Powered by Groq Vision'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 font-bold rounded transition-colors"
          >
            <UploadCloud size={14} /> Upload Plan
          </button>

          {currentFloorPlan && (
            <button 
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 font-bold rounded transition-colors"
            >
              <Folder size={14} /> Save to Project
            </button>
          )}

          {sessionId && (
            <button 
              onClick={() => router.push('/3d-render')}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-cyan-600/80 border border-cyan-400 text-white hover:bg-cyan-500 font-bold rounded shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all animate-pulse"
            >
              <Box size={14} /> Head to 3D Render Section
            </button>
          )}

          <button 
            onClick={() => setShowSelector(true)}
            className="px-4 py-2 text-[10px] uppercase tracking-widest border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
          >
            Switch Project
          </button>
          
          {/* Undo / Redo Control Group */}
          <div className="flex items-center gap-0.5 border border-[#c8a84b]/30 rounded overflow-hidden bg-[#12100a]">
            <button
              onClick={handleUndo}
              disabled={!floorPlanHistory || floorPlanHistory.length <= 1}
              title="Undo last edit (Ctrl+Z)"
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest font-bold transition-all
                disabled:text-gray-600 disabled:cursor-not-allowed disabled:bg-transparent
                enabled:text-[#c8a84b] enabled:hover:bg-[#c8a84b]/10"
            >
              <Undo2 size={13} />
              <span>Undo</span>
            </button>
            <div className="w-px h-5 bg-[#c8a84b]/20" />
            <button
              onClick={handleRedo}
              disabled={floorPlanRedoStack.length === 0}
              title="Redo last undone edit (Ctrl+Shift+Z)"
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-widest font-bold transition-all
                disabled:text-gray-600 disabled:cursor-not-allowed disabled:bg-transparent
                enabled:text-[#c8a84b] enabled:hover:bg-[#c8a84b]/10"
            >
              <Undo2 size={13} className="scale-x-[-1]" />
              <span>Redo</span>
            </button>
          </div>

          {currentFloorPlan && (
            <>
              <button 
                onClick={() => {
                  setIsInpaintMode(!isInpaintMode);
                  if (!isInpaintMode) {
                    setIsTextMode(false);
                    setBrushMode('brush');
                  } else {
                    clearInpaint();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest border rounded transition-colors ${isInpaintMode ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400' : 'border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10'}`}
              >
                <Brush size={14} /> {isInpaintMode ? 'Exit Target Mode' : 'Target Room (Green Dot)'}
              </button>

              {isInpaintMode && (
                <>
                  <div className="flex items-center gap-1 border border-cyan-500/30 rounded p-1 bg-[#0a0a0f]">
                    <button 
                      onClick={() => setBrushMode('brush')}
                      className={`p-1.5 rounded ${brushMode === 'brush' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-cyan-400'}`}
                      title="Brush Tool"
                    >
                      <Brush size={14} />
                    </button>
                    <button 
                      onClick={() => setBrushMode('eraser')}
                      className={`p-1.5 rounded ${brushMode === 'eraser' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-cyan-400'}`}
                      title="Eraser Tool"
                    >
                      <Eraser size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 border border-cyan-500/30 rounded px-3 py-1 bg-[#0a0a0f]">
                    <span className="text-[10px] text-cyan-500/50 uppercase tracking-widest font-bold">Size:</span>
                    <input 
                      type="range" 
                      min="10" max="80" 
                      value={brushSize} 
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-20 accent-cyan-400"
                    />
                  </div>
                </>
              )}
              {isInpaintMode && (hasInpaint || strokeRedoHistory.length > 0) && (
                <>
                  {hasInpaint && (
                    <button 
                      onClick={undoStroke}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                    >
                      <Undo2 size={14} /> Undo
                    </button>
                  )}
                  {strokeRedoHistory.length > 0 && (
                    <button 
                      onClick={redoStroke}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest border border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
                    >
                      <Undo2 size={14} /> Redo
                    </button>
                  )}
                  {hasInpaint && (
                    <button 
                      onClick={clearInpaint}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Eraser size={14} /> Clear
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 overflow-hidden">
        
        {/* Left Side: Canvas / Image Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          {currentFloorPlan ? (
            <div className="relative max-w-full max-h-[70vh] bg-white rounded-xl shadow-2xl overflow-hidden border-2 border-cyan-500/20 group">
              <img 
                ref={imgRef}
                crossOrigin="anonymous"
                src={currentFloorPlan.startsWith('data:image/') ? currentFloorPlan : `data:image/jpeg;base64,${currentFloorPlan}`} 
                alt="Current Floor Plan" 
                className={`max-w-full max-h-[70vh] w-auto h-auto block transition-opacity duration-300 ${isEditing ? 'opacity-50 blur-sm' : 'opacity-100'} ${isInpaintMode ? 'pointer-events-none' : ''}`}
                onLoad={() => {
                  if (imgRef.current && canvasRef.current) {
                    canvasRef.current.width = imgRef.current.clientWidth;
                    canvasRef.current.height = imgRef.current.clientHeight;
                  }
                }}
              />
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseOut={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className={`absolute top-0 left-0 w-full h-full z-10 touch-none ${(!isInpaintMode && !isTextMode && !isRoomPickerMode) ? 'hidden' : (isTextMode ? 'cursor-text' : 'cursor-crosshair')}`}
              />
              {isEditing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]/60 backdrop-blur-sm z-20">
                  <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                  <p className="text-cyan-400 font-mono tracking-[2px] uppercase text-sm animate-pulse">
                    Grok is analyzing & editing...
                  </p>
                </div>
              )}
              {textInput.active && (
                <div
                  className="absolute z-30"
                  style={{ top: textInput.y, left: textInput.x }}
                >
                  <div className="absolute flex items-center justify-center" style={{ transform: 'translate(-50%, -50%)' }}>
                    <div className="relative group">
                      {/* Canva-style Drag Handle */}
                      <div 
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTextDrag({ isDragging: true, startX: e.clientX, startY: e.clientY, initialInputX: textInput.x, initialInputY: textInput.y });
                        }}
                        className="absolute -top-10 left-1/2 -translate-x-1/2 bg-cyan-500 text-black px-3 py-1 rounded-full shadow-lg cursor-move opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-bold text-xs whitespace-nowrap"
                        title="Drag to move"
                      >
                        <Move size={14} /> DRAG
                      </div>

                      <input
                        autoFocus
                        type="text"
                        value={textInput.text}
                        onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') burnTextToImage(false);
                          if (e.key === 'Escape') setTextInput({ active: false, x: 0, y: 0, text: '' });
                        }}
                        placeholder="Type here..."
                        className="bg-transparent text-black placeholder:text-gray-500/50 font-bold outline-none border-2 border-dashed border-cyan-500/50 focus:border-cyan-500 hover:border-cyan-500 text-center transition-colors px-2 py-1"
                        style={{ 
                          fontSize: `${brushSize}px`, 
                          width: `${Math.max(150, textInput.text.length * (brushSize * 0.6) + 40)}px` 
                        }}
                      />

                      {/* Canva-style Floating Controls */}
                      <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#0a0a0f]/90 p-2 rounded-xl shadow-2xl border border-cyan-500/30 backdrop-blur-md whitespace-nowrap">
                        <button 
                          onClick={() => setBrushSize(prev => Math.max(prev - 5, 10))}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Decrease Size"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="text-cyan-400 font-mono font-bold text-xs w-8 text-center">{brushSize}</span>
                        <button 
                          onClick={() => setBrushSize(prev => Math.min(prev + 5, 200))}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Increase Size"
                        >
                          <Plus size={16} />
                        </button>
                        
                        <div className="w-px h-6 bg-gray-700 mx-1" />
                        
                        <button 
                          onClick={() => burnTextToImage(false)}
                          className="flex items-center gap-1 bg-cyan-500 text-black font-bold px-3 py-1.5 rounded-lg hover:bg-cyan-400 transition-colors text-xs uppercase tracking-wider"
                        >
                          <Check size={14} /> Apply
                        </button>
                        <button 
                          onClick={() => setTextInput({ active: false, x: 0, y: 0, text: '' })}
                          className="flex items-center gap-1 bg-red-500 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-red-400 transition-colors text-xs uppercase tracking-wider"
                        >
                          <X size={14} /> Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Room Picker Overlay */}
              {isRoomPickerMode && !showRoomNamePopup && (
                <div
                  className="absolute inset-0 z-40 cursor-crosshair"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    // Need canvas to be sized — ensure it matches the image
                    if (canvasRef.current && imgRef.current) {
                      canvasRef.current.width = imgRef.current.clientWidth;
                      canvasRef.current.height = imgRef.current.clientHeight;
                    }
                    floodFillRoom(x, y);
                    setPickedRoomPreview({ x, y });
                    setShowRoomNamePopup(true);
                    setPickedRoomName('');
                  }}
                >
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-500 text-white font-bold text-sm px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 whitespace-nowrap z-50">
                    <MousePointerClick size={16} />
                    Click anywhere inside a room to select it
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsRoomPickerMode(false); clearInpaint(); }}
                    className="absolute top-4 right-4 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold z-50 hover:bg-red-400"
                  >✕</button>
                </div>
              )}

              {/* Room Name Popup */}
              {showRoomNamePopup && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="bg-[#0f0f18] border border-purple-500/50 rounded-2xl p-8 shadow-2xl flex flex-col gap-5 min-w-[340px]">
                    <div className="flex items-center gap-3">
                      <MousePointerClick size={22} className="text-purple-400" />
                      <h3 className="text-white font-bold text-lg tracking-widest uppercase">Room Selected</h3>
                    </div>
                    <p className="text-gray-400 text-sm">Room highlighted in green. What is this room?</p>
                    <input
                      autoFocus
                      type="text"
                      placeholder="e.g. Kitchen, Master Bedroom..."
                      value={pickedRoomName}
                      onChange={(e) => setPickedRoomName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && pickedRoomName.trim()) {
                          setPrompt(`Edit the ${pickedRoomName.trim()}: `);
                          setIsInpaintMode(true);
                          setIsRoomPickerMode(false);
                          setShowRoomNamePopup(false);
                          setPickedRoomPreview(null);
                        }
                        if (e.key === 'Escape') {
                          setShowRoomNamePopup(false);
                          setIsRoomPickerMode(false);
                          clearInpaint();
                        }
                      }}
                      className="bg-[#0a0a0f] border border-purple-500/40 text-white px-4 py-3 rounded-lg font-mono outline-none focus:border-purple-400 text-base"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (!pickedRoomName.trim()) return;
                          setPrompt(`Edit the ${pickedRoomName.trim()}: `);
                          setIsInpaintMode(true);
                          setIsRoomPickerMode(false);
                          setShowRoomNamePopup(false);
                          setPickedRoomPreview(null);
                        }}
                        className="flex-1 bg-purple-500 text-white font-bold py-2 rounded-lg hover:bg-purple-400 flex items-center justify-center gap-2"
                      >
                        <Check size={16} /> Confirm & Edit This Room
                      </button>
                      <button
                        onClick={() => {
                          setShowRoomNamePopup(false);
                          setIsRoomPickerMode(true);
                          clearInpaint();
                        }}
                        className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 text-sm"
                      >Re-pick</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scale Calibration Overlay */}
              {calibStep !== 'idle' && calibStep !== 'input' && (
                <div
                  className="absolute inset-0 z-40 cursor-crosshair"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    if (calibStep === 'point1') {
                      setCalibPoints([{ x, y }]);
                      setCalibStep('point2');
                    } else if (calibStep === 'point2') {
                      setCalibPoints(prev => [...prev, { x, y }]);
                      setCalibStep('input');
                    }
                  }}
                >
                  {/* Instruction Banner */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-bold text-sm px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 whitespace-nowrap z-50">
                    <Ruler size={16} />
                    {calibStep === 'point1' ? 'Click Point A on a known wall or distance' : 'Click Point B on the other end of that wall'}
                  </div>
                  {/* Cancel */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setCalibStep('idle'); setCalibPoints([]); }}
                    className="absolute top-4 right-4 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold z-50 hover:bg-red-400"
                  >✕</button>
                  {/* Point A dot */}
                  {calibPoints[0] && (
                    <div
                      className="absolute w-4 h-4 bg-yellow-400 border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg z-50"
                      style={{ left: calibPoints[0].x, top: calibPoints[0].y }}
                    />
                  )}
                  {/* Line between points */}
                  {calibPoints.length === 2 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-40">
                      <line
                        x1={calibPoints[0].x} y1={calibPoints[0].y}
                        x2={calibPoints[1].x} y2={calibPoints[1].y}
                        stroke="#EAB308" strokeWidth="2" strokeDasharray="6,3"
                      />
                    </svg>
                  )}
                </div>
              )}

              {/* Calibration Distance Input Modal */}
              {calibStep === 'input' && calibPoints.length === 2 && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="bg-[#0f0f18] border border-yellow-500/50 rounded-2xl p-8 shadow-2xl flex flex-col gap-5 min-w-[320px]">
                    <div className="flex items-center gap-3">
                      <Ruler size={22} className="text-yellow-400" />
                      <h3 className="text-white font-bold text-lg tracking-widest uppercase">Calibrate Scale</h3>
                    </div>
                    <p className="text-gray-400 text-sm">
                      You selected a line of <span className="text-yellow-400 font-bold">{Math.round(Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y))}px</span>.
                      What is the real-world distance?
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        autoFocus
                        type="number"
                        min="0.1"
                        placeholder="e.g. 20"
                        value={calibDistInput}
                        onChange={(e) => setCalibDistInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && calibDistInput) {
                            const dist = parseFloat(calibDistInput);
                            const pxDist = Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y);
                            const pxPerUnit = pxDist / dist;
                            setCalibScale(calibUnit === 'ft'
                              ? { pxPerFt: pxPerUnit, pxPerM: pxPerUnit * 3.28084 }
                              : { pxPerFt: pxPerUnit / 3.28084, pxPerM: pxPerUnit }
                            );
                            setCalibStep('idle');
                            setCalibPoints([]);
                          }
                        }}
                        className="flex-1 bg-[#0a0a0f] border border-yellow-500/40 text-white px-4 py-2 rounded-lg font-mono text-lg outline-none focus:border-yellow-400"
                      />
                      <button
                        onClick={() => setCalibUnit(calibUnit === 'ft' ? 'm' : 'ft')}
                        className="px-4 py-2 bg-yellow-500/20 border border-yellow-400 text-yellow-400 rounded-lg font-bold hover:bg-yellow-500/30"
                      >{calibUnit}</button>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          if (!calibDistInput) return;
                          const dist = parseFloat(calibDistInput);
                          const pxDist = Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y);
                          const pxPerUnit = pxDist / dist;
                          setCalibScale(calibUnit === 'ft'
                            ? { pxPerFt: pxPerUnit, pxPerM: pxPerUnit * 3.28084 }
                            : { pxPerFt: pxPerUnit / 3.28084, pxPerM: pxPerUnit }
                          );
                          setCalibStep('idle');
                          setCalibPoints([]);
                        }}
                        className="flex-1 bg-yellow-500 text-black font-bold py-2 rounded-lg hover:bg-yellow-400 flex items-center justify-center gap-2"
                      >
                        <Check size={16} /> Apply Scale
                      </button>
                      <button
                        onClick={() => { setCalibStep('idle'); setCalibPoints([]); }}
                        className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/30"
                      >Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scale Badge */}
              {calibScale && calibStep === 'idle' && (
                <div className="absolute bottom-3 left-3 z-30 bg-[#0a0a0f]/90 border border-yellow-400/50 rounded-xl px-4 py-2 flex items-center gap-3 shadow-lg backdrop-blur-md">
                  <Ruler size={14} className="text-yellow-400" />
                  <div>
                    <div className="text-yellow-400 font-bold text-xs tracking-widest uppercase">Scale Calibrated</div>
                    <div className="text-white font-mono text-xs">1 ft = {calibScale.pxPerFt.toFixed(1)}px &nbsp;|&nbsp; 1 m = {calibScale.pxPerM.toFixed(1)}px</div>
                  </div>
                  <button onClick={() => setCalibScale(null)} className="text-gray-500 hover:text-red-400 ml-2 text-xs">✕</button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-cyan-500/40 p-12 border-2 border-dashed border-cyan-500/20 rounded-xl bg-[#0f0f18]/30">
              <UploadCloud size={64} className="mb-6 opacity-50 text-cyan-500" />
              <h2 className="text-xl tracking-[4px] font-bold text-white uppercase mb-2">Upload Floor Plan</h2>
              <p className="text-cyan-500/60 tracking-[2px] text-xs uppercase max-w-md text-center mb-8">
                Upload a 2D floor plan image to initialize the Grok editing sequence.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-8 py-4 bg-cyan-500/10 border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-[#0a0a0f] uppercase tracking-widest font-bold transition-all"
              >
                <UploadCloud size={18} /> Select Image
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Command Prompt */}
        <div className="w-[400px] border-l border-[#1e1810] bg-[#0f0f18]/90 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-[#1e1810]">
            <h2 className="text-sm tracking-[3px] text-cyan-400 font-bold uppercase flex items-center gap-2">
              <PenTool size={14} /> Modification Protocols
            </h2>
            <p className="text-[10px] tracking-wide text-cyan-500/60 mt-2 leading-relaxed">
              Instruct the Groq Vision model to modify specific elements of your floor plan. E.g., "Add a pool to the backyard" or "Expand the master bedroom."
            </p>
          </div>

          {/* Plan Intelligence Panel */}
          {(isOcrLoading || ocrResult || ocrError) && (
            <div className="border-b border-[#1e1810] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] tracking-[2px] text-purple-400 font-bold uppercase flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                  Plan Intelligence
                </h3>
                {isOcrLoading && <span className="text-[9px] text-purple-400 animate-pulse tracking-wider">Scanning plan...</span>}
                {ocrResult && !isOcrLoading && (
                  <button onClick={() => runOCR(currentFloorPlan!)} className="text-[9px] text-purple-400/60 hover:text-purple-400 uppercase tracking-wider">Re-scan</button>
                )}
              </div>

              {isOcrLoading && (
                <div className="flex items-center gap-3 py-4">
                  <Loader2 size={16} className="text-purple-400 animate-spin flex-shrink-0" />
                  <p className="text-[10px] text-gray-400 tracking-wide">Gemini Vision is reading your plan's room labels and dimensions...</p>
                </div>
              )}

              {ocrError && !isOcrLoading && (
                <p className="text-[10px] text-red-400 tracking-wide">{ocrError}</p>
              )}

              {ocrResult && !isOcrLoading && (
                <div className="flex flex-col gap-2">
                  {/* Summary row */}
                  <div className="flex flex-wrap gap-2 mb-1">
                    {ocrResult.bhkType && (
                      <span className="px-2 py-1 bg-purple-500/20 border border-purple-400/30 rounded text-[9px] text-purple-300 font-bold tracking-widest uppercase">{ocrResult.bhkType}</span>
                    )}
                    {ocrResult.totalAreaSqft && (
                      <span className="px-2 py-1 bg-purple-500/10 border border-purple-400/20 rounded text-[9px] text-purple-300 tracking-widest uppercase">Total: {ocrResult.totalAreaSqft} sqft</span>
                    )}
                    <span className={`px-2 py-1 rounded text-[9px] tracking-widest uppercase border ${ocrResult.confidence === 'high' ? 'bg-green-500/10 border-green-400/30 text-green-400' : ocrResult.confidence === 'medium' ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-400' : 'bg-red-500/10 border-red-400/30 text-red-400'}`}>
                      {ocrResult.confidence} confidence
                    </span>
                  </div>

                  {/* Room list — click to select */}
                  <p className="text-[9px] text-gray-500 tracking-wide mb-1 uppercase">Click a room to target it:</p>
                  <div className="flex flex-col gap-1 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                    {ocrResult.rooms?.map((room, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setIsRoomPickerMode(true);
                          setIsInpaintMode(false);
                          setIsTextMode(false);
                          setCalibStep('idle');
                          clearInpaint();
                          // Pre-fill room name and jump straight to name popup
                          setPickedRoomName(room.name);
                          setShowRoomNamePopup(false);
                          // Set prompt directly
                          setPrompt(`Edit the ${room.name}: `);
                          setIsRoomPickerMode(false);
                          // Activate inpaint so user can paint the room
                          setIsInpaintMode(true);
                        }}
                        className="flex items-center justify-between px-3 py-2 rounded bg-[#0a0a0f] hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 text-left transition-all group"
                      >
                        <div>
                          <span className="text-[10px] text-white font-medium group-hover:text-purple-300 transition-colors">{room.label || room.name}</span>
                          {room.dimensions && <span className="text-[9px] text-gray-500 ml-2">{room.dimensions}</span>}
                        </div>
                        {room.areaSqft ? (
                          <span className="text-[9px] text-purple-400 font-mono">{room.areaSqft} sqft</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 p-6 flex flex-col justify-end">
            {error && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wide rounded">
                ⚠️ {error}
              </div>
            )}
            
            <form onSubmit={handleEdit} className="relative flex flex-col gap-3">
              {isInpaintMode ? (
                <div className="flex flex-col gap-2 p-4 bg-[#0a0a0f] border-2 border-green-500/40 rounded shadow-[0_0_15px_rgba(34,197,94,0.1)] pr-16 relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-green-400 uppercase tracking-widest text-xs font-bold whitespace-nowrap">Targeted Inpaint Edit</span>
                    <span className="text-[9px] text-green-500/60 tracking-wider uppercase bg-green-500/10 px-2 py-0.5 rounded">Green Dot Active</span>
                  </div>
                  <input 
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.G. 'INCREASE VERTICAL HEIGHT BY 2X'"
                    disabled={isEditing || !currentFloorPlan}
                    className="w-full bg-transparent border-b border-green-500/30 focus:border-green-400 text-sm text-white placeholder-green-500/20 focus:outline-none py-2 uppercase tracking-wide disabled:opacity-50"
                  />
                  <span className="text-[9px] text-green-500/40 tracking-wider uppercase">
                    The highlighted green region will be replaced. Enter your structural instruction above.
                  </span>
                  <button 
                    type="submit"
                    disabled={isEditing || !currentFloorPlan || !prompt.trim()}
                    className="absolute top-1/2 -translate-y-1/2 right-4 bg-green-500/20 hover:bg-green-500/40 text-green-400 p-2 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isEditing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 p-4 bg-[#0a0a0f] border border-cyan-500/30 rounded pr-16 relative">
                  <span className="text-cyan-400 uppercase tracking-widest text-xs font-bold whitespace-nowrap mb-1">Global Architectural Edit</span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.G. 'MOVE THE KITCHEN WALL 1.5 METERS TOWARD THE LIVING ROOM'"
                    disabled={isEditing || !currentFloorPlan}
                    className="w-full h-24 bg-transparent border border-cyan-500/20 focus:border-cyan-400 rounded p-3 text-xs text-white placeholder-cyan-500/30 focus:outline-none resize-none custom-scrollbar transition-all uppercase tracking-wide disabled:opacity-50"
                  />
                  <span className="text-[9px] text-cyan-500/40 tracking-wider uppercase">
                    No target selected. The entire floor plan structure will be analyzed.
                  </span>
                  <button 
                    type="submit"
                    disabled={isEditing || !currentFloorPlan || !prompt.trim()}
                    className="absolute bottom-6 right-6 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 p-2 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isEditing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </main>

      {/* Success alert toast */}
      {saveSuccessMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-[#0f0f18] border border-cyan-500 rounded-lg px-6 py-3 text-cyan-400 uppercase tracking-widest text-xs font-bold shadow-[0_0_30px_rgba(6,182,212,0.25)] animate-bounce">
          ✓ Saved to project: {saveSuccessMsg}
        </div>
      )}


      {/* Selector view insertion */}
      {showSelector && (
        <div className="fixed inset-0 z-40 bg-[#0a0a0f] text-cyan-400 overflow-y-auto">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0 fixed" />
          
          <header className="relative z-10 max-w-7xl mx-auto flex items-center justify-between p-8 border-b border-cyan-500/20">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => router.push('/')}
                className="flex items-center justify-center w-10 h-10 rounded-full border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all group"
              >
                <ArrowLeft className="text-cyan-500/70 group-hover:text-cyan-400" size={18} />
              </button>
              <div>
                <h1 className="text-2xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
                  Edit Project Matrix
                </h1>
                <span className="text-xs tracking-[3px] text-cyan-500/60 uppercase">
                  Select a project to apply modifications
                </span>
              </div>
            </div>
            
            <div className="flex gap-4">
              {sessionId && (
                <button 
                  onClick={() => setShowSelector(false)}
                  className="px-6 py-3 border border-cyan-500/50 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 font-bold uppercase tracking-widest rounded-lg text-xs transition-colors"
                >
                  Resume Current Project
                </button>
              )}
              <button 
                onClick={() => setIsNewProjectModalOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-black hover:bg-cyan-400 font-bold uppercase tracking-widest rounded-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
              >
                <Plus size={18} /> Initialize Project
              </button>
            </div>
          </header>

          <main className="relative z-10 max-w-7xl mx-auto p-8">
            <div className="relative max-w-md mb-8">
              <Search className="absolute left-3 top-3 text-cyan-500/50 w-5 h-5" />
              <input 
                type="text"
                placeholder="SEARCH PROJECT ARCHIVES..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0f0f18] border border-cyan-500/30 rounded pl-11 pr-4 py-3 text-white focus:outline-none focus:border-cyan-400 transition-colors uppercase font-mono tracking-wider text-sm"
              />
            </div>

            {loadingProjects ? (
              <div className="flex flex-col items-center justify-center py-32 opacity-50">
                 <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
                 <p className="tracking-widest uppercase">Querying secure node...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-cyan-500/20 rounded-xl bg-[#0f0f18]/50 backdrop-blur">
                <Folder size={64} className="text-cyan-500/30 mb-6" />
                <h2 className="text-xl tracking-widest uppercase text-white mb-2">No active projects found</h2>
                <p className="text-sm tracking-widest uppercase text-cyan-500/60 mb-8">Initialize a new project to begin editing</p>
                <button 
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="px-8 py-3 bg-transparent border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-black font-bold uppercase tracking-widest transition-all"
                >
                  Create Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {projects.filter(p => {
                  const name = (p.state?.projectName || 'Untitled Project').toLowerCase();
                  const place = (p.state?.placeName || '').toLowerCase();
                  return name.includes(searchQuery.toLowerCase()) || place.includes(searchQuery.toLowerCase());
                }).map((proj) => {
                  const name = proj.state?.projectName || 'Untitled Project';
                  const place = proj.state?.placeName || 'Unknown Location';
                  const thumb = proj.state?.currentFloorPlan || proj.state?.finalRender;
                  const date = new Date(proj.updated_at).toLocaleDateString();

                  return (
                    <div 
                      key={proj.session_id}
                      onClick={() => {
                        switchSession(proj.session_id, name, place);
                        setShowSelector(false);
                      }}
                      className="group bg-[#0f0f18]/80 backdrop-blur border border-cyan-500/20 hover:border-cyan-400 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 shadow-lg hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] flex flex-col"
                    >
                      <div className="relative aspect-video bg-[#0a0a0f] flex items-center justify-center border-b border-cyan-500/10 overflow-hidden">
                        {thumb ? (
                          <img 
                            src={thumb.startsWith('data:image/') ? thumb : `data:image/jpeg;base64,${thumb}`} 
                            alt={name} 
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                          />
                        ) : (
                          <Map size={48} className="text-cyan-500/20" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f18] to-transparent opacity-80" />
                        
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ok = window.confirm("Are you sure you want to delete this project?");
                            if (!ok) return;
                            try {
                              const { error } = await supabase.from('edit_projects').delete().eq('session_id', proj.session_id);
                              if (error) throw error;
                              setProjects(prev => prev.filter(p => p.session_id !== proj.session_id));
                              if (sessionId === proj.session_id) {
                                replaceState({ sessionId: null, projectName: null, placeName: null });
                                localStorage.removeItem('architect_session_id');
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="absolute top-3 right-3 z-20 flex items-center justify-center w-8 h-8 rounded-full border border-red-500/30 bg-[#0a0a0f]/80 text-red-500/70 hover:text-red-500 hover:border-red-500 hover:bg-red-500/10 transition-all shadow-md cursor-pointer"
                          title="Delete Project"
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] text-cyan-400 font-bold tracking-widest uppercase bg-[#0a0a0f]/80 px-2 py-1 rounded backdrop-blur">
                          <Clock size={12} /> {date}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 group-hover:text-cyan-400 transition-colors">{name}</h3>
                          <p className="flex items-center gap-2 text-xs text-cyan-500/60 tracking-widest uppercase">
                            <MapPin size={12} /> {place}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Create Project Modal */}
      {isNewProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-sm">
          <div className="bg-[#0f0f18] border border-cyan-500/30 rounded-xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(6,182,212,0.15)] relative">
            <h2 className="text-xl font-bold uppercase tracking-[3px] text-white mb-6">Initialize Edit Project</h2>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newProjectName.trim()) return;
              const newSessionId = uuidv4();
              switchSession(newSessionId, newProjectName, newPlaceName);
              
              // Save empty structure to supabase
              await supabase.from('edit_projects').insert({
                session_id: newSessionId,
                state: {
                  projectName: newProjectName,
                  placeName: newPlaceName,
                  phase: 'edit'
                }
              });
              
              setShowSelector(false);
              setIsNewProjectModalOpen(false);
            }} className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-widest text-cyan-400/80 mb-2">Project Designation (Name)</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="E.g. Wayne Manor Redesign"
                  className="w-full bg-[#0a0a0f] border border-cyan-500/30 rounded p-3 text-white focus:outline-none focus:border-cyan-400 transition-colors uppercase tracking-wider text-xs font-mono"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs uppercase tracking-widest text-cyan-400/80 mb-2">Geographic Location</label>
                <input 
                  type="text" 
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                  placeholder="E.g. Gotham City"
                  className="w-full bg-[#0a0a0f] border border-cyan-500/30 rounded p-3 text-white focus:outline-none focus:border-cyan-400 transition-colors uppercase tracking-wider text-xs font-mono"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="flex-1 py-3 border border-cyan-500/50 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 uppercase tracking-widest font-bold rounded text-xs transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="flex-1 py-3 bg-cyan-500 text-black hover:bg-cyan-400 uppercase tracking-widest font-bold rounded text-xs transition-colors disabled:opacity-50"
                >
                  Initialize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <SaveToProjectModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentImageBase64={currentFloorPlan}
        imageType="floorPlan"
        theme="cyan"
        tableName="edit_projects"
        onSaveSuccess={(name) => {
          setSaveSuccessMsg(name);
          setTimeout(() => setSaveSuccessMsg(null), 3000);
        }}
      />

      {/* ─── DXF Conversion Modal ─── */}
      {dxfPhase !== 'idle' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative bg-[#0f0f18] border border-[#00f0ff]/30 rounded-2xl shadow-[0_0_60px_rgba(0,240,255,0.15)] w-full max-w-3xl mx-4 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#00f0ff]/10">
              <div>
                <h2 className="text-[#00f0ff] font-bold uppercase tracking-[4px] text-sm">CAD Conversion Pipeline</h2>
                <p className="text-[10px] text-[#00f0ff]/40 tracking-[2px] uppercase mt-0.5">
                  {dxfPhase === 'tracing' ? 'Running Local Potrace Engine...' :
                   dxfPhase === 'preview' ? 'Vector trace complete. Review before downloading.' :
                   'Conversion failed.'}
                </p>
              </div>
              <button onClick={() => setDxfPhase('idle')} className="text-[#00f0ff]/40 hover:text-[#00f0ff] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-6">
              {dxfPhase === 'tracing' && (
                <div className="flex flex-col items-center justify-center gap-6 py-16">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-[#00f0ff]/20 rounded-full" />
                    <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-[#00f0ff] rounded-full animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-[#00f0ff] text-sm font-bold tracking-[3px] uppercase mb-1">Vectorizing</p>
                    <p className="text-[#00f0ff]/40 text-[10px] tracking-widest uppercase">Upscaling → Tracing edges → Generating DXF</p>
                  </div>
                </div>
              )}

              {dxfPhase === 'preview' && dxfSvg && (
                <div className="flex flex-col gap-4">
                  <p className="text-[10px] text-[#00f0ff]/50 uppercase tracking-[3px]">Vector Preview — White Canvas</p>
                  <div
                    className="w-full bg-white rounded-lg border border-[#00f0ff]/10 flex items-center justify-center overflow-auto"
                    style={{ maxHeight: '55vh' }}
                    dangerouslySetInnerHTML={{ __html: dxfSvg }}
                  />
                </div>
              )}

              {dxfPhase === 'error' && (
                <div className="flex flex-col items-center justify-center gap-4 py-12">
                  <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                    <X size={24} className="text-red-400" />
                  </div>
                  <p className="text-red-400 text-sm font-bold tracking-widest uppercase">Conversion Failed</p>
                  <p className="text-red-400/60 text-xs text-center max-w-xs">{dxfError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-[#00f0ff]/10">
              <button
                onClick={() => setDxfPhase('idle')}
                className="px-5 py-2.5 border border-[#00f0ff]/30 text-[#00f0ff]/60 hover:text-[#00f0ff] hover:border-[#00f0ff]/60 uppercase tracking-widest text-[10px] font-bold rounded transition-colors"
              >
                Cancel
              </button>
              {dxfPhase === 'preview' && (
                <button
                  onClick={downloadDxf}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#00f0ff] text-black font-bold uppercase tracking-widest text-[10px] rounded hover:bg-[#00d4e8] transition-colors shadow-[0_0_20px_rgba(0,240,255,0.3)]"
                >
                  <Check size={14} /> Looks Good — Download DXF
                </button>
              )}
              {dxfPhase === 'error' && (
                <button
                  onClick={handleConvertToDxf}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#00f0ff]/20 text-[#00f0ff] border border-[#00f0ff]/40 font-bold uppercase tracking-widest text-[10px] rounded hover:bg-[#00f0ff]/30 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
