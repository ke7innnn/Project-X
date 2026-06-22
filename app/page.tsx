'use client';

import ChatPanel from '@/components/ChatPanel';
import CanvasPanel from '@/components/CanvasPanel';
import StartScreen from '@/components/StartScreen';
import RenderZoneHUD from '@/components/RenderZoneHUD';
import { useArchitectStore } from '@/store/useArchitectStore';

export default function Home() {
  const isAppStarted = useArchitectStore((state) => state.isAppStarted);

  if (!isAppStarted) {
    return <StartScreen />;
  }

  return (
    <main className="flex flex-col w-full h-screen bg-[#0d0d0d] overflow-hidden font-mono">
      {/* Background grid texture for the entire Render Zone */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none z-0" />
      
      {/* Top HUD Tracker */}
      <RenderZoneHUD />

      {/* Main Split Screen Area */}
      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Left Panel: Chat (30%) */}
        <div className="w-[30%] h-full flex flex-col border-r border-[#222]">
          <ChatPanel />
        </div>

        {/* Right Panel: Canvas (70%) */}
        <div className="w-[70%] h-full flex flex-col">
          <CanvasPanel />
        </div>
      </div>
    </main>
  );
}
