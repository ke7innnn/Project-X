'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface InpaintInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function InpaintInput({ onSend, disabled }: InpaintInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSend(text);
      setText('');
    }
  };

  return (
    <div className="p-2.5 bg-[#02050c]/85 shrink-0 font-sans flex flex-col justify-center border-t border-blue-900/35 glass-panel z-10">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 uppercase font-bold tracking-widest text-xs whitespace-nowrap text-glow-blue">
            Replace Green With:
          </span>
          <div className="flex-1 relative flex items-center border-b border-cyan-500/50">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={disabled}
              placeholder="E.G. KITCHEN LAYOUT"
              className="w-full bg-transparent text-cyan-400 placeholder:text-cyan-400/30 outline-none uppercase tracking-widest text-xs py-1.5 pr-8"
              autoFocus
            />
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="absolute right-0 text-cyan-400 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Send size={14} className="transform -rotate-45" />
            </button>
          </div>
        </div>
        <p className="text-cyan-400/60 uppercase tracking-wider text-[9px] leading-relaxed">
          Paint the target room green and enter the new design above. Try "EMPTY ROOM" to remove furniture.
        </p>
      </form>
    </div>
  );
}
