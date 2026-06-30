'use client';

// Web Audio API singleton to prevent multiple contexts
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume context if suspended (browser auto-play policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

export type SoundType = 'click' | 'success' | 'woosh' | 'error';

export const playSound = (type: SoundType, volume = 0.5) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);

  switch (type) {
    case 'click': {
      // Soft, high-frequency "tick"
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);
      
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
      break;
    }
    case 'success': {
      // Pleasant, soft chime (major third)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 523.25; // C5
      osc2.frequency.value = 659.25; // E5
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(masterGain);
      
      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
      break;
    }
    case 'woosh': {
      // Low-pass filtered noise/sweep
      const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.2);
      filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      
      noiseSource.start(ctx.currentTime);
      break;
    }
    case 'error': {
      // Low buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      break;
    }
  }
};
