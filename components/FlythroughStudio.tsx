'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Video, Play, Pause, Download, Sparkles, RefreshCw, UploadCloud,
  Film, Music, Clock, Layers, Plus, Trash2, Check, ArrowRight,
  Loader2, Eye, Volume2, VolumeX, Maximize2, ShieldCheck, ChevronRight,
  Building2, Camera, Compass, Sliders, Disc
} from 'lucide-react';

interface ReferenceImage {
  id: string;
  base64: string;
  fileName: string;
}

interface ShotPlan {
  shotNumber: number;
  startTime: string;
  endTime: string;
  duration: number;
  title: string;
  cameraMotion: string;
  angleType: string;
  prompt: string;
  focalLength: string;
  sourceImageBase64?: string;
  videoUrl?: string;
  status?: 'pending' | 'rendering' | 'done' | 'error';
}

interface FlythroughReel {
  id: string;
  title: string;
  narrativeArc: string;
  duration: number; // 60, 120, 180
  audioMood: string;
  audioTrack: {
    title: string;
    genre: string;
    audioUrl: string;
  };
  shots: ShotPlan[];
  createdAt: number;
}

const AUDIO_TRACKS = [
  {
    id: 'luxury_orchestral',
    title: '🎻 Luxury Orchestral',
    desc: 'Grand sweeping violins & horns (Architectural Digest style)',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
  },
  {
    id: 'sunset_piano',
    title: '🌇 Sunset Piano & Strings',
    desc: 'Emotional piano arpeggios with warm twilight cello swells',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
  },
  {
    id: 'modern_ambient',
    title: '🌆 Cyberpunk Metropolis',
    desc: 'Deep sub-bass swells & shimmering synthesizer textures',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3',
  },
  {
    id: 'lofi_architecture',
    title: '☕ Lofi Minimalist',
    desc: 'Relaxing Rhodes chords, vinyl warmth & mellow beats',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f77c30.mp3',
  },
];

