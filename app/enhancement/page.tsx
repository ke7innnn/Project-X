'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ChevronLeft, Loader2, Sparkles, Download, RefreshCw, ZoomIn, ZoomOut, Check } from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';

type Step = 'upload' | 'processing' | 'done' | 'error';

export default function EnhancementPage() {
  const router = useRouter();
  const { currentFloorPlan, setCurrentFloorPlan } = useArchitectStore();

  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [enhancedBase64, setEnhancedBase64] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('last_used_tool', 'enhancement');
  }, []);

  // Auto-load current floor plan from store if available
  useEffect(() => {
    if (currentFloorPlan && step === 'upload' && !originalPreviewUrl) {
      try {
        const raw = currentFloorPlan.includes(',') ? currentFloorPlan.split(',')[1] : currentFloorPlan;
        const binaryString = window.atob(raw);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const file = new File([blob], 'current_floorplan.jpg', { type: 'image/jpeg' });
        
        setOriginalFile(file);
        setOriginalPreviewUrl(currentFloorPlan.startsWith('data:image') ? currentFloorPlan : `data:image/jpeg;base64,${currentFloorPlan}`);
      } catch (e) {
        console.error('Failed to parse base64 floorplan from store', e);
      }
    }
  }, [currentFloorPlan, step, originalPreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const loadFile = (file: File) => {
    if (!file.type.match(/image\/(png|jpeg|jpg|webp)/)) {
      setErrorMsg('Please upload a PNG, JPG or WEBP image file.');
      setStep('error');
      return;
    }
    setOriginalFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setOriginalPreviewUrl(e.target.result as string);
        setEnhancedBase64(null);
        setStep('upload');
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerEnhance = async () => {
    if (!originalPreviewUrl) return;
    setIsEnhancing(true);
    setStep('processing');
    setErrorMsg('');

    try {
      const base64Data = originalPreviewUrl.replace(/^data:image\/\w+;base64,/, '');
      
      const res = await fetch('/api/enhance-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Enhancement failed' }));
        throw new Error(errJson.error || 'Server error during enhancement');
      }

      const { enhancedFloorPlan } = await res.json();
      setEnhancedBase64(`data:image/png;base64,${enhancedFloorPlan}`);
      
      // Update global store with the enhanced plan
      setCurrentFloorPlan(enhancedFloorPlan);

      setStep('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to enhance image. Please try again.');
      setStep('error');
    } finally {
      setIsEnhancing(false);
    }
  };

  const downloadEnhanced = () => {
    if (!enhancedBase64) return;
    const link = document.createElement('a');
    link.href = enhancedBase64;
    link.download = (originalFile?.name?.replace(/\.[^.]+$/, '') || 'floorplan') + '_enhanced.png';
    link.click();
  };

  const reset = () => {
    setStep('upload');
    setOriginalFile(null);
    setOriginalPreviewUrl(null);
    setEnhancedBase64(null);
    setErrorMsg('');
    setZoom(1);
  };

  // Slider controls
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSlider || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  return (
    <div 
      className="min-h-screen bg-[#0a0a0f] text-white font-mono flex flex-col relative"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {/* Glow lines */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00f0ff]/50 to-transparent" />

      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#00f0ff]/10 bg-[#0a0a0f]/90 backdrop-blur sticky top-0 z-20">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-[#00f0ff]/60 hover:text-[#00f0ff] transition-colors text-xs uppercase tracking-[3px]"
        >
          <ChevronLeft size={16} />
          Main Menu
        </button>
        <div className="text-center">
          <p className="text-[10px] text-[#00f0ff]/40 tracking-[4px] uppercase font-bold">GPT-Image-2 Studio</p>
          <h1 className="text-[13px] font-bold tracking-[6px] uppercase text-[#00f0ff] glow-text" style={{ fontFamily: 'Givonic, Syncopate, sans-serif' }}>
            Aesthetic Enhancement
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse" />
          <span className="text-[9px] text-[#00f0ff]/50 tracking-[2px] uppercase">
            FAL AI ENGINE
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Control Panel */}
        <div className="lg:w-[360px] shrink-0 border-r border-[#00f0ff]/10 flex flex-col bg-[#0b0b14]/50 backdrop-blur">
          {/* Upload Zone */}
          <div className="p-6 border-b border-[#00f0ff]/10">
            <h2 className="text-[10px] tracking-[3px] uppercase text-cyan-500/60 font-bold mb-4">Target Floor Plan</h2>
            
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 min-h-[160px] ${
                dragOver
                  ? 'border-[#00f0ff] bg-[#00f0ff]/5 scale-[1.01]'
                  : originalPreviewUrl
                  ? 'border-[#00f0ff]/30 bg-[#00f0ff]/2 hover:border-[#00f0ff]/60'
                  : 'border-cyan-500/20 bg-[#0d0d1a] hover:border-cyan-500/40 hover:bg-[#00f0ff]/3'
              }`}
            >
              {originalPreviewUrl ? (
                <div className="relative group">
                  <img
                    src={originalPreviewUrl}
                    alt="Floor plan preview"
                    className="max-h-32 max-w-full object-contain rounded border border-cyan-500/10"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                    <span className="text-[9px] tracking-widest text-[#00f0ff]">REPLACE IMAGE</span>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-cyan-500/50" />
                  <p className="text-[9px] tracking-widest text-center text-cyan-400">
                    DRAG & DROP OR CLICK TO UPLOAD
                  </p>
                  <p className="text-[8px] text-cyan-500/40">PNG, JPG, WEBP formats supported</p>
                </>
              )}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Enhancement Controls */}
          <div className="flex-1 p-6 flex flex-col gap-6">
            <div>
              <h2 className="text-[10px] tracking-[3px] uppercase text-cyan-500/60 font-bold mb-4">Enhancer Mode</h2>
              <div className="bg-[#07070f] border border-cyan-500/10 rounded-lg p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff] shrink-0 mt-0.5">
                    <Check size={12} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-white block">CAD Line Cleanup</span>
                    <span className="text-[9px] text-cyan-500/50 block mt-0.5">Straightens lines and optimizes wall thicknesses.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-cyan-500/10 pt-3">
                  <div className="w-5 h-5 rounded border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff] shrink-0 mt-0.5">
                    <Check size={12} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-white block">Visual Contrast Boost</span>
                    <span className="text-[9px] text-cyan-500/50 block mt-0.5">Applies master-level blueprint styling automatically.</span>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-t border-cyan-500/10 pt-3">
                  <div className="w-5 h-5 rounded border border-[#00f0ff]/30 flex items-center justify-center text-[#00f0ff] shrink-0 mt-0.5">
                    <Check size={12} />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-white block">Interior Preservation</span>
                    <span className="text-[9px] text-cyan-500/50 block mt-0.5">Keeps all room dimensions and furniture exactly as originally drawn.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3">
              {originalPreviewUrl && step === 'upload' && (
                <button
                  onClick={triggerEnhance}
                  disabled={isEnhancing}
                  className="w-full bg-[#00f0ff] hover:bg-[#00d2ff] text-black font-bold uppercase tracking-[2px] py-3 rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.3)] hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] transition-all"
                >
                  <Sparkles size={14} />
                  <span>Enhance Draft</span>
                </button>
              )}

              {step === 'done' && (
                <>
                  <button
                    onClick={downloadEnhanced}
                    className="w-full bg-cyan-950/30 hover:bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/30 hover:border-[#00f0ff] font-bold uppercase tracking-[2px] py-3 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <Download size={14} />
                    <span>Download PNG</span>
                  </button>
                  <button
                    onClick={reset}
                    className="w-full text-cyan-500/60 hover:text-cyan-400 text-[10px] tracking-[2px] uppercase py-2 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={10} />
                    Enhance Another
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Preview Zone */}
        <div className="flex-1 bg-[#05050a] flex flex-col relative overflow-hidden">
          {/* HUD bar */}
          <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
            <div className="bg-black/60 border border-cyan-500/10 backdrop-blur px-3 py-1.5 rounded flex items-center gap-4 text-[10px] text-cyan-400">
              {step === 'upload' && <span>DRAFT READY</span>}
              {step === 'processing' && (
                <span className="flex items-center gap-2 text-yellow-500 font-bold animate-pulse">
                  <Loader2 size={12} className="animate-spin" />
                  REFINING CAD GEOMETRY...
                </span>
              )}
              {step === 'done' && <span className="text-[#00f0ff] font-bold">⚡ ENHANCEMENT COMPLETE</span>}
              {step === 'error' && <span className="text-red-500 font-bold">ERROR OCCURRED</span>}
            </div>

            {originalPreviewUrl && step !== 'processing' && (
              <div className="bg-black/60 border border-cyan-500/10 backdrop-blur rounded flex items-center gap-1 p-1 pointer-events-auto">
                <button
                  onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                  className="w-7 h-7 flex items-center justify-center text-cyan-500/60 hover:text-[#00f0ff] transition-colors"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-[9px] text-cyan-400/80 w-10 text-center font-mono">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                  className="w-7 h-7 flex items-center justify-center text-cyan-500/60 hover:text-[#00f0ff] transition-colors"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Interactive Screen Center */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            {step === 'upload' && originalPreviewUrl && (
              <div 
                className="max-h-full max-w-full flex items-center justify-center transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              >
                <img
                  src={originalPreviewUrl}
                  alt="Draft plan"
                  className="max-h-[75vh] max-w-[80vw] object-contain rounded border border-cyan-500/20 shadow-[0_0_30px_rgba(0,240,255,0.05)]"
                />
              </div>
            )}

            {step === 'processing' && (
              <div className="flex flex-col items-center gap-4 max-w-xs text-center">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full animate-[spin_3s_linear_infinite]">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0, 240, 255, 0.1)" strokeWidth="3" />
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#00f0ff" strokeWidth="3" strokeDasharray="175.9" strokeDashoffset="100" />
                  </svg>
                  <Sparkles className="absolute text-[#00f0ff] animate-pulse" size={20} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-bold text-white tracking-[2px] uppercase">Processing Enhancement</h3>
                  <p className="text-[10px] text-cyan-500/60 leading-relaxed uppercase">
                    GPT-Image-2 is analyzing structural line weights and boosting drawing clarity. Please stand by...
                  </p>
                </div>
              </div>
            )}

            {step === 'done' && enhancedBase64 && originalPreviewUrl && (
              <div 
                ref={containerRef}
                onMouseMove={handleMouseMove}
                onMouseUp={() => setIsDraggingSlider(false)}
                onMouseLeave={() => setIsDraggingSlider(false)}
                onTouchMove={handleTouchMove}
                onTouchEnd={() => setIsDraggingSlider(false)}
                className="relative select-none cursor-ew-resize border border-cyan-500/20 rounded shadow-[0_0_40px_rgba(0,240,255,0.1)] overflow-hidden transition-transform duration-200"
                style={{ 
                  transform: `scale(${zoom})`,
                  width: 'min(700px, 85vw)',
                  aspectRatio: '16/10',
                  maxHeight: '70vh'
                }}
              >
                {/* Original (Left Background) */}
                <div className="absolute inset-0 bg-[#07070a]">
                  <img
                    src={originalPreviewUrl}
                    alt="Original Draft"
                    className="w-full h-full object-contain pointer-events-none"
                  />
                  <div className="absolute bottom-4 left-4 bg-black/60 border border-cyan-500/10 px-2 py-1 rounded text-[9px] text-cyan-400">
                    ORIGINAL DRAFT
                  </div>
                </div>

                {/* Enhanced (Right Overlay) */}
                <div 
                  className="absolute inset-y-0 right-0 overflow-hidden bg-[#07070a]"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <img
                    src={enhancedBase64}
                    alt="Enhanced Version"
                    className="absolute right-0 top-0 object-contain pointer-events-none"
                    style={{ 
                      width: containerRef.current?.getBoundingClientRect().width || '700px', 
                      height: '100%' 
                    }}
                  />
                  <div className="absolute bottom-4 right-4 bg-[#00f0ff]/10 border border-[#00f0ff] px-2 py-1 rounded text-[9px] text-[#00f0ff] font-bold">
                    ENHANCED CAD
                  </div>
                </div>

                {/* Slider Handle line */}
                <div 
                  className="absolute inset-y-0 w-1 bg-[#00f0ff] cursor-ew-resize flex items-center justify-center shadow-[0_0_10px_#00f0ff]"
                  style={{ left: `${sliderPosition}%` }}
                  onMouseDown={() => setIsDraggingSlider(true)}
                  onTouchStart={() => setIsDraggingSlider(true)}
                >
                  <div className="w-6 h-6 rounded-full bg-[#00f0ff] border border-black flex items-center justify-center text-black font-bold text-[9px] select-none shadow-[0_0_8px_#00f0ff]">
                    ↔
                  </div>
                </div>
              </div>
            )}

            {step === 'error' && (
              <div className="flex flex-col items-center gap-4 text-center max-w-xs">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-[2px] uppercase">Enhancement Failed</h3>
                  <p className="text-[10px] text-red-400/80 leading-relaxed uppercase mt-2">
                    {errorMsg}
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="px-4 py-2 border border-cyan-500/30 hover:border-cyan-400 text-cyan-400 hover:text-white uppercase tracking-wider text-[10px] rounded transition-all cursor-pointer mt-2"
                >
                  Go Back
                </button>
              </div>
            )}

            {step === 'upload' && !originalPreviewUrl && (
              <div className="text-center max-w-xs">
                <p className="text-[10px] text-cyan-500/40 uppercase tracking-[2px] leading-relaxed">
                  No floorplan loaded. Please upload a draft floorplan on the left panel or trace one in the edit matrix first to enhance.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
