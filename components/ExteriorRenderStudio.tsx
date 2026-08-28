'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud, Sparkles, Download, RefreshCw, Loader2, Building2,
  Sun, Moon, Camera, Layers, Settings2, ChevronDown, ChevronUp,
  Eye, Trash2, Zap, Wind, CloudLightning, Sunset, Star
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ExteriorRenderHistoryItem {
  id: string;
  renderBase64: string;
  modelBase64: string;
  materialPreset: string;
  skyPreset: string;
  cameraAngle: string;
  buildingType: string;
  floors: number;
  timestamp: number;
}

// ── Preset Definitions ────────────────────────────────────────────────────────
const BUILDING_TYPES = [
  'Luxury Residential Tower',
  'Commercial Office Tower',
  'Boutique Hotel',
  'Residential Villa',
  'Mixed-Use Development',
  'Cultural / Museum',
  'Retail Complex',
  'Corporate HQ',
];

const MATERIAL_PRESETS = [
  { id: 'glass_steel', label: 'Glass & Steel', emoji: '🏙️', desc: 'Curtain wall, brushed steel, chrome' },
  { id: 'concrete_wood', label: 'Concrete & Wood', emoji: '🪵', desc: 'Board-form concrete, cedar louvers' },
  { id: 'white_marble', label: 'White Marble', emoji: '🤍', desc: 'Carrara marble, brass trim, luxury' },
  { id: 'brick_terracotta', label: 'Brick & Terracotta', emoji: '🧱', desc: 'Elongated brick, bronze frames' },
  { id: 'parametric_mesh', label: 'Parametric Mesh', emoji: '⬡', desc: 'Perforated aluminium, LED backlit' },
  { id: 'luxury_dark', label: 'Luxury Dark', emoji: '🖤', desc: 'Black granite, obsidian, noir zinc' },
];

const SKY_PRESETS = [
  { id: 'golden_hour', label: 'Golden Hour', emoji: '🌅', desc: 'Explosive sunset, amber rim light' },
  { id: 'blue_hour', label: 'Blue Hour', emoji: '🌆', desc: 'Twilight cobalt, warm interior glow' },
  { id: 'noon_blazing', label: 'Blazing Noon', emoji: '☀️', desc: '5500K sun, electric cerulean sky' },
  { id: 'dramatic_overcast', label: 'Dramatic Overcast', emoji: '⛅', desc: 'Storm clouds, god-rays, silver light' },
  { id: 'rainy_night', label: 'Rainy Night', emoji: '🌧️', desc: 'Neon reflections, wet paving, noir' },
  { id: 'stormy_dusk', label: 'Stormy Dusk', emoji: '⚡', desc: 'Apocalyptic dusk, violet clouds' },
];