export default function FlythroughStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);

  // 1. User Uploads
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // 2. Flythrough Parameters
  const [selectedDuration, setSelectedDuration] = useState<60 | 120 | 180>(60);
  const [selectedAudioMood, setSelectedAudioMood] = useState<string>('luxury_orchestral');
  const [videoEngine, setVideoEngine] = useState<'wan_2_1' | 'kling_1_6' | 'seedance'>('wan_2_1');
  const [expandAnglesFirst, setExpandAnglesFirst] = useState<boolean>(true);
  const [customAtmosphere, setCustomAtmosphere] = useState<string>('');

  // 3. Pipeline Execution State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState<'idle' | 'scripting' | 'expanding_angles' | 'rendering_shots' | 'stitching' | 'done'>('idle');
  const [stageProgressText, setStageProgressText] = useState<string>('');
  const [activeShotlist, setActiveShotlist] = useState<ShotPlan[]>([]);
  const [expandedAngleStills, setExpandedAngleStills] = useState<Array<{ id: string; base64: string; label: string }>>([]);
  const [completedShotCount, setCompletedShotCount] = useState<number>(0);
  const [activeReel, setActiveReel] = useState<FlythroughReel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 4. Video Player State
  const [currentPlayingShotIdx, setCurrentPlayingShotIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [history, setHistory] = useState<FlythroughReel[]>([]);

  const handleInitialUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const readPromises = Array.from(files).map((file) => {
      return new Promise<ReferenceImage>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          resolve({
            id: Math.random().toString(36).slice(2),
            base64: ev.target?.result as string,
            fileName: file.name,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then((newItems) => {
      setReferenceImages(newItems);
      if (newItems.length > 0) setActivePreviewId(newItems[0].id);
      setActiveReel(null);
      setErrorMessage(null);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAppendUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const readPromises = Array.from(files).map((file) => {
      return new Promise<ReferenceImage>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          resolve({
            id: Math.random().toString(36).slice(2),
            base64: ev.target?.result as string,
            fileName: file.name,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises).then((newItems) => {
      setReferenceImages((prev) => [...prev, ...newItems]);
    });
    if (appendFileInputRef.current) appendFileInputRef.current.value = '';
  };

  const handleRemoveImage = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReferenceImages((prev) => {
      const filtered = prev.filter((img) => img.id !== idToRemove);
      if (activePreviewId === idToRemove && filtered.length > 0) {
        setActivePreviewId(filtered[0].id);
      }
      return filtered;
    });
  };

  // ── MASTER FLYTHROUGH PIPELINE GENERATOR ────────────────────────────────────
  const handleStartFlythroughGeneration = async () => {
    if (referenceImages.length === 0 || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setActiveReel(null);
    setCompletedShotCount(0);
    setCurrentPlayingShotIdx(0);

    try {
      // ── STAGE 1: AI CREATIVE DIRECTOR (SHOTLIST SCRIPT) ─────────────────────
      setGenerationStage('scripting');
      setStageProgressText(`AI Director is writing a ${selectedDuration}s cinematic shotlist...`);

      const directorRes = await fetch('/api/flythrough-director', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration: selectedDuration,
          theme: customAtmosphere || 'ultra_luxury_photorealism',
          timeOfDay: 'day',
          buildingNotes: 'Modern luxury residential high-rise tower with terracotta/sandstone facade, repetitive balconies, retail podium, and pitched roof crown pavilions.',
        }),
      });

      const directorData = await directorRes.json();
      if (!directorData.shots || directorData.shots.length === 0) {
        throw new Error(directorData.error || 'Failed to generate director shotlist.');
      }

      const initialShots: ShotPlan[] = directorData.shots.map((s: any) => ({
        ...s,
        status: 'pending',
      }));
      setActiveShotlist(initialShots);

      // ── STAGE 2: EXPAND EXTRA ANGLES FIRST (IF ENABLED) ─────────────────────
      let masterAnglePool: Array<{ base64: string; label: string }> = referenceImages.map((img, i) => ({
        base64: img.base64,
        label: `Uploaded Angle #${i + 1}`,
      }));

      if (expandAnglesFirst) {
        setGenerationStage('expanding_angles');
        setStageProgressText('Synthesizing 4 new unique 8K angle stills (Drone 80m, Penthouse, Side Profile, Plaza)...');

        try {
          const expandRes = await fetch('/api/flythrough-expand-angles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referenceImages: referenceImages.map((img) => img.base64),
              requestedAnglesCount: 4,
            }),
          });
          const expandData = await expandRes.json();
          if (expandData.success && Array.isArray(expandData.angles)) {
            setExpandedAngleStills(expandData.angles);
            const newPool = expandData.angles.map((a: any) => ({
              base64: a.base64,
              label: a.label,
            }));
            masterAnglePool = [...masterAnglePool, ...newPool];
          }
        } catch (angleErr) {
          console.warn('Angle expansion skipped, continuing with uploaded references...', angleErr);
        }
      }

      // ── STAGE 3: PARALLEL VIDEO SHOT GENERATION (WAN 2.1) ───────────────────
      setGenerationStage('rendering_shots');
      const totalShots = initialShots.length;
      let completedCount = 0;

      const renderedShots: ShotPlan[] = [];

      // Process shots in parallel batches of 3
      const BATCH_SIZE = 3;
      for (let i = 0; i < totalShots; i += BATCH_SIZE) {
        const currentBatch = initialShots.slice(i, i + BATCH_SIZE);

        const batchPromises = currentBatch.map(async (shot, batchIdx) => {
          const shotIndex = i + batchIdx;
          const assignedAngle = masterAnglePool[shotIndex % masterAnglePool.length];

          setStageProgressText(`Rendering video shots (${completedCount + 1}/${totalShots}) via ${videoEngine.toUpperCase()}...`);

          try {
            const shotRes = await fetch('/api/flythrough-generate-shot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64: assignedAngle.base64,
                prompt: shot.prompt,
                engine: videoEngine,
                duration: 10,
                aspectRatio: '16:9',
              }),
            });

            const shotData = await shotRes.json();
            if (shotData.videoUrl) {
              completedCount++;
              setCompletedShotCount(completedCount);
              return {
                ...shot,
                videoUrl: shotData.videoUrl,
                sourceImageBase64: assignedAngle.base64,
                status: 'done' as const,
              };
            } else {
              throw new Error(shotData.error || 'Shot render returned no video URL');
            }
          } catch (err: any) {
            console.error(`Error on shot #${shot.shotNumber}:`, err);
            return {
              ...shot,
              sourceImageBase64: assignedAngle.base64,
              status: 'error' as const,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        renderedShots.push(...batchResults);
        setActiveShotlist([...renderedShots]);
      }

      // ── STAGE 4: AUDIO SYNC & STITCHING ─────────────────────────────────────
      setGenerationStage('stitching');
      setStageProgressText('Synchronizing soundtrack & applying smooth crossfade dissolves...');

      const validShots = renderedShots.filter((s) => s.videoUrl);
      if (validShots.length === 0) {
        throw new Error('All video shot generations failed. Please check FAL key or connection.');
      }

      const stitchRes = await fetch('/api/flythrough-stitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shots: validShots,
          audioMood: selectedAudioMood,
          filmTitle: directorData.filmTitle || 'Architectural Masterpiece Flythrough',
          duration: selectedDuration,
        }),
      });

      const stitchData = await stitchRes.json();
      const finalReel: FlythroughReel = {
        id: Math.random().toString(36).slice(2),
        title: directorData.filmTitle || 'Architectural Masterpiece Flythrough',
        narrativeArc: directorData.narrativeArc || 'Cinematic architectural journey from street level to rooftop crown.',
        duration: selectedDuration,
        audioMood: selectedAudioMood,
        audioTrack: stitchData.masterVideo?.audioTrack || AUDIO_TRACKS[0],
        shots: validShots,
        createdAt: Date.now(),
      };

      setActiveReel(finalReel);
      setHistory((prev) => [finalReel, ...prev]);
      setGenerationStage('done');
    } catch (err: any) {
      console.error('[FlythroughStudio] Pipeline Failed:', err);
      setErrorMessage(err.message || 'Flythrough generation encountered an error.');
      setGenerationStage('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  // Video sequence player handling
  useEffect(() => {
    if (!activeReel || activeReel.shots.length === 0) return;

    const videoEl = videoPlayerRef.current;
    if (!videoEl) return;

    const handleEnded = () => {
      setCurrentPlayingShotIdx((prev) => (prev + 1) % activeReel.shots.length);
    };

    videoEl.addEventListener('ended', handleEnded);
    return () => videoEl.removeEventListener('ended', handleEnded);
  }, [activeReel]);

  const currentPreview = referenceImages.find((img) => img.id === activePreviewId) || referenceImages[0];
  const activeShot = activeReel ? activeReel.shots[currentPlayingShotIdx] : null;

  return (
    <div className="flex-1 flex flex-col xl:flex-row bg-[#08070b] text-white min-h-[calc(100vh-4rem)]">

      {/* ── LEFT MAIN WORKSPACE ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-4 lg:p-6 gap-6 overflow-y-auto max-w-7xl mx-auto w-full custom-scrollbar">

        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-orange-950/60 pb-4">
          <div>
            <h1 className="text-lg lg:text-xl font-black uppercase tracking-[3px] text-white flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                <Video size={20} />
              </span>
              Architectural Flythrough Video Studio
            </h1>
            <p className="text-[10px] text-amber-400/60 font-mono mt-1">
              Automated 1m–3m Commercial Films · Multi-Angle Keyframe Expansion · Audio-Synced Master Reel
            </p>
          </div>

          {referenceImages.length > 0 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[9px] text-orange-400 hover:text-orange-200 uppercase font-bold cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-950/30 border border-orange-500/30"
            >
              <RefreshCw size={11} /> Replace Images
            </button>
          )}
        </div>

        {referenceImages.length > 0 ? (
          <div className="flex flex-col gap-6">

            {/* Top Grid: 3D Reference Images + Master Cinema Player */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Panel 1: Uploaded Reference Photos */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                    📐 Reference Images ({referenceImages.length} Uploaded)
                  </span>
                  <button
                    onClick={() => appendFileInputRef.current?.click()}
                    className="text-[9px] text-amber-300 hover:text-white uppercase font-bold cursor-pointer flex items-center gap-1 bg-amber-950/50 border border-amber-500/40 px-2.5 py-1 rounded-md"
                  >
                    <Plus size={11} /> Add Angle
                  </button>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-amber-500/30 bg-black/60 shadow-lg flex items-center justify-center p-2 min-h-[380px]">
                  {currentPreview && (
                    <img
                      src={currentPreview.base64}
                      alt="Reference View"
                      className="w-full max-h-[440px] object-contain rounded-lg"
                    />
                  )}
                  <div className="absolute bottom-3 left-3 bg-black/85 backdrop-blur px-2.5 py-1 rounded-md text-[9px] font-mono text-amber-300 border border-amber-500/30 truncate max-w-[70%]">
                    📁 {currentPreview?.fileName || 'Building Perspective'}
                  </div>
                </div>

                {/* Thumbnails */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                  {referenceImages.map((img, idx) => {
                    const isSelected = img.id === activePreviewId;
                    return (
                      <div
                        key={img.id}
                        onClick={() => setActivePreviewId(img.id)}
                        className={`group/thumb relative rounded-lg overflow-hidden border cursor-pointer shrink-0 transition-all w-24 aspect-[4/3] ${
                          isSelected
                            ? 'border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                            : 'border-orange-950/60 hover:border-amber-500/50 bg-black/60'
                        }`}
                      >
                        <img
                          src={img.base64}
                          alt={`Reference #${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {referenceImages.length > 1 && (
                          <button
                            onClick={(e) => handleRemoveImage(img.id, e)}
                            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/80 hover:bg-red-500 text-gray-300 hover:text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1 py-0.5 text-[7px] text-gray-300 font-mono truncate">
                          Angle #{idx + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Panel 2: Master Cinema Video Player */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                    🎬 1080p Master Commercial Film
                  </span>
                  {activeReel && (
                    <span className="text-[9px] font-mono text-emerald-400">
                      ✓ {activeReel.duration}s Reel ({activeReel.shots.length} Shots)
                    </span>
                  )}
                </div>

                <div className="relative rounded-xl overflow-hidden border border-amber-500/40 bg-black/80 shadow-2xl flex items-center justify-center p-2 min-h-[380px]">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center animate-pulse">
                      <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                        <Loader2 size={30} className="animate-spin text-amber-400" />
                      </div>
                      <div className="flex flex-col gap-1 max-w-sm">
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-widest font-mono">
                          Generating {selectedDuration}s Flythrough...
                        </span>
                        <span className="text-[9px] text-gray-400 font-mono">
                          {stageProgressText || 'Rendering multi-shot architectural tour...'}
                        </span>
                      </div>
                    </div>
                  ) : activeReel && activeShot?.videoUrl ? (
                    <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <video
                        ref={videoPlayerRef}
                        src={activeShot.videoUrl}
                        autoPlay
                        muted={isMuted}
                        className="w-full max-h-[440px] object-contain rounded-lg shadow-inner"
                      />

                      {/* Floating Audio Track Player (Hidden/Synced) */}
                      {activeReel.audioTrack?.audioUrl && (
                        <audio
                          ref={audioPlayerRef}
                          src={activeReel.audioTrack.audioUrl}
                          loop
                          autoPlay
                          muted={isMuted}
                        />
                      )}

                      {/* HUD Overlay with Shot Info */}
                      <div className="absolute top-3 left-3 bg-black/85 backdrop-blur px-2.5 py-1 rounded-md text-[9px] font-mono text-amber-300 border border-amber-500/30 flex items-center gap-2">
                        <span>Shot {currentPlayingShotIdx + 1}/{activeReel.shots.length}: {activeShot.title}</span>
                        <span className="text-gray-400">({activeShot.focalLength})</span>
                      </div>

                      {/* Controls Bar */}
                      <div className="absolute bottom-3 inset-x-3 bg-black/90 backdrop-blur rounded-xl p-2 flex items-center justify-between border border-white/10">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (videoPlayerRef.current) {
                                if (videoPlayerRef.current.paused) {
                                  videoPlayerRef.current.play();
                                  audioPlayerRef.current?.play();
                                  setIsPlaying(true);
                                } else {
                                  videoPlayerRef.current.pause();
                                  audioPlayerRef.current?.pause();
                                  setIsPlaying(false);
                                }
                              }
                            }}
                            className="p-1.5 rounded-lg bg-amber-500 text-black hover:bg-amber-400 cursor-pointer"
                          >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                          </button>

                          <button
                            onClick={() => setIsMuted(!isMuted)}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 cursor-pointer"
                            title={isMuted ? 'Unmute' : 'Mute'}
                          >
                            {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                          </button>

                          <span className="text-[8px] font-mono text-amber-400/80 truncate max-w-[140px]">
                            🎵 {activeReel.audioTrack?.title || 'Cinematic Track'}
                          </span>
                        </div>

                        {/* Shot Timeline Selector */}
                        <div className="flex items-center gap-1">
                          {activeReel.shots.map((shot, idx) => (
                            <button
                              key={shot.shotNumber}
                              onClick={() => setCurrentPlayingShotIdx(idx)}
                              className={`w-5 h-5 rounded text-[8px] font-mono font-bold transition-all cursor-pointer ${
                                currentPlayingShotIdx === idx
                                  ? 'bg-amber-400 text-black shadow'
                                  : 'bg-white/10 text-gray-400 hover:text-white'
                              }`}
                              title={`Jump to Shot #${idx + 1}`}
                            >
                              {idx + 1}
                            </button>
                          ))}
                        </div>

                        {/* Download Active Shot Video */}
                        <a
                          href={activeShot.videoUrl}
                          download={`flythrough-shot-${currentPlayingShotIdx + 1}.mp4`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 hover:text-white text-[8px] font-mono flex items-center gap-1"
                        >
                          <Download size={11} /> Download MP4
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                      <Film size={32} className="text-amber-500/40" />
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">
                        Ready to Generate Master Flythrough
                      </span>
                      <p className="text-[9px] text-gray-600 font-mono max-w-xs">
                        Select duration (1m, 2m, or 3m) and audio track in the sidebar, then click Generate Film!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 font-mono">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Expanded Keyframe Stills Gallery (if synthesized) */}
            {expandedAngleStills.length > 0 && (
              <div className="flex flex-col gap-2.5 p-4 rounded-xl border border-amber-500/20 bg-black/40">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono flex items-center gap-1.5">
                    ✨ Synthesized Unique Camera Keyframes ({expandedAngleStills.length} Extra Angles)
                  </span>
                  <span className="text-[8px] text-gray-400 font-mono">Generated for zero repetitive shots</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {expandedAngleStills.map((still) => (
                    <div key={still.id} className="relative rounded-lg overflow-hidden border border-amber-500/30 bg-black/80 aspect-[16/9]">
                      <img src={still.base64} alt={still.label} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/80 px-1.5 py-0.5 text-[7px] text-amber-300 font-mono truncate">
                        {still.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Storyboard Shot Breakdown Grid */}
            {activeShotlist.length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-orange-950/60">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2 font-mono">
                    <Film size={13} className="text-amber-400" /> Director Storyboard Breakdown ({activeShotlist.length} Shots)
                  </h3>
                  <span className="text-[9px] text-amber-400/80 font-mono">
                    {completedShotCount}/{activeShotlist.length} Shots Rendered
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeShotlist.map((shot, idx) => (
                    <div
                      key={shot.shotNumber}
                      onClick={() => shot.videoUrl && setCurrentPlayingShotIdx(idx)}
                      className={`rounded-xl border p-3 flex flex-col gap-2 transition-all cursor-pointer ${
                        currentPlayingShotIdx === idx && activeReel
                          ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                          : 'border-orange-950/60 bg-black/60 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[8px] font-mono border-b border-white/5 pb-1">
                        <span className="text-amber-400 font-bold uppercase">
                          Shot #{shot.shotNumber} ({shot.startTime}–{shot.endTime})
                        </span>
                        <span className="text-gray-400">{shot.focalLength}</span>
                      </div>

                      <div className="aspect-video relative rounded-lg overflow-hidden bg-black/80 flex items-center justify-center">
                        {shot.videoUrl ? (
                          <video src={shot.videoUrl} className="w-full h-full object-cover" muted />
                        ) : shot.sourceImageBase64 ? (
                          <img src={shot.sourceImageBase64} alt={shot.title} className="w-full h-full object-cover opacity-60" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-gray-500">
                            <Clock size={16} />
                            <span className="text-[8px] font-mono">Queued</span>
                          </div>
                        )}
                        {shot.status === 'done' && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow">
                            <Check size={10} />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold text-white truncate">{shot.title}</span>
                        <p className="text-[7px] text-gray-400 line-clamp-2 font-mono">{shot.prompt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flythrough Reel History */}
            {history.length > 0 && (
              <div className="flex flex-col gap-3 pt-4 border-t border-orange-950/60">
                <h4 className="text-xs font-bold uppercase tracking-[2px] text-white flex items-center gap-2">
                  <Eye size={12} className="text-amber-400" />
                  Generated Flythrough Reels ({history.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {history.map((reel) => (
                    <div
                      key={reel.id}
                      onClick={() => {
                        setActiveReel(reel);
                        setActiveShotlist(reel.shots);
                        setCurrentPlayingShotIdx(0);
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-1.5 ${
                        activeReel?.id === reel.id
                          ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                          : 'border-orange-950/60 bg-black/60 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[8px] font-mono text-amber-300 font-bold uppercase">
                        <span>🎬 {reel.duration}s Master Film</span>
                        <span>{reel.shots.length} Shots</span>
                      </div>
                      <span className="text-[10px] font-bold text-white truncate">{reel.title}</span>
                      <p className="text-[7px] text-gray-400 font-mono truncate">🎵 {reel.audioTrack?.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto py-16">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-950/60 to-orange-950/40 border border-amber-500/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <Video size={36} className="text-amber-400" />
            </div>
            <h2 className="text-base font-black uppercase tracking-[3px] text-white mb-2">
              Upload 1 to 3 Building Angles
            </h2>
            <p className="text-xs text-amber-400/60 uppercase tracking-wider leading-relaxed mb-8 font-mono">
              Upload 3 reference views of your building. The AI Director will expand keyframes, plan a multi-shot storyboard, and generate a continuous <strong>1 to 3 minute 1080p commercial film with audio</strong>!
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)] cursor-pointer"
            >
              <UploadCloud size={16} /> Choose 3D Reference Images (1–3)
            </button>
            <p className="text-[9px] text-gray-500 font-mono mt-3">
              Supports JPEG / PNG building renders and SketchUp screenshots.
            </p>
          </div>
        )}

        {/* Hidden File Inputs */}
        <input
          type="file"
          accept="image/*"
          multiple
          ref={fileInputRef}
          onChange={handleInitialUpload}
          className="hidden"
        />
        <input
          type="file"
          accept="image/*"
          multiple
          ref={appendFileInputRef}
          onChange={handleAppendUpload}
          className="hidden"
        />
      </div>

      {/* ── RIGHT / DIRECTOR CONTROLS SIDEBAR ────────────────────────────────── */}
      <div className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-orange-950/60 bg-[#060509]/95 backdrop-blur flex flex-col shrink-0">

        {/* Sidebar Header */}
        <div className="p-5 border-b border-orange-950/60 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[2.5px] text-white flex items-center gap-2">
              <Film size={13} className="text-amber-400" /> Director Configuration
            </h3>
            <p className="text-[9px] text-amber-400/50 mt-0.5">Duration · Soundtrack · Video Engine</p>
          </div>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar">

          {/* 1. Duration Selection */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
              <Clock size={13} /> 1. Select Film Duration
            </span>

            <div className="grid grid-cols-3 gap-2">
              {[
                { dur: 60 as const, label: '1 Min', shots: '6 Shots', cost: '~$0.60 (₹50)' },
                { dur: 120 as const, label: '2 Min', shots: '12 Shots', cost: '~$1.25 (₹105)' },
                { dur: 180 as const, label: '3 Min', shots: '18 Shots', cost: '~$1.85 (₹155)' },
              ].map((opt) => (
                <button
                  key={opt.dur}
                  type="button"
                  onClick={() => setSelectedDuration(opt.dur)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col gap-1 ${
                    selectedDuration === opt.dur
                      ? 'bg-gradient-to-br from-amber-500/25 to-orange-500/20 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)] text-amber-200'
                      : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/30'
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-wider">{opt.label}</span>
                  <span className="text-[8px] font-mono text-amber-400/90 font-bold">{opt.shots}</span>
                  <span className="text-[7px] font-mono text-gray-500">{opt.cost}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Soundtrack Audio Theme */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
              <Music size={13} /> 2. Audio Soundtrack Mood
            </span>

            <div className="flex flex-col gap-1.5">
              {AUDIO_TRACKS.map((track) => {
                const isSelected = selectedAudioMood === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => setSelectedAudioMood(track.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/15 border-amber-400 text-amber-200'
                        : 'bg-black/40 border-white/10 text-gray-400 hover:border-amber-500/30 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 truncate">
                      <span className="text-[10px] font-bold truncate">{track.title}</span>
                      <span className="text-[7px] text-gray-400 font-mono truncate">{track.desc}</span>
                    </div>
                    {isSelected && <Check size={12} className="text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Keyframe Angle Expansion Toggle */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
                <Layers size={13} /> 3. Synthesize Extra Angles
              </span>
              <input
                type="checkbox"
                checked={expandAnglesFirst}
                onChange={(e) => setExpandAnglesFirst(e.target.checked)}
                className="w-4 h-4 accent-amber-500 cursor-pointer"
              />
            </div>
            <p className="text-[8px] text-gray-400 font-mono leading-relaxed">
              Generates 4 extra 8K camera stills (Drone 80m, Penthouse, Side Profile, Plaza) for <strong>~$0.12 total</strong> to guarantee zero repetitive starting shots across the film.
            </p>
          </div>

          {/* 4. Video Generation Engine */}
          <div className="flex flex-col gap-2.5 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
              <Sliders size={13} /> 4. Video Engine
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVideoEngine('wan_2_1')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  videoEngine === 'wan_2_1'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-black/40 border-white/10 text-gray-400'
                }`}
              >
                <div className="text-[9px] font-bold">Wan 2.1 (SOTA)</div>
                <div className="text-[7px] text-amber-400/80 font-mono">Best Quality &amp; Lowest Cost</div>
              </button>

              <button
                type="button"
                onClick={() => setVideoEngine('kling_1_6')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  videoEngine === 'kling_1_6'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-black/40 border-white/10 text-gray-400'
                }`}
              >
                <div className="text-[9px] font-bold">Kling 1.6</div>
                <div className="text-[7px] text-gray-400 font-mono">Smooth Cinema Jib</div>
              </button>
            </div>
          </div>

          {/* 5. Custom Atmospheric Notes */}
          <div className="flex flex-col gap-2 border-t border-orange-950/60 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 flex items-center gap-1.5 font-mono">
              <Sparkles size={12} /> 5. Custom Atmosphere Notes
            </span>
            <input
              type="text"
              value={customAtmosphere}
              onChange={(e) => setCustomAtmosphere(e.target.value)}
              placeholder="e.g. Golden hour sunset glints, palm trees, Ferrari valet"
              className="w-full bg-black/60 border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2 text-[10px] text-amber-200 focus:outline-none font-mono"
            />
          </div>

        </div>

        {/* Generate Master Film Button */}
        <div className="p-5 border-t border-orange-950/60 shrink-0">
          <button
            type="button"
            onClick={handleStartFlythroughGeneration}
            disabled={referenceImages.length === 0 || isGenerating}
            className={`w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all ${
              referenceImages.length === 0 || isGenerating
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700'
                : 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 hover:from-amber-300 hover:to-orange-400 text-black cursor-pointer shadow-[0_0_30px_rgba(245,158,11,0.5)]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Director is Producing Film...
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Generate {selectedDuration / 60}m Master Flythrough Reel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
