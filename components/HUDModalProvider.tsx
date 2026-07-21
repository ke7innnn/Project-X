'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { playSound } from '@/lib/sounds';
import { ShieldAlert, Info, HelpCircle } from 'lucide-react';

export default function HUDModalProvider() {
  const hudModal = useArchitectStore(state => state.hudModal);
  const closeHUDModal = useArchitectStore(state => state.closeHUDModal);
  
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Play digital sound on open
  useEffect(() => {
    if (hudModal) {
      playSound('click');
      setInputValue(hudModal.defaultValue || '');
      
      // Auto-focus input
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [hudModal]);

  if (!hudModal || !hudModal.isOpen) return null;

  const handleCancel = () => {
    playSound('error');
    if (hudModal.type === 'confirm') {
      closeHUDModal(false);
    } else if (hudModal.type === 'prompt') {
      closeHUDModal(null);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    playSound('click');
    if (hudModal.type === 'confirm') {
      closeHUDModal(true);
    } else if (hudModal.type === 'prompt') {
      closeHUDModal(inputValue);
    } else {
      closeHUDModal(true);
    }
  };

  // Determine Icon & Color theme based on type
  const isAlert = hudModal.type === 'alert';
  const isConfirm = hudModal.type === 'confirm';
  const accentColor = isAlert ? 'text-[#FFB000]' : '#00d9ff';
  const borderColor = isAlert ? 'border-[#FFB000]/40 shadow-[0_0_20px_rgba(255,176,0,0.15)]' : 'border-[#00d9ff]/30 shadow-[0_0_20px_rgba(0,217,255,0.15)]';

  return (
    <div className="fixed inset-0 w-full h-full z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-[4px] animate-fadeIn font-mono p-4">
      <div className={`w-full max-w-md bg-[#040714] border rounded-xl overflow-hidden flex flex-col relative ${borderColor} transition-all duration-300`}>
        {/* Top Accent Bar */}
        <div className={`h-1 w-full ${isAlert ? 'bg-[#FFB000]' : 'bg-[#00d9ff]'}`} />
        
        {/* Header HUD info */}
        <div className="px-6 py-4 border-b border-blue-900/20 bg-[#060b1e]/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isAlert ? (
              <ShieldAlert className="text-[#FFB000]" size={16} />
            ) : isConfirm ? (
              <HelpCircle className="text-[#00d9ff]" size={16} />
            ) : (
              <Info className="text-[#00d9ff]" size={16} />
            )}
            <span className={`text-[10px] font-bold tracking-[2px] uppercase ${isAlert ? 'text-[#FFB000]' : 'text-cyan-400'}`}>
              {hudModal.title || (isAlert ? 'SYSTEM WARNING' : 'USER INTERFACE REQUEST')}
            </span>
          </div>
          <span className="text-[7.5px] text-zinc-500 tracking-[1px] uppercase select-none">
            JARVIS.V2 // ONLINE
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-4">
          <div className="text-xs text-zinc-300 leading-relaxed uppercase tracking-wide whitespace-pre-wrap">
            {hudModal.message}
          </div>

          {/* Form for Prompt input */}
          {hudModal.type === 'prompt' && (
            <form onSubmit={handleSubmit} className="mt-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-[#02050c] border border-blue-900/40 focus:border-[#00d9ff] rounded px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#00d9ff]/50 transition-all font-mono uppercase"
              />
            </form>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#060b1e]/40 border-t border-blue-900/10 flex justify-end gap-3">
          {hudModal.type !== 'alert' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-red-900/30 hover:border-red-500/50 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 rounded font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer"
            >
              [ Cancel ]
            </button>
          )}
          
          <button
            onClick={() => handleSubmit()}
            className={`px-5 py-2 border font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer rounded ${
              isAlert 
                ? 'border-[#FFB000]/30 hover:border-[#FFB000] bg-[#FFB000]/10 hover:bg-[#FFB000]/25 text-[#FFB000]'
                : 'border-[#00d9ff]/30 hover:border-[#00d9ff] bg-[#00d9ff]/10 hover:bg-[#00d9ff]/25 text-[#00d9ff]'
            }`}
          >
            {hudModal.type === 'prompt' ? '[ Submit ]' : '[ Acknowledge ]'}
          </button>
        </div>
      </div>
    </div>
  );
}
