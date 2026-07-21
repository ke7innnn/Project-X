'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, X, SkipForward, SkipBack, Share2 } from 'lucide-react';

interface Scene {
  sceneType: string;
  imageIds: string[];
  title: string;
  caption: string;
  transitionIn: string;
  motion: string;
  durationMs: number;
}

interface Storyboard {
  title: string;
  audioMood: string;
  scenes: Scene[];
}

interface AnimatedPlayerProps {
  storyboard: Storyboard;
  images: { id: string; url: string }[];
  onClose?: () => void;
  isShared?: boolean;
}

export default function AnimatedPlayer({ storyboard, images, onClose, isShared = false }: AnimatedPlayerProps) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [preloaded, setPreloaded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedPausedRef = useRef<number>(0);

  const scenes = storyboard.scenes || [];
  const currentScene = scenes[currentSceneIndex];

  // Resolve active image url for current scene (with ultra-resilient fallbacks)
  const getSceneImageUrl = (scene: Scene, index: number) => {
    if (!scene) return null;
    
    // 1. Check if imageIds contains a direct URL or matching ID
    if (scene.imageIds && scene.imageIds.length > 0) {
      const targetId = scene.imageIds[0];
      if (typeof targetId === 'string' && (targetId.startsWith('http') || targetId.startsWith('data:') || targetId.startsWith('blob:') || targetId.startsWith('/'))) {
        return targetId;
      }
      const match = images.find(img => img.id === targetId || img.url === targetId);
      if (match?.url) return match.url;
    }

    // 2. Fallback to image index in provided images array
    if (images && images.length > 0) {
      const fallbackImg = images[index % images.length];
      if (fallbackImg?.url) return fallbackImg.url;
    }

    // 3. Guaranteed reliable architectural photo fallback (never black)
    return 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80';
  };

  // Preload all slides images to guarantee smooth transitions
  useEffect(() => {
    let loadedCount = 0;
    const urlsToLoad = scenes
      .map((s, i) => getSceneImageUrl(s, i))
      .filter((url): url is string => !!url);

    if (urlsToLoad.length === 0) {
      setPreloaded(true);
      return;
    }

    urlsToLoad.forEach(url => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loadedCount++;
        if (loadedCount === urlsToLoad.length) {
          setPreloaded(true);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === urlsToLoad.length) {
          setPreloaded(true);
        }
      };
    });

    // Fallback reduced motion detection
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [scenes, images]);

  // Audio configuration
  useEffect(() => {
    // Standard synthetic ambient pad sound loop
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav'); // cinematic transition pad synth
    audio.loop = true;
    audio.volume = 0.35;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Sync mute state with Audio Element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      if (!isMuted && isPlaying) {
        audioRef.current.play().catch(() => {
          // Blocked by browser security autoplay rules
          setIsMuted(true);
        });
      }
    }
  }, [isMuted, isPlaying]);

  // Trigger sound effect on transitions
  const playTransitionSound = () => {
    if (!isMuted && audioRef.current) {
      const effect = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-84.wav'); // subtle sweep
      effect.volume = 0.15;
      effect.play().catch(() => {});
    }
  };

  // Main playback logic
  useEffect(() => {
    if (!isPlaying || !preloaded || scenes.length === 0) {
      clearInterval(progressIntervalRef.current);
      clearTimeout(timerRef.current);
      return;
    }

    const duration = currentScene?.durationMs || 3000;
    startTimeRef.current = Date.now() - elapsedPausedRef.current;

    // Slide auto-advance timer
    const timeRemaining = duration - elapsedPausedRef.current;
    timerRef.current = setTimeout(() => {
      playTransitionSound();
      setCurrentSceneIndex(prev => (prev + 1) % scenes.length);
      elapsedPausedRef.current = 0;
      setProgress(0);
    }, timeRemaining);

    // Progress bar ticker
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
    }, 16); // 60fps ticker

    return () => {
      clearInterval(progressIntervalRef.current);
      clearTimeout(timerRef.current);
    };
  }, [currentSceneIndex, isPlaying, preloaded, scenes]);

  const handlePauseToggle = () => {
    if (isPlaying) {
      // Pause
      clearInterval(progressIntervalRef.current);
      clearTimeout(timerRef.current);
      elapsedPausedRef.current = Date.now() - startTimeRef.current;
      setIsPlaying(false);
    } else {
      // Play
      setIsPlaying(true);
    }
  };

  const handleNext = () => {
    playTransitionSound();
    setCurrentSceneIndex(prev => (prev + 1) % scenes.length);
    elapsedPausedRef.current = 0;
    setProgress(0);
    setIsPlaying(true);
  };

  const handlePrev = () => {
    playTransitionSound();
    setCurrentSceneIndex(prev => (prev - 1 + scenes.length) % scenes.length);
    elapsedPausedRef.current = 0;
    setProgress(0);
    setIsPlaying(true);
  };

  const handleShare = () => {
    const url = `${window.location.origin}/presentation/share?id=${window.location.search.split('id=')[1]?.split('&')[0] || ''}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Keyboard navigation overrides
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === ' ') {
        e.preventDefault();
        handlePauseToggle();
      }
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSceneIndex]);

  if (scenes.length === 0) return null;

  // Determine motion animation variants
  const getMotionVariant = (motionType: string): Record<string, any> => {
    if (reducedMotion) return {};
    const dur = (currentScene.durationMs / 1000) + 1;
    switch (motionType) {
      case 'kenBurnsIn':
        return { transform: 'scale(1.08)', transition: { duration: dur, ease: 'easeOut' as const } };
      case 'kenBurnsOut':
        return { transform: 'scale(0.96)', transition: { duration: dur, ease: 'easeOut' as const } };
      case 'panLeft':
        return { transform: 'translateX(-4%) scale(1.04)', transition: { duration: dur, ease: 'linear' as const } };
      case 'panRight':
        return { transform: 'translateX(4%) scale(1.04)', transition: { duration: dur, ease: 'linear' as const } };
      case 'parallax':
        return { transform: 'translateY(-3%) scale(1.05)', transition: { duration: dur, ease: 'easeOut' as const } };
      default:
        return {};
    }
  };

  // Transition variants mapping — typed as any to avoid Framer Motion's strict Easing union
  const getTransitionStyle = (transType: string): Record<string, any> => {
    if (reducedMotion) return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
    
    switch (transType) {
      case 'scaleMorph':
        return {
          initial: { opacity: 0, scale: 0.9, filter: 'blur(10px)' },
          animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
          exit: { opacity: 0, scale: 1.1, filter: 'blur(10px)' },
          transition: { duration: 0.8, ease: 'easeInOut' as const }
        };
      case 'maskWipe':
        return {
          initial: { clipPath: 'inset(0 100% 0 0)' },
          animate: { clipPath: 'inset(0 0% 0 0)' },
          exit: { clipPath: 'inset(0 0 0 100%)' },
          transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] }
        };
      case 'whipPan':
        return {
          initial: { x: '100%', filter: 'blur(4px)' },
          animate: { x: '0%', filter: 'blur(0px)' },
          exit: { x: '-100%', filter: 'blur(4px)' },
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] }
        };
      case 'parallaxSlide':
        return {
          initial: { x: '50%', opacity: 0 },
          animate: { x: '0%', opacity: 1 },
          exit: { x: '-30%', opacity: 0 },
          transition: { duration: 0.8, ease: 'easeOut' as const }
        };
      case 'push':
        return {
          initial: { x: '100%' },
          animate: { x: '0%' },
          exit: { x: '-100%' },
          transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] as [number,number,number,number] }
        };
      case 'lightSweep':
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.6, ease: 'easeIn' as const }
        };
      default: // fade
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.6, ease: 'easeOut' as const }
        };
    }
  };

  const imageUrl = getSceneImageUrl(currentScene, currentSceneIndex);

  return (
    <div className="fixed inset-0 bg-[#060608] z-50 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar Indicators & Timeline Controls */}
      <div className="absolute top-0 inset-x-0 p-6 bg-gradient-to-b from-black/80 to-transparent z-40 flex flex-col gap-4">
        {/* Storyboard progress dots */}
        <div className="flex gap-1.5 w-full">
          {scenes.map((_, idx) => {
            const isCompleted = idx < currentSceneIndex;
            const isActive = idx === currentSceneIndex;
            return (
              <div key={idx} className="flex-1 h-[2px] bg-white/10 rounded-full overflow-hidden relative">
                {isCompleted && <div className="absolute inset-0 bg-white" />}
                {isActive && (
                  <div
                    className="absolute inset-y-0 left-0 bg-white transition-all duration-75"
                    style={{ width: `${progress}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Branding header / title */}
        <div className="flex justify-between items-center text-white">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9A96A] font-mono font-bold">CINEMATIC TIMELINE</span>
            <h1 className="text-sm font-semibold tracking-wider font-sans truncate max-w-sm">
              {storyboard.title || 'ARCHITECTURAL PORTFOLIO'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMuted(prev => !prev)}
              className="p-2 border border-white/10 rounded-full bg-black/40 hover:bg-black/60 transition-all text-white cursor-pointer"
              title={isMuted ? "Unmute Ambient Audio" : "Mute Audio"}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            {!isShared && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 rounded-full bg-black/40 hover:bg-black/60 transition-all text-white font-mono text-[9px] uppercase tracking-wider cursor-pointer"
              >
                <Share2 size={11} />
                {copiedLink ? 'Copied!' : 'Share Link'}
              </button>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="p-2 border border-white/10 rounded-full bg-black/40 hover:bg-black/60 transition-all text-white cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Transitions & Motions Screen Canvas */}
      <div className="flex-1 w-full h-full relative flex items-center justify-center">
        {!preloaded ? (
          <div className="flex flex-col items-center justify-center gap-3 text-zinc-500 text-xs font-mono">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>PRELOADING CINEMATIC STORYBOARD...</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <motion.div
              key={currentSceneIndex}
              {...(getTransitionStyle(currentScene.transitionIn) as any)}
              className="absolute inset-0 flex items-center justify-center"
            >
              {imageUrl ? (
                <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
                  <motion.img
                    src={imageUrl}
                    initial={{ transform: 'scale(1)' }}
                    animate={getMotionVariant(currentScene.motion) as any}
                    className="w-full h-full object-cover select-none"
                    alt={currentScene.title}
                  />
                  {/* Subtle Linear Legibility Scrim */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                </div>
              ) : (
                /* Text-only palate cleanser / Cover divider slide style */
                <div className="w-full h-full bg-[#0B0B0D] flex flex-col justify-center items-center text-center p-12 relative">
                  <div className="absolute inset-0 bg-radial-gradient from-zinc-900 via-transparent to-transparent opacity-40" />
                  <div className="h-0.5 w-16 bg-[#C9A96A]/60 mb-6" />
                </div>
              )}

              {/* Title & Caption Overlays (animated staggered) */}
              <div className="absolute bottom-16 inset-x-0 px-12 md:px-20 text-left z-10 flex flex-col gap-2 pointer-events-none max-w-4xl">
                <motion.span
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="text-[10px] tracking-[0.25em] font-mono text-[#C9A96A] uppercase font-bold"
                >
                  {currentScene.sceneType.replace('_', ' ')} // SCENE {(currentSceneIndex + 1).toString().padStart(2, '0')}
                </motion.span>
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="text-3xl md:text-5xl font-archivo font-bold leading-[1.05] text-white uppercase tracking-wider max-w-2xl"
                >
                  {currentScene.title}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55, duration: 0.5 }}
                  className="text-xs md:text-sm text-zinc-300 font-sans tracking-wide max-w-3xl leading-relaxed mt-1"
                >
                  {currentScene.caption}
                </motion.p>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* User Interaction Left / Right regions */}
        <div className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize z-20" onClick={handlePrev} />
        <div className="absolute inset-y-0 right-0 w-1/4 cursor-e-resize z-20" onClick={handleNext} />
        <div className="absolute inset-y-0 left-1/4 right-1/4 cursor-pointer z-20" onClick={handlePauseToggle} />
      </div>

      {/* Slide Navigation HUD Controls */}
      <div className="absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-black/85 to-transparent z-40 flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-widest">
          Use Left/Right arrows or spacebar to control
        </span>

        <div className="flex items-center gap-4 text-white">
          <button
            onClick={handlePrev}
            className="p-1.5 border border-white/10 rounded-full bg-black/40 hover:bg-black/60 transition-all text-white cursor-pointer"
            title="Previous Scene"
          >
            <SkipBack size={13} />
          </button>

          <button
            onClick={handlePauseToggle}
            className="p-2.5 border border-[#C9A96A] rounded-full bg-black/60 text-[#C9A96A] hover:bg-[#C9A96A] hover:text-black transition-all cursor-pointer"
            title={isPlaying ? "Pause Timeline" : "Play Timeline"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}
          </button>

          <button
            onClick={handleNext}
            className="p-1.5 border border-white/10 rounded-full bg-black/40 hover:bg-black/60 transition-all text-white cursor-pointer"
            title="Next Scene"
          >
            <SkipForward size={13} />
          </button>
        </div>

        <span className="font-mono text-[10px] text-zinc-300 tracking-wider">
          {(currentSceneIndex + 1).toString().padStart(2, '0')} / {scenes.length.toString().padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
