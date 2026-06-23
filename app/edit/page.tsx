'use client';

import React, { useState, useRef } from 'react';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, PenTool, Loader2, UploadCloud, Folder } from 'lucide-react';
import CinematicIntro from '@/components/CinematicIntro';
import SaveToProjectModal from '@/components/SaveToProjectModal';

export default function EditPage() {
  const router = useRouter();
  const { currentFloorPlan, previousFloorPlan, setCurrentFloorPlan, setPreviousFloorPlan, collectedParameters, roomDimensions, sessionId, projectName, placeName } = useArchitectStore();
  const [prompt, setPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || !currentFloorPlan || isEditing) return;

    setIsEditing(true);
    setError(null);
    
    try {
      const editRes = await fetch('/api/edit-floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentFloorPlanBase64: currentFloorPlan,
          editInstruction: prompt,
          collectedParameters,
          roomDimensions
        })
      });
      const editData = await editRes.json();
      
      if (editData.editedFloorPlan) {
        setCurrentFloorPlan(editData.editedFloorPlan);
        setPrompt('');
      } else {
        setError('Edit failed. Please try a different instruction.');
      }
    } catch (err) {
      setError('An error occurred while connecting to Groq. Please try again.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setPreviousFloorPlan(currentFloorPlan); // Save current state for undo
        setCurrentFloorPlan(base64);
        setPrompt('');
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input so the same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUndo = () => {
    if (previousFloorPlan) {
      setCurrentFloorPlan(previousFloorPlan);
      setPreviousFloorPlan(null);
    }
  };

  return (
    <main className="flex flex-col w-full h-screen bg-[#0a0a0f] text-cyan-500 font-mono overflow-hidden relative">
      <CinematicIntro 
        videoPath="/stage videos/Chapter 2 - 'THE TRANSFORMATION INTO ARCHITECTURE'.mp4" 
        title="Chapter 2 - THE TRANSFORMATION INTO ARCHITECTURE" 
      />

      {/* Subtle animated background gradient */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzExMSIgc3Ryb2tlLXdpZHRoPSIwLjUiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-10 pointer-events-none z-0" />

      {/* Top Bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 border-b border-[#1e1810] bg-[#0f0f18]/80 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all group"
          >
            <ArrowLeft className="text-cyan-500/70 group-hover:text-cyan-400" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
              Edit Matrix
            </h1>
            <span className="text-[10px] tracking-[3px] text-cyan-500/60 uppercase">
              {projectName ? `Project: ${projectName} (${placeName || 'Unknown Location'})` : 'Powered by Groq Vision'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 font-bold rounded transition-colors"
          >
            <UploadCloud size={14} /> Upload Plan
          </button>

          {currentFloorPlan && (
            <button 
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest bg-[#1e1810] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 font-bold rounded transition-colors"
            >
              <Folder size={14} /> Save to Project
            </button>
          )}
          
          {previousFloorPlan && (
            <button 
              onClick={handleUndo}
              className="px-4 py-2 text-[10px] uppercase tracking-widest border border-[#c8a84b]/40 text-[#c8a84b] hover:bg-[#c8a84b]/10 rounded transition-colors"
            >
              Undo Last Edit
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex flex-1 overflow-hidden">
        
        {/* Left Side: Canvas / Image Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          {currentFloorPlan ? (
            <div className="relative w-full max-w-4xl aspect-square bg-white rounded-xl shadow-2xl overflow-hidden border-2 border-cyan-500/20 group">
              <img 
                src={currentFloorPlan.startsWith('data:image/') ? currentFloorPlan : `data:image/jpeg;base64,${currentFloorPlan}`} 
                alt="Current Floor Plan" 
                className={`w-full h-full object-contain transition-opacity duration-300 ${isEditing ? 'opacity-50 blur-sm' : 'opacity-100'}`}
              />
              {isEditing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f]/60 backdrop-blur-sm z-20">
                  <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                  <p className="text-cyan-400 font-mono tracking-[2px] uppercase text-sm animate-pulse">
                    Grok is analyzing & editing...
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-cyan-500/40 p-12 border-2 border-dashed border-cyan-500/20 rounded-xl bg-[#0f0f18]/30">
              <UploadCloud size={64} className="mb-6 opacity-50 text-cyan-500" />
              <h2 className="text-xl tracking-[4px] font-bold text-white uppercase mb-2">Upload Floor Plan</h2>
              <p className="text-cyan-500/60 tracking-[2px] text-xs uppercase max-w-md text-center mb-8">
                Upload a 2D floor plan image to initialize the Grok editing sequence.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 px-8 py-4 bg-cyan-500/10 border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-[#0a0a0f] uppercase tracking-widest font-bold transition-all"
              >
                <UploadCloud size={18} /> Select Image
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Command Prompt */}
        <div className="w-[400px] border-l border-[#1e1810] bg-[#0f0f18]/90 backdrop-blur-md flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <div className="p-6 border-b border-[#1e1810]">
            <h2 className="text-sm tracking-[3px] text-cyan-400 font-bold uppercase flex items-center gap-2">
              <PenTool size={14} /> Modification Protocols
            </h2>
            <p className="text-[10px] tracking-wide text-cyan-500/60 mt-2 leading-relaxed">
              Instruct the Groq Vision model to modify specific elements of your floor plan. E.g., "Add a pool to the backyard" or "Expand the master bedroom."
            </p>
          </div>

          <div className="flex-1 p-6 flex flex-col justify-end">
            {error && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wide rounded">
                ⚠️ {error}
              </div>
            )}
            
            <form onSubmit={handleEdit} className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ENTER EDIT INSTRUCTION..."
                disabled={isEditing || !currentFloorPlan}
                className="w-full h-32 bg-[#0a0a0f] border border-cyan-500/30 focus:border-cyan-400 rounded p-4 text-xs text-white placeholder-cyan-500/30 focus:outline-none focus:ring-1 focus:ring-cyan-400/50 resize-none custom-scrollbar transition-all uppercase tracking-wide disabled:opacity-50"
              />
              <button 
                type="submit"
                disabled={isEditing || !currentFloorPlan || !prompt.trim()}
                className="absolute bottom-4 right-4 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 p-2 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isEditing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Success alert toast */}
      {saveSuccessMsg && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-[#0f0f18] border border-cyan-500 rounded-lg px-6 py-3 text-cyan-400 uppercase tracking-widest text-xs font-bold shadow-[0_0_30px_rgba(6,182,212,0.25)] animate-bounce">
          ✓ Saved to project: {saveSuccessMsg}
        </div>
      )}

      {/* Save Project Modal */}
      <SaveToProjectModal 
        isOpen={isSaveModalOpen} 
        onClose={() => setIsSaveModalOpen(false)} 
        currentImageBase64={currentFloorPlan} 
        imageType="floorPlan" 
        theme="cyan" 
        onSaveSuccess={(pName) => {
          setSaveSuccessMsg(pName);
          setTimeout(() => setSaveSuccessMsg(null), 3000);
        }}
      />
    </main>
  );
}
