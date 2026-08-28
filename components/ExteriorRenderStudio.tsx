'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud, Sparkles, Download, RefreshCw, Loader2, Building2,
  Sun, Moon, Camera, Settings2, Eye, Trash2, Send
} from 'lucide-react';

interface ExteriorRenderHistoryItem {
  id: string;
  renderBase64: string;
  modelBase64: string;
  timeOfDay: 'day' | 'night';
  cameraAngle: string;
  timestamp: number;
}

const CAMERA_ANGLES = [
  { id: 'hero_angle', label: 'Hero View (45°)', emoji: '📸', desc: 'Dramatic 3/4 elevated perspective' },
  { id: 'street_level', label: 'Street Level', emoji: '🚶', desc: 'Human eye-level looking up' },
  { id: 'worm_eye', label: "Worm's Eye", emoji: '👁️', desc: 'Directly at base looking straight up' },
  { id: 'drone_aerial', label: 'Drone Aerial', emoji: '🚁', desc: 'High-angle 45° aerial shot' },
  { id: 'side_elevation', label: 'Side Profile', emoji: '✈️', desc: 'Clean architectural elevation' },
];

export default function ExteriorRenderStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Model input state
  const [modelBase64, setModelBase64] = useState<string | null>(null);
  const [modelFileName, setModelFileName] = useState<string>('');

  // Minimal Controls (Day / Night, Camera Views, Custom Notes)
  const [timeOfDay, setTimeOfDay] = useState<'day' | 'night'>('night');
  const [cameraAngle, setCameraAngle] = useState('hero_angle');
  const [extraDirectives, setExtraDirectives] = useState('');
  const [quality, setQuality] = useState<'medium' | 'high'>('medium');

  // Output & history state
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<ExteriorRenderHistoryItem[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModelFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      if (b64) {
        setModelBase64(b64);
        setRenderResult(null);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRender = async () => {
    if (!modelBase64 || isRendering) return;
    setIsRendering(true);
    setErrorMsg(null);
    setRenderResult(null);

    try {
      const res = await fetch('/api/exterior-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelBase64,
          timeOfDay,
          cameraAngle,
          extraDirectives,
          quality,
        }),
      });
      const data = await res.json();
      if (data.render) {
        setRenderResult(data.render);
        const item: ExteriorRenderHistoryItem = {
          id: Math.random().toString(36).slice(2),
          renderBase64: data.render,
          modelBase64,
          timeOfDay,
          cameraAngle,
          timestamp: Date.now(),
        };
        setHistory((prev) => [item, ...prev]);
        setViewingId(item.id);
      } else {
        setErrorMsg(data.error || 'Render failed. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please check connection and retry.');
    } finally {
      setIsRendering(false);
    }
  };

  const downloadRender = (base64: string, label?: string) => {
    const a = document.createElement('a');
    a.href = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
    a.download = `exterior-${label || timeOfDay}-${Date.now()}.png`;
    a.click();
  };

  const viewingItem = viewingId ? history.find((h) => h.id === viewingId) : null;
  const displayRender = viewingItem?.renderBase64 || renderResult;

  return (
    <div className="flex flex-1 overflow-hidden bg-[#020510] text-white font-sans">
      {/* ── Left: Viewport & Outputs ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 gap-5">

        {/* Section Header */}
        <div className="flex items-center justify-between pb-4 border-b border-orange-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)]">
              <Building2 size={18} className="text-black" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[3px] text-white">Exterior 3D Render Studio</h2>
              <p className="text-[9px] text-amber-400/60 font-mono uppercase tracking-wider">
                SketchUp Model → Day / Night Architectural CGI Visualization
              </p>
            </div>
          </div>
          {modelBase64 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[9px] text-orange-400 hover:text-orange-200 uppercase font-bold cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-950/30 border border-orange-500/30"
            >
              <RefreshCw size={11} /> Change Model Image
            </button>
          )}
        </div>

        {modelBase64 ? (
          <div className="flex flex-col gap-5">

            {/* Split View: Model Input + Render Output */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Input Model Panel */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                    📐 1. Input 3D Model Screenshot
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-amber-500/30 bg-black/60 shadow-lg flex items-center justify-center p-2 min-h-[380px]">
                  <img
                    src={modelBase64}
                    alt="SketchUp Model Input"
                    className="w-full max-h-[440px] object-contain rounded-lg"
                  />
                  <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur px-2.5 py-1 rounded-md text-[9px] font-mono text-amber-300 border border-amber-500/30 truncate max-w-[80%]">
                    📁 {modelFileName || '3D Model Viewport'}
                  </div>
                </div>
              </div>

              {/* Output Render Panel */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 font-mono flex items-center gap-1.5">
                    ✨ 2. Ultra-Luxury 3D Render Output
                  </span>
                  {displayRender && (
                    <button
                      onClick={() => downloadRender(displayRender, timeOfDay)}
                      className="text-[9px] text-emerald-400 hover:text-emerald-200 uppercase font-bold cursor-pointer flex items-center gap-1 bg-emerald-950/40 border border-emerald-500/40 px-2.5 py-1 rounded-md"
                    >
                      <Download size={11} /> Download 8K
                    </button>
                  )}
                </div>

                {isRendering ? (
                  <div className="rounded-xl border-2 border-orange-500/50 bg-[#020512]/90 shadow-[0_0_40px_rgba(245,158,11,0.25)] flex flex-col items-center justify-center gap-3.5 min-h-[380px] p-6 text-center animate-pulse">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full border-2 border-orange-500/30 border-t-amber-400 animate-spin" />
                      <Building2 className="absolute inset-0 m-auto text-amber-400 animate-pulse" size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[3px] text-white mb-1">
                        SYNTHESIZING PHOTOREALISTIC EXTERIOR...
                      </p>
                      <p className="text-[9px] font-mono text-amber-400 tracking-wider">
                        {timeOfDay === 'night'
                          ? 'Applying fiery sunset sky, 3000K interior glows & LED balcony ribbons...'
                          : 'Applying brilliant daylight, crisp drop shadows & mirror glass reflections...'}
                      </p>
                    </div>
                  </div>
                ) : displayRender ? (
                  <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 bg-black shadow-[0_0_35px_rgba(16,185,129,0.15)] flex items-center justify-center p-2 min-h-[380px]">
                    <img
                      src={displayRender.startsWith('data:') ? displayRender : `data:image/jpeg;base64,${displayRender}`}
                      alt="Photorealistic Exterior Render"
                      className="w-full max-h-[440px] object-contain rounded-lg"
                    />
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 bg-black/85 backdrop-blur text-amber-300 text-[8px] font-mono font-bold uppercase tracking-wider rounded-full border border-amber-500/40">
                        {timeOfDay === 'night' ? '🌙 Night / Sunset Glow' : '☀️ Brilliant Day'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-orange-950/60 bg-black/40 flex flex-col items-center justify-center min-h-[380px] text-center p-6">
                    <Building2 size={36} className="text-orange-900/60 mb-3" />
                    <p className="text-xs font-bold uppercase tracking-[2px] text-white/80 mb-1">
                      Ready to Render
                    </p>
                    <p className="text-[9px] text-amber-400/50 font-mono uppercase tracking-wider">
                      Select Day or Night, pick a camera view & hit Generate
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-[10px] text-red-300 font-mono">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Render Iterations History */}
            {history.length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-orange-950/60">
                <h4 className="text-xs font-bold uppercase tracking-[2px] text-white flex items-center gap-2">
                  <Eye size={12} className="text-amber-400" />
                  Render Iterations History ({history.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {history.map((h, idx) => {
                    const angle = CAMERA_ANGLES.find((c) => c.id === h.cameraAngle);
                    return (
                      <div
                        key={h.id}
                        onClick={() => setViewingId(h.id)}
                        className={`group/card relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                          viewingId === h.id
                            ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                            : 'border-orange-950/60 hover:border-amber-500/50 bg-black/60'
                        }`}
                      >
                        <img
                          src={h.renderBase64.startsWith('data:') ? h.renderBase64 : `data:image/jpeg;base64,${h.renderBase64}`}
                          alt={`Iteration #${history.length - idx}`}
                          className="w-full aspect-video object-cover group-hover/card:scale-105 transition-transform duration-300"
                        />
                        <div className="p-2 bg-black/90 flex items-center justify-between gap-1 text-[8px] font-mono border-t border-white/5">
                          <span className="text-amber-300 font-bold uppercase">
                            {h.timeOfDay === 'night' ? '🌙 Night' : '☀️ Day'} · {angle?.emoji}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadRender(h.renderBase64, h.timeOfDay); }}
                              className="text-gray-400 hover:text-white"
                              title="Download"
                            >
                              <Download size={10} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistory((prev) => prev.filter((x) => x.id !== h.id));
                                if (viewingId === h.id) setViewingId(null);
                              }}
                              className="text-gray-500 hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State: Prompt Upload */
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-20">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-950/60 to-orange-950/40 border border-amber-500/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <Building2 size={36} className="text-amber-400" />
            </div>
            <h2 className="text-base font-black uppercase tracking-[3px] text-white mb-2">
              Upload 3D Model / SketchUp Angle
            </h2>
            <p className="text-xs text-amber-400/60 uppercase tracking-wider leading-relaxed mb-8 font-mono">
              Upload your SketchUp, Rhino, Revit, or 3D model viewport screenshot.
              Choose <strong>Day</strong> or <strong>Night</strong> to generate an ultra-luxurious, crazy realistic architectural CGI render!
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] cursor-pointer"
            >
              <UploadCloud size={16} /> Choose Model Screenshot
            </button>
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* ── Right: Clean Sidebar Controls ─────────────────────────────────── */}
      <div className="w-[340px] border-l border-orange-950/70 bg-[#030611]/95 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.6)] z-10 font-mono">

        {/* Sidebar Header */}
        <div className="p-5 border-b border-orange-950/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2">
              <Settings2 size={13} className="text-amber-400" /> Render Controls
            </h3>
            <p className="text-[9px] text-amber-400/50 mt-0.5">Lighting · Camera Angle · Custom Directives</p>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar">

          {/* 1. Time of Day (Day / Night) */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              ☀️ 1. Time of Day
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTimeOfDay('day')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  timeOfDay === 'day'
                    ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-amber-200'
                    : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sun size={15} className={timeOfDay === 'day' ? 'text-amber-400' : 'text-gray-400'} />
                  <span className="text-[11px] font-bold uppercase">☀️ Day</span>
                </div>
                <span className="text-[8px] text-gray-400 leading-tight">
                  Sunny blue sky, sharp shadows, luxury glass
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTimeOfDay('night')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                  timeOfDay === 'night'
                    ? 'bg-gradient-to-br from-amber-500/25 to-orange-500/20 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)] text-amber-200'
                    : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Moon size={15} className={timeOfDay === 'night' ? 'text-amber-400' : 'text-gray-400'} />
                  <span className="text-[11px] font-bold uppercase">🌙 Night / Sunset</span>
                </div>
                <span className="text-[8px] text-amber-400/70 leading-tight font-bold">
                  🔥 Fiery sunset sky, glowing LED ribbons, wet reflections
                </span>
              </button>
            </div>
          </div>

          {/* 2. Different Camera Views */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Camera size={12} /> 2. Camera View Angle
            </span>

            <div className="flex flex-col gap-1.5">
              {CAMERA_ANGLES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCameraAngle(c.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    cameraAngle === c.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-black/40 border-white/10 text-gray-300 hover:border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm">{c.emoji}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold uppercase">{c.label}</span>
                      <span className="text-[8px] text-gray-400 truncate">{c.desc}</span>
                    </div>
                  </div>
                  {cameraAngle === c.id && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,1)] shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Architect Directives (Optional Text) */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Send size={12} /> 3. Architect Directives (Optional)
            </span>
            <textarea
              value={extraDirectives}
              onChange={(e) => setExtraDirectives(e.target.value)}
              placeholder="e.g. Add an infinity sky pool on the podium, champagne gold vertical fins, and palm trees."
              rows={3}
              className="w-full bg-black/60 border border-white/10 focus:border-amber-400 rounded-xl p-2.5 text-[10px] text-amber-200 resize-none focus:outline-none leading-relaxed"
            />
          </div>

          {/* 4. Quality Settings */}
          <div className="flex items-center justify-between border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Sparkles size={12} /> Quality
            </span>
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setQuality('medium')}
                className={`px-2.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  quality === 'medium' ? 'bg-amber-500 text-black shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                Medium
              </button>
              <button
                type="button"
                onClick={() => setQuality('high')}
                className={`px-2.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                  quality === 'high' ? 'bg-emerald-400 text-black shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                High
              </button>
            </div>
          </div>

        </div>

        {/* Generate Button (Sticky Bottom) */}
        <div className="p-5 border-t border-orange-950/60 shrink-0">
          <button
            type="button"
            onClick={handleRender}
            disabled={!modelBase64 || isRendering}
            className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all ${
              !modelBase64 || isRendering
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
                : 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 hover:from-amber-300 hover:to-orange-400 text-black cursor-pointer shadow-[0_0_30px_rgba(245,158,11,0.5)]'
            }`}
          >
            {isRendering ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate {timeOfDay === 'night' ? 'Night' : 'Day'} Render
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
