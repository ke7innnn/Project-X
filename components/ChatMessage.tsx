import { ConversationMessage } from '@/types';
import LoadingIndicator from './LoadingIndicator';
import ParametersSummary from './ParametersSummary';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';

interface ChatMessageProps {
  message: ConversationMessage;
  isCustomType?: 'image-grid' | 'parameters-summary' | 'download-button' | 'upload-prompt' | 'loading';
  customData?: any;
}

export default function ChatMessage({ message, isCustomType, customData }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const text = message.parts[0]?.text || '';
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { roomDimensions, roomLabels, collectedParameters } = useArchitectStore.getState();
      const res = await fetch('/api/export-dwg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomDimensions, roomLabels, collectedParameters })
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'floorplan.dxf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download DXF file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isCustomType === 'loading') {
    return (
      <div className="flex justify-start my-4">
        <LoadingIndicator />
      </div>
    );
  }

  if (isCustomType === 'parameters-summary') {
    return (
      <div className="flex justify-start my-4 w-full">
        <ParametersSummary />
      </div>
    );
  }

  if (isCustomType === 'image-grid') {
    // Expect customData to contain the ImageGrid element
    return (
      <div className="flex justify-start my-4 w-full">
        {customData}
      </div>
    );
  }

  if (isCustomType === 'download-button') {
    return (
      <div className="flex justify-start my-4">
        <button 
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex items-center gap-2 bg-[#FFB000] hover:bg-[#D8B78D] text-black font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          <Download size={18} />
          {isDownloading ? 'Downloading...' : text}
        </button>
      </div>
    );
  }

  if (isCustomType === 'upload-prompt') {
    // Treated as a system message
    return (
      <div className="flex justify-start my-4">
        <div className="bg-blue-900/40 border border-blue-500/50 text-blue-100 p-3 rounded-xl max-w-[90%] text-sm">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-4`}>
      <div 
        className={`max-w-[85%] rounded-2xl p-3 text-sm ${
          isUser 
            ? 'bg-[#FFB000] text-black rounded-tr-sm' 
            : 'glass text-gray-200 rounded-tl-sm'
        }`}
      >
        <div className="whitespace-pre-wrap">{text}</div>
      </div>
    </div>
  );
}