const CAMERA_ANGLES = [
  { id: 'hero_angle', label: 'Hero Angle', emoji: '📸', desc: '45° elevated, full height reveal' },
  { id: 'street_level', label: 'Street Level', emoji: '🚶', desc: 'Pedestrian eye-level, dramatic up-look' },
  { id: 'worm_eye', label: "Worm's Eye", emoji: '👁️', desc: 'Straight up, extreme convergence' },
  { id: 'drone_45', label: 'Drone 45°', emoji: '🚁', desc: 'Aerial 45° down, crown + context' },
  { id: 'drone_side', label: 'Drone Lateral', emoji: '✈️', desc: 'Flyby side view, full elevation' },
  { id: 'interior_courtyard', label: 'Courtyard', emoji: '🏛️', desc: 'Interior atrium, sky above' },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExteriorRenderStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Model image state
  const [modelBase64, setModelBase64] = useState<string | null>(null);
  const [modelFileName, setModelFileName] = useState<string>('');

  // Controls
  const [buildingType, setBuildingType] = useState('Luxury Residential Tower');
  const [floors, setFloors] = useState(20);
  const [materialPreset, setMaterialPreset] = useState('glass_steel');
  const [skyPreset, setSkyPreset] = useState('golden_hour');
  const [cameraAngle, setCameraAngle] = useState('hero_angle');
  const [extraDirectives, setExtraDirectives] = useState('');
  const [surroundings, setSurroundings] = useState('');
  const [quality, setQuality] = useState<'medium' | 'high'>('medium');

  // Output state
  const [isRendering, setIsRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<ExteriorRenderHistoryItem[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Advanced panel toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

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
          buildingType,
          floors,
          materialPreset,
          skyPreset,
          cameraAngle,
          extraDirectives,
          surroundings,
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
          materialPreset,
          skyPreset,
          cameraAngle,
          buildingType,
          floors,
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
    a.download = `exterior-render-${label || Date.now()}.png`;
    a.click();
  };

  const viewingItem = viewingId ? history.find((h) => h.id === viewingId) : null;
  const displayRender = viewingItem?.renderBase64 || renderResult;

  return (
    <div className="flex flex-1 overflow-hidden bg-[#020510] text-white font-sans">
      {/* ── Left: Canvas / Output ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 gap-5">

        {/* Section header */}
        <div className="flex items-center gap-3 pb-4 border-b border-orange-950/60">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center shadow-[0_0_20px_rgba(234,88,12,0.5)]">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[3px] text-white">Exterior Render Studio</h2>
            <p className="text-[9px] text-orange-400/60 font-mono uppercase tracking-wider">
              SketchUp / 3D Model → GPT Image 2 → Hyper-Photorealistic Exterior
            </p>
          </div>
        </div>

        {modelBase64 ? (
          <div className="flex flex-col gap-5">

            {/* Split view: Model input + Render output */}
            <div className="grid grid-cols-2 gap-4">
              {/* Input model panel */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orange-300 flex items-center gap-1.5">
                    <Layers size={11} /> Input Model
                  </span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[9px] text-orange-400 hover:text-orange-200 uppercase font-bold cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Replace
                  </button>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-orange-900/50 bg-black/60 shadow-[0_0_20px_rgba(234,88,12,0.1)]">
                  <img
                    src={modelBase64}
                    alt="SketchUp Model"
                    className="w-full max-h-[360px] object-contain"
                  />
                  <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur rounded-lg px-2.5 py-1.5 text-[9px] font-mono text-orange-300 truncate border border-orange-900/40">
                    📁 {modelFileName || 'Model Screenshot'}
                  </div>
                </div>
              </div>

              {/* Output render panel */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-rose-300 flex items-center gap-1.5">
                    <Sparkles size={11} /> Photorealistic Output
                  </span>
                  {displayRender && (
                    <button
                      onClick={() => downloadRender(displayRender, `${materialPreset}-${skyPreset}`)}
                      className="text-[9px] text-rose-400 hover:text-rose-200 uppercase font-bold cursor-pointer flex items-center gap-1"
                    >
                      <Download size={10} /> Download
                    </button>
                  )}
                </div>

                {isRendering ? (
                  <div className="rounded-xl border border-orange-500/40 bg-[#03060f]/90 shadow-[0_0_30px_rgba(234,88,12,0.2)] flex flex-col items-center justify-center gap-3 min-h-[360px]">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full border-2 border-orange-500/30 border-t-orange-400 animate-spin" />
                      <Building2 className="absolute inset-0 m-auto text-orange-400 animate-pulse" size={20} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold uppercase tracking-[3px] text-white mb-1">
                        SYNTHESIZING PHOTOREALISTIC EXTERIOR...
                      </p>
                      <p className="text-[9px] font-mono text-orange-400/70">
                        GPT Image 2 | {quality} quality | Applying ultra-luxurious materials…
                      </p>
                    </div>
                  </div>
                ) : displayRender ? (
                  <div className="relative rounded-xl overflow-hidden border border-rose-500/30 bg-black shadow-[0_0_30px_rgba(225,29,72,0.15)]">
                    <img
                      src={displayRender.startsWith('data:') ? displayRender : `data:image/jpeg;base64,${displayRender}`}
                      alt="Exterior Render"
                      className="w-full max-h-[360px] object-contain"
                    />
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-0.5 bg-rose-600/80 backdrop-blur text-white text-[8px] font-bold uppercase tracking-widest rounded-full">
                        GPT Image 2
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-orange-900/40 bg-black/40 flex items-center justify-center min-h-[360px]">
                    <div className="text-center">
                      <Building2 size={32} className="text-orange-900/60 mx-auto mb-3" />
                      <p className="text-[10px] text-orange-400/40 font-mono uppercase tracking-wider">
                        Configure & hit Generate
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error message */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-[10px] text-red-300 font-mono">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Render History Gallery */}
            {history.length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-orange-950/60">
                <h4 className="text-xs font-bold uppercase tracking-[2px] text-white flex items-center gap-2">
                  <Eye size={12} className="text-orange-400" />
                  Render History ({history.length})
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {history.map((h) => {
                    const sky = SKY_PRESETS.find((s) => s.id === h.skyPreset);
                    const mat = MATERIAL_PRESETS.find((m) => m.id === h.materialPreset);
                    return (
                      <div
                        key={h.id}
                        onClick={() => setViewingId(h.id)}
                        className={`group/card relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                          viewingId === h.id
                            ? 'border-orange-400 shadow-[0_0_20px_rgba(234,88,12,0.4)]'
                            : 'border-orange-900/30 hover:border-orange-500/50'
                        }`}
                      >
                        <img
                          src={h.renderBase64.startsWith('data:') ? h.renderBase64 : `data:image/jpeg;base64,${h.renderBase64}`}
                          alt="Render Thumb"
                          className="w-full aspect-video object-cover group-hover/card:scale-105 transition-transform duration-300"
                        />
                        <div className="p-1.5 bg-black/90 flex items-center justify-between gap-1 text-[8px] font-mono">
                          <span className="text-orange-400/80 truncate">{sky?.emoji} {mat?.label}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadRender(h.renderBase64, h.skyPreset); }}
                              className="text-gray-500 hover:text-white"
                            >
                              <Download size={9} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setHistory((prev) => prev.filter((x) => x.id !== h.id)); if (viewingId === h.id) setViewingId(null); }}
                              className="text-gray-600 hover:text-red-400"
                            >
                              <Trash2 size={9} />
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
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-20">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-orange-950/60 to-rose-950/40 border border-orange-500/30 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(234,88,12,0.2)]">
              <Building2 size={40} className="text-orange-400" />
            </div>
            <h2 className="text-lg font-black uppercase tracking-[3px] text-white mb-2">
              Upload Your SketchUp Model
            </h2>
            <p className="text-xs text-orange-400/50 uppercase tracking-wider leading-relaxed mb-8 font-mono">
              Export a viewport screenshot or render from SketchUp, Revit, Rhino, or any 3D tool. The AI will preserve your exact geometry, massing, and composition — then transform it into a hyper-photorealistic luxury architectural exterior.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-[0_0_30px_rgba(234,88,12,0.4)] cursor-pointer"
            >
              <UploadCloud size={18} /> Choose Model Screenshot
            </button>
            <p className="text-[9px] text-orange-900/60 font-mono mt-4 uppercase tracking-wider">
              Supports PNG, JPG, WEBP · SketchUp, Revit, Rhino, Blender exports
            </p>
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

      {/* ── Right: Controls Sidebar ──────────────────────────────────────── */}
      <div className="w-[360px] border-l border-orange-950/70 bg-[#030611]/95 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.6)] z-10 overflow-y-auto custom-scrollbar">

        {/* Sidebar header */}
        <div className="p-5 border-b border-orange-950/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2">
              <Settings2 size={13} className="text-orange-400" /> Exterior Render Engine
            </h3>
            <p className="text-[9px] text-orange-400/50 font-mono mt-0.5">Geometry · Materials · Sky · Camera</p>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-5 font-mono">

          {/* Upload CTA (if no model) */}
          {!modelBase64 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-xl border-2 border-dashed border-orange-500/40 hover:border-orange-400 bg-orange-950/10 hover:bg-orange-950/20 text-orange-300 text-[10px] font-bold uppercase tracking-widest transition-all flex flex-col items-center gap-2 cursor-pointer"
            >
              <UploadCloud size={20} />
              Upload Model Screenshot
            </button>
          )}

          {/* 1. Building Type + Floors */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Building2 size={12} /> 1. Building Info
            </span>

            <select
              value={buildingType}
              onChange={(e) => setBuildingType(e.target.value)}
              className="w-full bg-black/60 border border-white/10 focus:border-orange-400 rounded-lg px-3 py-2 text-[10px] text-white focus:outline-none appearance-none cursor-pointer"
            >
              {BUILDING_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <label className="text-[9px] text-orange-300/70 uppercase tracking-widest whitespace-nowrap">Floors:</label>
              <input
                type="number"
                min={1}
                max={200}
                value={floors}
                onChange={(e) => setFloors(Number(e.target.value))}
                className="flex-1 bg-black/60 border border-white/10 focus:border-orange-400 rounded-lg px-3 py-1.5 text-[10px] text-white text-center focus:outline-none"
              />
              <div className="flex gap-1">
                {[5, 10, 20, 40].map((n) => (
                  <button
                    key={n}
                    onClick={() => setFloors(n)}
                    className={`w-6 h-6 rounded text-[8px] font-bold transition-all cursor-pointer ${
                      floors === n ? 'bg-orange-500 text-black' : 'bg-black/60 border border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Facade Material */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Layers size={12} /> 2. Facade Materials
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {MATERIAL_PRESETS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMaterialPreset(m.id)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    materialPreset === m.id
                      ? 'bg-orange-500/20 border-orange-400 shadow-[0_0_12px_rgba(234,88,12,0.3)]'
                      : 'bg-black/40 border-white/10 hover:border-orange-500/30'
                  }`}
                >
                  <span className="text-xs">{m.emoji}</span>
                  <span className={`text-[9px] font-bold uppercase leading-tight ${materialPreset === m.id ? 'text-orange-200' : 'text-gray-300'}`}>
                    {m.label}
                  </span>
                  <span className="text-[8px] text-gray-500 leading-tight truncate">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Sky & Atmosphere */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Sun size={12} /> 3. Sky & Atmosphere
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {SKY_PRESETS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSkyPreset(s.id)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    skyPreset === s.id
                      ? 'bg-indigo-500/20 border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                      : 'bg-black/40 border-white/10 hover:border-indigo-500/30'
                  }`}
                >
                  <span className="text-xs">{s.emoji}</span>
                  <span className={`text-[9px] font-bold uppercase leading-tight ${skyPreset === s.id ? 'text-indigo-200' : 'text-gray-300'}`}>
                    {s.label}
                  </span>
                  <span className="text-[8px] text-gray-500 leading-tight truncate">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Camera Angle */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
              <Camera size={12} /> 4. Camera Angle
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMERA_ANGLES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCameraAngle(c.id)}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-0.5 ${
                    cameraAngle === c.id
                      ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                      : 'bg-black/40 border-white/10 hover:border-cyan-500/30'
                  }`}
                >
                  <span className="text-xs">{c.emoji}</span>
                  <span className={`text-[9px] font-bold uppercase leading-tight ${cameraAngle === c.id ? 'text-cyan-200' : 'text-gray-300'}`}>
                    {c.label}
                  </span>
                  <span className="text-[8px] text-gray-500 leading-tight truncate">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 5. Quality */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                <Sparkles size={12} /> 5. GPT Image 2 Quality
              </span>
              <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                <button
                  onClick={() => setQuality('medium')}
                  className={`px-2.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                    quality === 'medium' ? 'bg-cyan-500 text-black shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Medium
                </button>
                <button
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

          {/* 6. Advanced Directives (collapsible) */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-amber-400 cursor-pointer w-full"
            >
              <span className="flex items-center gap-1.5"><Zap size={12} /> 6. Advanced Directives</span>
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showAdvanced && (
              <div className="flex flex-col gap-2.5 animate-fadeIn">
                <div>
                  <label className="text-[9px] text-orange-300/70 uppercase tracking-widest block mb-1">
                    Custom Design Instructions
                  </label>
                  <textarea
                    value={extraDirectives}
                    onChange={(e) => setExtraDirectives(e.target.value)}
                    placeholder="e.g. Add a dramatic cantilevered Sky Pool on the 45th floor. Wrap the podium in vertical garden greenery. Apply rose-gold anodised trims to all window frames."
                    rows={3}
                    className="w-full bg-black/60 border border-white/10 focus:border-orange-400 rounded-lg p-2.5 text-[10px] text-orange-200 resize-none focus:outline-none leading-relaxed"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-orange-300/70 uppercase tracking-widest block mb-1">
                    Custom Surroundings / Context
                  </label>
                  <textarea
                    value={surroundings}
                    onChange={(e) => setSurroundings(e.target.value)}
                    placeholder="e.g. Dubai Marina waterfront promenade with superyachts visible in background, tropical palms, and glassy water reflections..."
                    rows={2}
                    className="w-full bg-black/60 border border-white/10 focus:border-orange-400 rounded-lg p-2.5 text-[10px] text-orange-200 resize-none focus:outline-none leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Generate Button (sticky at bottom) */}
        <div className="p-5 border-t border-orange-950/60 mt-auto shrink-0">
          <button
            onClick={handleRender}
            disabled={!modelBase64 || isRendering}
            className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${
              !modelBase64 || isRendering
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
                : 'bg-gradient-to-r from-orange-500 via-rose-500 to-pink-600 hover:from-orange-400 hover:to-pink-500 text-white cursor-pointer shadow-[0_0_35px_rgba(234,88,12,0.5)] hover:shadow-[0_0_50px_rgba(234,88,12,0.7)]'
            }`}
          >
            {isRendering ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate Exterior Render
              </>
            )}
          </button>
          <p className="text-[8px] text-center text-orange-900/50 font-mono mt-2 uppercase tracking-wider">
            GPT Image 2 · Image-to-Image · Ultra-Photorealistic
          </p>
        </div>
      </div>
    </div>
  );
}
