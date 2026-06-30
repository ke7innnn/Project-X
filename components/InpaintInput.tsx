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
    <div className="p-4 bg-[#0A0E1A] shrink-0 font-mono flex flex-col justify-center border-t border-gray-900">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[#00B8D9] uppercase font-bold tracking-widest text-sm whitespace-nowrap">
            Replace Green With:
          </span>
          <div className="flex-1 relative flex items-center border-b border-[#00B8D9]/50">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={disabled}
              placeholder="E.G. KITCHEN LAYOUT,"
              className="w-full bg-transparent text-[#00B8D9] placeholder:text-[#00B8D9]/40 outline-none uppercase tracking-widest text-sm py-2 pr-10"
              autoFocus
            />
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="absolute right-0 text-[#00B8D9] hover:text-white transition-colors disabled:opacity-50"
            >
              <Send size={18} className="transform -rotate-45" />
            </button>
          </div>
        </div>
        <p className="text-[#00B8D9]/70 uppercase tracking-wider text-[10px] leading-relaxed">
          Paint the target room green and enter the new design above. Try "EMPTY ROOM" to remove furniture.
        </p>
      </form>
    </div>
  );
}
