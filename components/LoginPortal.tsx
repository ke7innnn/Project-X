'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useArchitectStore } from '@/store/useArchitectStore';
import { Lock, ShieldAlert, KeyRound, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPortal() {
  const setIsAuthenticated = useArchitectStore((state) => state.setIsAuthenticated);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'decrypting' | 'granted'>('idle');

  // Web Audio Synthesizer
  const playSound = (type: 'type' | 'error' | 'success' | 'decrypt') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const now = ctx.currentTime;

      if (type === 'type') {
        // High-pitched short tech click sound
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.05);
      } else if (type === 'error') {
        // High-low alarm sirens
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        
        osc1.frequency.setValueAtTime(220, now);
        osc1.frequency.linearRampToValueAtTime(110, now + 0.3);
        
        osc2.frequency.setValueAtTime(330, now);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, now);
        
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
      } else if (type === 'decrypt') {
        // Repetitive tech beep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.2);
      } else if (type === 'success') {
        // Ascending chime sweep
        [0, 0.1, 0.2, 0.3].forEach((delay, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440 * Math.pow(1.5, idx), now + delay);
          gain.gain.setValueAtTime(0.04, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.5);
        });
      }
    } catch(e) {}
  };

  const handleKeyDown = () => {
    playSound('type');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const isValidUser = 
      (cleanEmail === '1234' && cleanPassword === '4321') ||
      ((cleanEmail === 'boss@uka' || cleanEmail === 'boss2uka' || cleanEmail === 'boss2uka@uka') && 
      cleanPassword === 'password@uka');

    if (isValidUser) {
      setStatus('decrypting');
      setProgress(0);
      playSound('success');
    } else {
      setIsShaking(true);
      playSound('error');
      setError('DECRYPTION FAILED // ACCESS DENIED // INVALID CODE OR ID');
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  // Animate decryption progress
  useEffect(() => {
    if (status !== 'decrypting') return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setStatus('granted');
          setTimeout(() => {
            localStorage.setItem('user_authenticated', 'true');
            setIsAuthenticated(true);
          }, 800);
          return 100;
        }
        playSound('decrypt');
        return prev + Math.floor(Math.random() * 20) + 5;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [status]);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#020204] flex items-center justify-center font-mono overflow-hidden z-[9999] text-white">
      {/* Background scanline & noise grain */}
      <div className="scanline" />
      <div className="noise-overlay" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,_transparent_0%,_#020204_90%)] z-0 pointer-events-none" />
      
      {/* Grid Texture */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none z-0" />
 
      {/* Decorative HUD Corner Borders */}
      <div className="absolute inset-10 border border-white/5 pointer-events-none z-10">
        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/20" />
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/20" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/20" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/20" />
      </div>
 
      <AnimatePresence mode="wait">
        {status === 'idle' && (
          <motion.div
            key="login-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`relative z-20 w-full max-w-[420px] bg-black/60 p-8 border border-white/10 rounded-xl backdrop-blur-md shadow-2xl flex flex-col items-center select-none ${isShaking ? 'animate-shake' : ''}`}
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 25px rgba(255,255,255,0.02)',
            }}
          >
            {/* Header */}
            <div className="flex flex-col items-center gap-2 mb-8 text-center w-full">
              <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center bg-white/5 mb-2">
                <Lock size={20} className="text-white" />
              </div>
              <h1 className="font-michroma text-sm font-semibold tracking-[4px] text-white uppercase">
                WAYNE ENTERPRISES
              </h1>
              <span className="text-[9px] tracking-[5px] text-zinc-400 uppercase">
                SECURE ACCESS PORTAL
              </span>
            </div>
 
            {/* Error Message */}
            {error && (
              <div className="w-full mb-6 p-3 border border-red-500/30 bg-red-950/20 rounded text-[9px] font-bold text-red-400 tracking-[1px] leading-relaxed uppercase flex gap-2 items-start">
                <ShieldAlert size={14} className="shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}
 
            {/* Login Form */}
            <form onSubmit={handleSubmit} className="w-full space-y-6">
              <div className="space-y-2">
                <label className="block text-[9px] tracking-[3px] text-zinc-400 uppercase font-bold text-left">
                  EMPLOYEE ID
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase())}
                    onKeyDown={handleKeyDown}
                    placeholder="E.G. 1234"
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full bg-black/50 border border-white/10 group-hover:border-white/25 focus:border-white focus:outline-none rounded px-3 py-3 pl-9 text-[11px] text-white placeholder-zinc-600 transition-all tracking-[2px] uppercase font-mono"
                  />
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                </div>
              </div>
 
              <div className="space-y-2">
                <label className="block text-[9px] tracking-[3px] text-zinc-400 uppercase font-bold text-left">
                  DECRYPT KEY
                </label>
                <div className="relative group">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="••••••••"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect="off"
                    spellCheck="false"
                    className="w-full bg-black/50 border border-white/10 group-hover:border-white/25 focus:border-white focus:outline-none rounded px-3 py-3 pl-9 text-[11px] text-white placeholder-zinc-600 transition-all tracking-[4px]"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 mt-8 bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-[4px] text-[10px] rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.15)]"
              >
                <span>DECRYPT PORTAL</span>
                <ArrowRight size={14} />
              </button>
            </form>

            <div className="mt-8 text-[9px] tracking-[2px] text-zinc-600 uppercase text-center w-full">
              SECURE DECRYPT METHOD // TYPE: AES-256
            </div>
          </motion.div>
        )}

        {status === 'decrypting' && (
          <motion.div
            key="decrypt-progress"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-20 w-full max-w-[400px] flex flex-col items-center text-center p-8 select-none"
          >
            <Loader2 className="w-10 h-10 text-white animate-spin mb-6" />
            <h2 className="font-michroma text-xs font-semibold tracking-[4px] text-white uppercase mb-1">
              DECRYPTING PORTAL
            </h2>
            <span className="text-[9px] tracking-[3px] text-zinc-400 uppercase mb-8">
              ESTABLISHING LINK TO COGNITIVE ARCHITECT
            </span>
            
            {/* Decryption Progress Bar */}
            <div className="w-full bg-white/5 border border-white/10 rounded overflow-hidden p-[2px] h-6 relative mb-4">
              <div 
                className="h-full bg-white transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                {progress}%
              </span>
            </div>
            
            <div className="text-[9px] tracking-[2px] text-zinc-500 uppercase mt-2">
              LINK NODE STABLE // SECTOR AUTH SYNCING
            </div>
          </motion.div>
        )}

        {status === 'granted' && (
          <motion.div
            key="access-granted"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-20 w-full max-w-[400px] flex flex-col items-center text-center p-8 select-none"
          >
            <div className="w-14 h-14 rounded-full border border-green-500/30 bg-green-500/10 flex items-center justify-center text-green-400 mb-6 shadow-[0_0_20px_rgba(34,197,94,0.2)] animate-pulse">
              ✓
            </div>
            <h2 className="font-michroma text-sm font-black tracking-[5px] text-white uppercase mb-2">
              ACCESS GRANTED
            </h2>
            <span className="text-[9px] tracking-[4px] text-green-400 font-bold uppercase">
              WELCOME BACK, SIR
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
