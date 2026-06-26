'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useArchitectStore } from '@/store/useArchitectStore';

interface ChatInputProps {
  onSend: (message: string, file?: File | null) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="p-4 bg-[#0A0E1A] border-t border-gray-800 shrink-0">
      {preview && (
        <div className="mb-3 relative inline-block">
          <img src={preview} alt="Upload preview" className="h-16 rounded-md border border-gray-700" />
          <button 
            onClick={removeFile}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex flex-col relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your message..."
          disabled={disabled}
          className="w-full bg-[#111827] text-white border border-gray-700 rounded-xl px-4 py-3 pr-24 resize-none focus:outline-none focus:ring-1 focus:ring-[#FFB000] disabled:opacity-50 h-[60px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        
        <div className="absolute right-2 top-2 flex space-x-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-2 text-gray-400 hover:text-[#FFB000] transition-colors disabled:opacity-50"
          >
            <Paperclip size={20} />
          </button>
          
          <button
            type="submit"
            disabled={disabled || (!text.trim() && !file)}
            className="p-2 bg-[#FFB000] text-black rounded-lg hover:bg-[#D8B78D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={20} />
          </button>
        </div>
        
        {text.length > 500 && (
          <div className="text-xs text-red-400 text-right mt-1">
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
