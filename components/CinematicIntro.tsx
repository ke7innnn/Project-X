'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CinematicIntroProps {
  videoPath: string;
  title: string;
  onComplete?: () => void;
}

export default function CinematicIntro({ videoPath, title, onComplete }: CinematicIntroProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [showSkipPrompt, setShowSkipPrompt] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parse the title to separate "Chapter X" and the rest
  const chapterMatch = title.match(/^(Chapter\s+\d+)\s*-\s*(.*)$/i) || 
                       title.match(/^(Chapter\s+\d+)\s*:\s*(.*)$/i) || 
                       title.match(/^(Chapter\s+\d+)\s+(.*)$/i);
  const chapterPrefix = chapterMatch ? chapterMatch[1] : "PROTOCOL SEC";
  const mainTitle = chapterMatch ? chapterMatch[2] : title;


  // Cinematic sound trigger (synthesized via Web Audio API)
  const triggerCinematicSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // --- Deep Bass Boom ---
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      
      // Pitch slide: 90Hz -> 20Hz (earth-shaking rumble)
      bassOsc.frequency.setValueAtTime(90, now);
      bassOsc.frequency.exponentialRampToValueAtTime(25, now + 2.5);

      bassGain.gain.setValueAtTime(0.01, now);
      bassGain.gain.linearRampToValueAtTime(0.65, now + 0.15);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

      // Lowpass filter to make it a deep rumble
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowpass';
      bassFilter.frequency.setValueAtTime(120, now);

      bassOsc.connect(bassFilter);
      bassFilter.connect(bassGain);
      bassGain.connect(ctx.destination);

      bassOsc.start(now);
      bassOsc.stop(now + 3.2);

      // --- Cybernetic Metal Swoosh ---
      const noiseOsc = ctx.createOscillator();
      const noiseGain = ctx.createGain();
      noiseOsc.type = 'sawtooth';
      
      // Sweep down in frequency
      noiseOsc.frequency.setValueAtTime(320, now);
      noiseOsc.frequency.exponentialRampToValueAtTime(80, now + 1.2);

      // Bandpass filter sweep
      const sweepFilter = ctx.createBiquadFilter();
      sweepFilter.type = 'bandpass';
      sweepFilter.Q.setValueAtTime(8, now);
      sweepFilter.frequency.setValueAtTime(1500, now);
      sweepFilter.frequency.exponentialRampToValueAtTime(300, now + 1.0);

      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.1);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      noiseOsc.connect(sweepFilter);
      sweepFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noiseOsc.start(now);
      noiseOsc.stop(now + 1.6);

      // --- High Chime/Glitch Pings ---
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chimeOsc.type = 'triangle';
      chimeOsc.frequency.setValueAtTime(880, now + 0.3); // Delay chime slightly
      
      chimeGain.gain.setValueAtTime(0.001, now + 0.3);
      chimeGain.gain.linearRampToValueAtTime(0.08, now + 0.35);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(ctx.destination);

      chimeOsc.start(now + 0.3);
      chimeOsc.stop(now + 2.2);

    } catch (e) {
      console.warn('Audio synthesis blocked or not supported by browser:', e);
    }
  };

  // Autoplay and audio initialization
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => {
          // Play cinematic audio if video successfully plays (user gesture exists)
          triggerCinematicSound();
        })
        .catch((err) => {
          console.warn('Cinematic intro autoplay blocked:', err);
          // Auto-bypass if totally blocked
          setIsPlaying(false);
          if (onComplete) onComplete();
        });
    }

    // Show skip prompt after 1 second
    const timer = setTimeout(() => setShowSkipPrompt(true), 1000);

    // Limit the intro duration to exactly 3 seconds
    const durationTimer = setTimeout(() => {
      handleEnded();
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(durationTimer);
    };
  }, [onComplete]);

  // Floating Dust Particle Simulation (Canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle class
    class Particle {
      x: number = 0;
      y: number = 0;
      size: number = 0;
      speedX: number = 0;
      speedY: number = 0;
      opacity: number = 0;
      fadeSpeed: number = 0;

      constructor() {
        this.reset(true);
      }

      reset(init = false) {
        this.x = Math.random() * width;
        this.y = init ? Math.random() * height : height + 10;
        this.size = Math.random() * 2.2 + 0.4;
        this.speedX = Math.random() * 0.6 - 0.3;
        this.speedY = -(Math.random() * 0.8 + 0.2); // Float upwards slowly
        this.opacity = init ? Math.random() * 0.4 + 0.1 : 0.01;
        this.fadeSpeed = Math.random() * 0.004 + 0.001;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        
        // Horizontal drift swing
        this.speedX += Math.sin(this.y * 0.015) * 0.008;

        if (this.opacity < 0.5) {
          this.opacity += this.fadeSpeed;
        }

        // Reset if out of bounds
        if (this.y < -10 || this.x < -10 || this.x > width + 10) {
          this.reset();
        }
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        
        // Amber/gold glowing particle color
        c.fillStyle = `rgba(200, 168, 75, ${this.opacity})`;
        c.shadowColor = 'rgba(200, 168, 75, 0.7)';
        c.shadowBlur = this.size * 2.5;
        c.fill();
        c.restore();
      }
    }

    const particles: Particle[] = Array.from({ length: 35 }, () => new Particle());

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        p.update();
        p.draw(ctx);
      });
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying]);

  const handleSkip = () => {
    // Play high tech bypass chime
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch(e){}

    setIsPlaying(false);
    if (onComplete) onComplete();
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (onComplete) onComplete();
  };

  // Split the mainTitle into words to prevent letters wrapping mid-word
  const words = mainTitle.split(' ');

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.3,
      }
    }
  };

  const letterVariants = {
    hidden: { 
      opacity: 0, 
      y: 15, 
      scale: 0.9,
      filter: "blur(6px)"
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      filter: "blur(0px)",
      transition: { 
        duration: 0.6, 
        ease: [0.16, 1, 0.3, 1] as const
      }
    }
  };

  return (
    <AnimatePresence>
      {isPlaying && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.0, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] bg-[#020204] flex items-center justify-center overflow-hidden select-none"
        >
          {/* Background scanline & noise grain */}
          <div className="scanline" />
          <div className="noise-overlay" />

          {/* Cinematic Widescreen Letterbox Bars */}
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: "8.5vh" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed top-0 left-0 right-0 bg-black/95 border-b border-[#c8a84b]/10 z-30 flex items-center px-8 justify-between"
          >
            <div className="text-[9px] font-mono tracking-[4px] text-zinc-500 uppercase">
              SYSTEM: INTEGRATED NEURAL NET
            </div>
            <div className="text-[9px] font-mono tracking-[4px] text-[#c8a84b]/60 font-semibold animate-pulse">
              SEQUENCE PROTOCOL ACTIVE
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: "8.5vh" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 bg-black/95 border-t border-[#c8a84b]/10 z-30 flex items-center px-8 justify-between"
          >
            <div className="text-[9px] font-mono tracking-[4px] text-zinc-500 uppercase">
              COORD DATA: LNK_SYS_INIT_284.1
            </div>
            <div className="text-[9px] font-mono tracking-[4px] text-zinc-500 uppercase">
              RENDER MATRIX // v1.0.0
            </div>
          </motion.div>

          {/* The Video Element - Unaltered Original Colors */}
          <video
            ref={videoRef}
            src={videoPath}
            onEnded={handleEnded}
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
          />

          {/* Floating Canvas Particles */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none opacity-80" />

          {/* Corner HUD Brackets */}
          <div className="absolute inset-[8.5vh] border border-white/5 pointer-events-none z-10">
            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white/30" />
            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white/30" />
            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white/30" />
            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white/30" />
          </div>

          {/* Cinematic Title Overlay */}
          <div className="relative z-20 flex flex-col items-center justify-center pointer-events-none text-center px-6 max-w-5xl">
            {/* Chapter Badge */}
            <motion.div
              initial={{ opacity: 0, y: -12, letterSpacing: "6px" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "14px" }}
              transition={{ duration: 1.0, ease: "easeOut" }}
              className="flex items-center gap-2 text-xs md:text-sm font-semibold font-michroma uppercase mb-3 tracking-[14px] text-white select-none"
              style={{
                textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 15px rgba(0,0,0,0.6)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white inline-block animate-ping mr-1" />
              {chapterPrefix}
            </motion.div>

            {/* Accent Separator */}
            <motion.div 
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.0, delay: 0.15, ease: "easeInOut" }}
              className="w-24 h-[1.5px] bg-gradient-to-r from-transparent via-white/70 to-transparent mb-5"
              style={{
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            />

            {/* Main Staggered Letter Reveal Title */}
            <motion.h1 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="font-michroma uppercase tracking-[10px] md:tracking-[24px] text-center leading-normal text-white select-none relative z-10 flex flex-wrap justify-center gap-y-4 gap-x-6 md:gap-x-10"
              style={{
                fontSize: 'clamp(1.3rem, 4vw, 3.4rem)',
                textShadow: '0 4px 15px rgba(0,0,0,0.95), 0 0 35px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)',
                color: '#ffffff',
              }}
            >
              {words.map((word, wordIdx) => (
                <span key={wordIdx} className="inline-block whitespace-nowrap">
                  {Array.from(word).map((char, charIdx) => (
                    <motion.span 
                      key={charIdx} 
                      variants={letterVariants}
                      className="inline-block text-white"
                    >
                      {char}
                    </motion.span>
                  ))}
                </span>
              ))}
            </motion.h1>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.5, delay: 0.6 }}
              className="mt-6 text-[9px] tracking-[5px] text-zinc-300 font-mono uppercase bg-black/60 px-5 py-2 border border-white/10 rounded backdrop-blur-md shadow-2xl flex items-center gap-1.5"
              style={{
                boxShadow: '0 0 20px rgba(0,0,0,0.9)',
              }}
            >
              <span>SYNTHESIZING PARADIGM DATA</span>
              <span className="animate-pulse text-white">_</span>
            </motion.div>
          </div>
          
          {/* Futuristic Bypass Button */}
          {showSkipPrompt && (
            <motion.button 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 0.6 }}
              whileHover={{ opacity: 0.95, scale: 1.05 }}
              onClick={handleSkip}
              className="absolute bottom-14 right-14 z-40 text-white/70 hover:text-white uppercase tracking-[3px] text-[10px] font-orbitron transition-all bg-black/60 hover:bg-black/90 border border-white/10 hover:border-[#c8a84b] px-4 py-2.5 rounded shadow-2xl backdrop-blur-md flex items-center gap-2 pointer-events-auto"
            >
              <span>BYPASS PROTOCOL</span>
              <span className="text-[8px] opacity-60">▶▶</span>
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
