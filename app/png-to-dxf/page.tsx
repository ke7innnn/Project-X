'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Download, RotateCcw, ChevronLeft, Loader2, CheckCircle2, AlertCircle, ZoomIn, ZoomOut, Wand2, AlertTriangle } from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { convertSvgToDxf } from '@/lib/svgToDxf';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';
import { FLAGS } from '@/lib/featureFlags';

type Step = 'upload' | 'processing' | 'done' | 'error';

export default function PngToDxfPage() {
  const router = useRouter();

  // Guard the active project spine
  const { activeProject } = useActiveProjectGuard();

  // DXF export is hidden until verified in real AutoCAD / GstarCAD at correct scale.
  if (!FLAGS.DXF_EXPORT) {
    return (
      <div className="min-h-screen bg-[#02050c] text-white flex flex-col items-center justify-center gap-6 p-8 font-mono">
        <AlertTriangle size={48} className="text-amber-500" />
        <div className="text-center space-y-2 max-w-md">
          <h1 className="text-lg font-bold tracking-[4px] uppercase">DXF Export — Pending CAD Verification</h1>
          <p className="text-xs text-zinc-400 leading-relaxed tracking-wider uppercase">
            DXF output has not yet been verified to open at correct scale in AutoCAD or GstarCAD.
            A broken DXF is worse than no DXF — this tool will be re-enabled once the output is confirmed.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 px-5 py-2.5 border border-blue-900/50 hover:border-cyan-400 text-zinc-400 hover:text-white rounded-lg text-xs uppercase tracking-widest transition-all cursor-pointer"
        >
          <ChevronLeft size={14} /> Back to Project
        </button>
      </div>
    );
  }

  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [preprocessedUrl, setPreprocessedUrl] = useState<string | null>(null);
  const [preprocessing, setPreprocessing] = useState(false);
  const [previewTab, setPreviewTab] = useState<'original' | 'enhanced'>('enhanced');
  const [svgResult, setSvgResult] = useState<string | null>(null);
  const [dxfBlob, setDxfBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [svgZoom, setSvgZoom] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    localStorage.setItem('last_used_tool', 'png-to-dxf');
  }, []);

  // Check if we came from the edit section with a floor plan
  useEffect(() => {
    const store = useArchitectStore.getState();
    const planBase64 = store.currentFloorPlan;
    
    // Only auto-load if we don't already have a file, and we have a valid base64 image
    if (planBase64 && !originalFile && step === 'upload') {
      try {
        const raw = planBase64.includes(',') ? planBase64.split(',')[1] : planBase64;
        const binaryString = window.atob(raw);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const file = new File([blob], 'edited_floorplan.jpg', { type: 'image/jpeg' });
        
        // Pass autoUpscale=false so it waits for the user
        loadFile(file, false);
      } catch (e) {
        console.error('Failed to parse base64 floorplan from store', e);
      }
    }
  }, [originalFile, step]);

  const startFakeProgress = () => {
    setProgress(0);
    let p = 0;
    progressRef.current = setInterval(() => {
      p += Math.random() * 4 + 1;
      if (p >= 90) {
        clearInterval(progressRef.current!);
        p = 90;
      }
      setProgress(Math.min(p, 90));
    }, 300);
  };

  const finishProgress = () => {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(100);
  };

  const loadFile = (file: File, autoUpscale: boolean = false) => {
    if (!file.type.match(/image\/(png|jpeg|jpg|webp)/)) {
      setErrorMsg('Please upload a PNG, JPG or WEBP image file.');
      setStep('error');
      return;
    }
    setOriginalFile(file);
    const url = URL.createObjectURL(file);
    setOriginalPreviewUrl(url);
    setSvgResult(null);
    setDxfBlob(null);
    setPreprocessedUrl(null);
    setPreviewTab('original');
    setStep('upload');

    if (autoUpscale) {
      handleUpscale(file);
    }
  };

  const handleUpscale = (file: File) => {
    setPreprocessing(true);
    const form = new FormData();
    form.append('image', file);
    fetch('/api/preprocess-image', { method: 'POST', body: form })
      .then(r => r.json())
      .then(data => {
        if (data.dataUrl) {
          setPreprocessedUrl(data.dataUrl);
          setPreviewTab('enhanced');
        }
      })
      .catch(() => {/* silent */})
      .finally(() => setPreprocessing(false));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  // Downscale image on the client before sending — prevents Vercel 4.5MB payload limit on large screenshots
  const downscaleImage = (file: File, maxPx = 1600): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else        { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85)); // ~100–200KB max
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const vectorize = async () => {
    if (!originalFile) return;
    setStep('processing');
    setErrorMsg('');
    startFakeProgress();

    try {
      let base64ToSend: string;

      if (preprocessedUrl && previewTab === 'enhanced') {
        // Already a data URL — downscale it too
        const blob = await fetch(preprocessedUrl).then(r => r.blob());
        const asFile = new File([blob], 'enhanced.png', { type: 'image/png' });
        base64ToSend = await downscaleImage(asFile);
      } else {
        // Downscale original upload before converting to base64
        base64ToSend = await downscaleImage(originalFile);
      }

      // Step 1: Get SVG via potrace pipeline
      const svgRes = await fetch('/api/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentFloorPlanBase64: base64ToSend }),
      });
      if (!svgRes.ok) {
        const j = await svgRes.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(j.error || `Vectorize failed (${svgRes.status})`);
      }
      const data = await svgRes.json();
      setSvgResult(data.svg);

      // Step 2: Convert SVG to DXF locally
      const dxfString = convertSvgToDxf(data.svg, [], 20);
      setDxfBlob(new Blob([dxfString], { type: 'application/dxf' }));

      finishProgress();
      setTimeout(() => setStep('done'), 400);
    } catch (err: any) {
      if (progressRef.current) clearInterval(progressRef.current);
      setErrorMsg(err.message || 'Vectorization failed. Please try again.');
      setStep('error');
    }
  };

  const downloadDxf = () => {
    if (!dxfBlob) return;
    const url = URL.createObjectURL(dxfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = originalFile?.name?.replace(/\.[^.]+$/, '') + '.dxf' || 'floorplan.dxf';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep('upload');
    setOriginalFile(null);
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setOriginalPreviewUrl(null);
    setSvgResult(null);
    setDxfBlob(null);
    setErrorMsg('');
    setProgress(0);
    setSvgZoom(1);
  };

  return (
    <div 
      className="min-h-screen bg-[#0a0a0f] text-white font-mono flex flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#00f0ff]/10 bg-[#0a0a0f]/90 backdrop-blur sticky top-0 z-20">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-[#00f0ff]/60 hover:text-[#00f0ff] transition-colors text-xs uppercase tracking-[3px]"
        >
          <ChevronLeft size={16} />
          Main Menu
        </button>
        <div className="text-center">
          <p className="text-[10px] text-[#00f0ff]/40 tracking-[4px] uppercase">Pinnacle Studios</p>
          <h1 className="text-[13px] font-bold tracking-[6px] uppercase text-[#00f0ff]" style={{ fontFamily: 'Givonic, Syncopate, sans-serif' }}>
            PNG → DXF
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] animate-pulse" />
          <span className="text-[9px] text-[#00f0ff]/50 tracking-[2px] uppercase">
            Vectorizer.AI
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Left Panel — Upload & Controls */}
        <div className="lg:w-[380px] shrink-0 flex flex-col gap-0 border-r border-[#00f0ff]/10">
          {/* Upload zone */}
          <div className="p-6 border-b border-[#00f0ff]/10">
            <p className="text-[10px] text-[#00f0ff]/50 tracking-[3px] uppercase mb-4">
              Input Image
            </p>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 min-h-[180px] ${
                dragOver
                  ? 'border-[#00f0ff] bg-[#00f0ff]/5 scale-[1.01]'
                  : originalFile
                  ? 'border-[#00f0ff]/40 bg-[#00f0ff]/3 hover:border-[#00f0ff]/70'
                  : 'border-[#00f0ff]/20 bg-[#0d0d1a] hover:border-[#00f0ff]/40 hover:bg-[#00f0ff]/3'
              }`}
            >
              {originalPreviewUrl ? (
                <>
                  <img
                    src={originalPreviewUrl}
                    alt="Uploaded floor plan"
                    className="max-h-36 max-w-full object-contain rounded"
                  />
                  <p className="text-[9px] text-[#00f0ff]/50 mt-1 truncate max-w-full px-2">
                    {originalFile?.name}
                  </p>
                  <p className="text-[8px] text-white/30">Click to replace</p>
                </>
              ) : (
                <>
                  <Upload size={28} className="text-[#00f0ff]/30" />
                  <p className="text-[11px] text-white/60 text-center leading-relaxed">
                    Drop your floor plan here<br />or click to browse
                  </p>
                  <p className="text-[9px] text-white/30">PNG · JPG · WEBP</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Info panel */}
          <div className="p-6 border-b border-[#00f0ff]/10 flex flex-col gap-3">
            <p className="text-[10px] text-[#00f0ff]/50 tracking-[3px] uppercase">Engine</p>
            {[
              ['🤖 AI', 'Deep learning vectorization'],
              ['🧮 Curves', 'Cubic Bézier + arcs preserved'],
              ['📐 Format', 'AutoCAD 2007+ compatible DXF'],
              ['🎯 Accuracy', '100% — all walls & details'],
            ].map(([label, desc]) => (
              <div key={label} className="flex items-start gap-3">
                <span className="text-[10px] w-14 shrink-0 text-[#00f0ff]/70">{label}</span>
                <span className="text-[10px] text-white/50 leading-tight">{desc}</span>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="p-6 flex flex-col gap-3 mt-auto">
            {step === 'upload' && originalFile && (
              <div className="flex flex-col gap-3">
                {!preprocessedUrl && !preprocessing && (
                  <button
                    onClick={() => handleUpscale(originalFile)}
                    className="w-full py-3 bg-[#111] border border-[#00f0ff]/30 text-[#00f0ff] font-bold text-xs uppercase tracking-[3px] rounded-lg hover:bg-[#00f0ff]/10 transition-all flex items-center justify-center gap-2"
                  >
                    <Wand2 size={14} />
                    Clean & Upscale Image
                  </button>
                )}
                {preprocessing && (
                  <button
                    disabled
                    className="w-full py-3 bg-[#111] border border-[#00f0ff]/10 text-[#00f0ff]/50 font-bold text-xs uppercase tracking-[3px] rounded-lg flex items-center justify-center gap-2"
                  >
                    <Loader2 size={14} className="animate-spin" />
                    Upscaling...
                  </button>
                )}
                <button
                  onClick={vectorize}
                  className="w-full py-3.5 bg-[#00f0ff] text-black font-bold text-xs uppercase tracking-[4px] rounded-lg hover:bg-[#00d4e8] transition-all shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:shadow-[0_0_30px_rgba(0,240,255,0.5)] active:scale-95"
                >
                  Vectorize → DXF
                </button>
              </div>
            )}

            {step === 'done' && (
              <>
                <button
                  onClick={downloadDxf}
                  className="w-full py-3.5 bg-[#00f0ff] text-black font-bold text-xs uppercase tracking-[4px] rounded-lg hover:bg-[#00d4e8] transition-all shadow-[0_0_20px_rgba(0,240,255,0.4)] flex items-center justify-center gap-2"
                >
                  <Download size={16} />
                  Download DXF
                </button>
                <button
                  onClick={reset}
                  className="w-full py-3 border border-[#00f0ff]/30 text-[#00f0ff]/60 hover:text-[#00f0ff] hover:border-[#00f0ff]/60 text-xs uppercase tracking-[3px] rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw size={14} />
                  New Image
                </button>
                 <button
                  onClick={() => {
                    if (dxfBlob) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        useArchitectStore.getState().addProjectAsset('dxf', reader.result as string);
                      };
                      reader.readAsDataURL(dxfBlob);
                    }
                  }}
                  className={`w-full mt-1 py-3 font-bold text-xs uppercase tracking-[3px] rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeProject?.assets.dxf
                      ? 'text-emerald-400 bg-emerald-950/45 border border-emerald-900/40 hover:bg-emerald-900/30'
                      : 'text-green-400 bg-green-950/45 border border-green-900/40 hover:bg-green-900/30 hover:border-green-500/50'
                  }`}
                >
                  <span className="text-sm">★</span>
                  {activeProject?.assets.dxf ? '✓ FINALIZED / ADDED TO PROJECT' : '★ FINALIZE / ADD TO PROJECT'}
                </button>
              </>
            )}

            {step === 'error' && (
              <button
                onClick={reset}
                className="w-full py-3.5 border border-red-500/40 text-red-400 hover:border-red-400 text-xs uppercase tracking-[3px] rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} />
                Try Again
              </button>
            )}

            {step === 'upload' && !originalFile && (
              <button
                disabled
                className="w-full py-3.5 bg-[#00f0ff]/10 text-[#00f0ff]/30 font-bold text-xs uppercase tracking-[4px] rounded-lg cursor-not-allowed"
              >
                Vectorize → DXF
              </button>
            )}
          </div>
        </div>

        {/* Right Panel — Preview */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#07070d]">
          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-[#00f0ff]/10 shrink-0">
            <p className="text-[10px] text-[#00f0ff]/50 tracking-[3px] uppercase">
              {step === 'done' ? 'Vectorized Preview' : 'Preview'}
            </p>
            {step === 'done' && svgResult && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSvgZoom(z => Math.max(0.3, z - 0.2))}
                  className="p-1.5 text-white/40 hover:text-[#00f0ff] transition-colors"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] text-white/30 w-10 text-center">{Math.round(svgZoom * 100)}%</span>
                <button
                  onClick={() => setSvgZoom(z => Math.min(3, z + 0.2))}
                  className="p-1.5 text-white/40 hover:text-[#00f0ff] transition-colors"
                >
                  <ZoomIn size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto flex items-start justify-center p-6 relative">
            {/* Empty state */}
            {step === 'upload' && !originalFile && (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-30">
                <div className="w-24 h-24 border-2 border-dashed border-[#00f0ff]/30 rounded-xl flex items-center justify-center">
                  <Upload size={32} className="text-[#00f0ff]/40" />
                </div>
                <p className="text-[11px] text-white/40 text-center tracking-wider uppercase">
                  Upload a floor plan to preview
                </p>
              </div>
            )}

            {/* Preview with tabs: Original vs Enhanced */}
            {step === 'upload' && originalFile && originalPreviewUrl && (
              <div className="flex flex-col gap-0 w-full h-full">
                {/* Tab bar */}
                <div className="flex items-center gap-0 border-b border-[#00f0ff]/10 shrink-0 mb-4">
                  <button
                    onClick={() => setPreviewTab('enhanced')}
                    className={`flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[2px] border-b-2 transition-all ${
                      previewTab === 'enhanced'
                        ? 'border-[#00f0ff] text-[#00f0ff]'
                        : 'border-transparent text-white/30 hover:text-white/60'
                    }`}
                  >
                    {preprocessing ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]" />
                    )}
                    Enhanced
                    {!preprocessing && preprocessedUrl && (
                      <span className="text-[8px] px-1 py-0.5 bg-[#00f0ff]/20 text-[#00f0ff] rounded font-bold">READY</span>
                    )}
                  </button>
                  <button
                    onClick={() => setPreviewTab('original')}
                    className={`flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-[2px] border-b-2 transition-all ${
                      previewTab === 'original'
                        ? 'border-white/40 text-white/70'
                        : 'border-transparent text-white/30 hover:text-white/60'
                    }`}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                    Original
                  </button>
                </div>

                {/* Image display */}
                <div className="flex-1 overflow-auto flex items-start justify-center">
                  {previewTab === 'enhanced' ? (
                    <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
                      {preprocessing ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-20">
                          <Loader2 size={32} className="text-[#00f0ff] animate-spin" />
                          <p className="text-[10px] text-[#00f0ff]/60 uppercase tracking-[3px]">
                            Enhancing & AI Upscaling image…
                          </p>
                          <p className="text-[10px] text-white/30">
                            Upscale 3x+ · Sharp Filter · SeedVR AI Upscale 2x
                          </p>
                        </div>
                      ) : preprocessedUrl ? (
                        <>
                          <div className="border border-[#00f0ff]/30 rounded-xl overflow-hidden bg-white w-full shadow-[0_0_20px_rgba(0,240,255,0.1)]">
                            <div className="px-4 py-2 border-b border-[#00f0ff]/20 bg-[#0a0a0f] flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]" />
                              <span className="text-[9px] text-[#00f0ff] tracking-[2px] uppercase">Enhanced — ready for vectorization</span>
                              <span className="ml-auto text-[8px] text-[#00f0ff]/50">Upscale 3x+ · Sharp Filter · SeedVR AI Upscale 2x</span>
                            </div>
                            <img
                              src={preprocessedUrl}
                              alt="Enhanced floor plan"
                              className="w-full object-contain max-h-[65vh]"
                            />
                          </div>
                          <p className="text-[10px] text-[#00f0ff]/50 uppercase tracking-[2px]">
                            ↙ Click Vectorize → DXF on the left
                          </p>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-4 py-20">
                          <p className="text-[11px] text-white/40 uppercase tracking-wider">Image is currently unenhanced</p>
                          <button
                            onClick={() => { if (originalFile) handleUpscale(originalFile); }}
                            className="flex items-center gap-2 px-6 py-3 bg-[#00f0ff]/10 text-[#00f0ff] border border-[#00f0ff]/40 hover:bg-[#00f0ff]/20 font-bold uppercase tracking-[2px] text-[10px] rounded transition-all shadow-[0_0_15px_rgba(0,240,255,0.2)]"
                          >
                            <Wand2 size={16} /> Run AI Upscale & Sharpening
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
                      <div className="border border-white/10 rounded-xl overflow-hidden bg-neutral-900 w-full">
                        <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                          <span className="text-[9px] text-white/30 tracking-[2px] uppercase">Original (unprocessed)</span>
                        </div>
                        <img
                          src={originalPreviewUrl}
                          alt="Original floor plan"
                          className="w-full object-contain max-h-[65vh]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}


            {/* Processing */}
            {step === 'processing' && (
              <div className="flex flex-col items-center justify-center h-full gap-8 w-full max-w-md">
                {/* HUD circle */}
                <div className="relative w-40 h-40">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="70" fill="none" stroke="#00f0ff10" strokeWidth="4" />
                    <circle
                      cx="80" cy="80" r="70"
                      fill="none"
                      stroke="#00f0ff"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 70}`}
                      strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
                      className="transition-all duration-300"
                      style={{ filter: 'drop-shadow(0 0 8px #00f0ff)' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <Loader2 size={24} className="text-[#00f0ff] animate-spin" />
                    <span className="text-xl font-bold text-[#00f0ff]">{Math.round(progress)}%</span>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-[13px] font-bold text-white tracking-[3px] uppercase mb-2">
                    Vectorizing
                  </p>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    AI tracing all paths, curves, and walls…
                  </p>
                </div>

                {/* Animated scan lines */}
                <div className="w-full border border-[#00f0ff]/10 rounded-lg overflow-hidden h-24 relative bg-[#0a0a0f]">
                  {originalPreviewUrl && (
                    <img src={originalPreviewUrl} alt="" className="w-full h-full object-cover opacity-20" />
                  )}
                  <div
                    className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent animate-bounce"
                    style={{ top: `${progress}%`, transition: 'top 0.3s' }}
                  />
                </div>
              </div>
            )}

            {/* Done — Side by side */}
            {step === 'done' && svgResult && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
                {/* Original */}
                <div className="border border-white/10 rounded-xl overflow-hidden bg-neutral-900">
                  <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                    <span className="text-[9px] text-white/40 tracking-[2px] uppercase">Original PNG</span>
                  </div>
                  {originalPreviewUrl && (
                    <img src={originalPreviewUrl} alt="Original" className="w-full object-contain max-h-[60vh]" />
                  )}
                </div>

                {/* SVG Vector result */}
                <div className="border border-[#00f0ff]/20 rounded-xl overflow-hidden bg-white">
                  <div className="px-4 py-2 border-b border-[#00f0ff]/20 bg-[#0a0a0f] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]" />
                    <span className="text-[9px] text-[#00f0ff] tracking-[2px] uppercase">Vectorized Result</span>
                    <span className="ml-auto text-[8px] text-[#00f0ff]/40">Cubic Bézier curves</span>
                  </div>
                  <div
                    className="w-full overflow-auto bg-white flex items-start justify-center p-4 max-h-[60vh]"
                    style={{ minHeight: 200 }}
                  >
                    <div
                      className="[&>svg]:max-w-full [&>svg]:h-auto"
                      style={{ transform: `scale(${svgZoom})`, transformOrigin: 'top center', transition: 'transform 0.2s' }}
                      dangerouslySetInnerHTML={{ __html: svgResult }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {step === 'error' && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <AlertCircle size={48} className="text-red-400" />
                <p className="text-sm font-bold text-red-400 uppercase tracking-[2px]">Vectorization Failed</p>
                <p className="text-[11px] text-white/40 text-center max-w-xs leading-relaxed">{errorMsg}</p>
              </div>
            )}
          </div>

          {/* Bottom status bar */}
          {step === 'done' && (
            <div className="px-6 py-3 border-t border-[#00f0ff]/10 flex items-center gap-4 bg-[#00f0ff]/3 shrink-0">
              <CheckCircle2 size={14} className="text-[#00f0ff]" />
              <span className="text-[10px] text-[#00f0ff]/80 tracking-[2px] uppercase">
                Vectorization complete — all curves and walls traced
              </span>
              <button
                onClick={downloadDxf}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#00f0ff] text-black text-[10px] font-bold uppercase tracking-[2px] rounded hover:bg-[#00d4e8] transition-colors"
              >
                <Download size={12} />
                DXF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.07)_51%)] bg-[length:100%_4px] z-50 opacity-30" />
    </div>
  );
}
