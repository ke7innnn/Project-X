'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { motion } from 'framer-motion';

interface ChatInputProps {
  onSend: (message: string, file?: File | null) => void;
  disabled?: boolean;
  placeholder?: string;
  hideAttachment?: boolean;
  overrideColor?: string;
}

function getBatmanChatPlaceholder(hour: number): string {
  if (hour >= 0 && hour < 5) {
    const lines = [
      "Still up, Umesh?",
      "Working late again, Umesh?",
      "Gotham never sleeps. Neither do we, Umesh."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else if (hour >= 5 && hour < 9) {
    const lines = [
      "Up before Gotham. Let's move, Umesh.",
      "Early morning watch, Umesh. What's the plan?",
      "No rest for the vigilant, Umesh. Speak."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else if (hour >= 9 && hour < 17) {
    const lines = [
      "What do you need, Umesh?",
      "Systems nominal. What do you need, Umesh?",
      "State your objective, Umesh."
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else if (hour >= 17 && hour < 21) {
    const lines = [
      "Evening patrol's about to start, Umesh.",
      "We're running out of daylight, Umesh. Focus.",
      "Sun's setting. What are we building, Umesh?"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  } else {
    const lines = [
      "The city's quiet. What's next, Umesh?",
      "Night watch initialized, Umesh. Speak.",
      "The darkness suits us, Umesh. What's next?"
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
}

export default function ChatInput({ onSend, disabled, placeholder = "Type your message...", hideAttachment = false, overrideColor = "" }: ChatInputProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [activePlaceholder, setActivePlaceholder] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Determine placeholder on mount and updates
  useEffect(() => {
    if (placeholder === "Type your message..." || !placeholder) {
      const now = new Date();
      setActivePlaceholder(getBatmanChatPlaceholder(now.getHours()));
    } else {
      setActivePlaceholder(placeholder);
    }
  }, [placeholder]);

  // Auto focus when disabled changes to false (loading finishes)
  useEffect(() => {
    if (!disabled) {
      // Small timeout to ensure the DOM has updated and element is enabled
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [disabled]);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selected);
    }
  };

  const removeFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((text.trim() || file) && !disabled) {
      onSend(text, file);
      setText('');
      removeFile();
    }
  };

  return (
    <div className="p-2.5 bg-[#02050c]/85 border-t border-blue-900/35 glass-panel shrink-0 z-10">
      {preview && (
        <div className="mb-2 relative inline-block">
          <img src={preview} alt="Upload preview" className="h-12 rounded-md border border-blue-900/40" />
          <button 
            onClick={removeFile}
            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder=""
          disabled={disabled}
          className={`w-full bg-[#02050c]/45 text-white border ${overrideColor || 'border-blue-900/35'} rounded-xl px-3 py-2 pr-20 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 h-[40px] text-xs transition-all glass-card`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        {!text && activePlaceholder && (
          <motion.div
            key={activePlaceholder}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            onClick={() => textareaRef.current?.focus()}
            className="absolute left-3.5 top-[11px] text-zinc-500/60 text-xs font-sans select-none pointer-events-none font-normal"
          >
            {activePlaceholder}
          </motion.div>
        )}
        
        <div className="absolute right-1.5 top-1.5 flex space-x-1.5">
          {!hideAttachment && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="p-1.5 text-gray-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              <Paperclip size={16} />
            </button>
          )}
          
          <button
            type="submit"
            disabled={disabled || (!text.trim() && !file)}
            className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(14,165,233,0.3)] cursor-pointer"
          >
            <Send size={14} />
          </button>
        </div>
        
        {text.length > 500 && (
          <div className="text-[10px] text-red-400 text-right mt-1">
            {text.length} chars (Keep it concise!)
          </div>
        )}
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/png, image/jpeg, application/pdf"
          className="hidden" 
        />
      </form>
    </div>
  );
}
