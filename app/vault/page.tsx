'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useArchitectStore } from '@/store/useArchitectStore';
import { useActiveProjectGuard } from '@/lib/useActiveProjectGuard';
import { FLAGS } from '@/lib/featureFlags';
import { compressImage } from '@/lib/imageUtils';
import { 
  ArrowLeft, Presentation, Loader2, Sparkles, FileText, Trash2, Camera, Layers, Image as ImageIcon, UploadCloud
} from 'lucide-react';

export default function VaultPage() {
  const router = useRouter();
  
  // Guard the active project spine
  const { activeProject } = useActiveProjectGuard();
  const { removeProjectAsset, setPrimaryFloorPlan, addProjectAsset, projectName } = useArchitectStore();
  
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [uploadingImageBase64, setUploadingImageBase64] = useState<string | null>(null);

  // Group assets by type from activeProject spine
  const floorPlans = activeProject?.assets.floorPlans || [];
  const heroRender = activeProject?.assets.hero || null;
  const angles = activeProject?.assets.angles || [];
  const dxf = activeProject?.assets.dxf || null;
  const flythrough = activeProject?.assets.flythrough || null;
  const uploads = activeProject?.assets.uploads || [];

  const handleAutoFill = async () => {
    const showHUDModal = useArchitectStore.getState().showHUDModal;

    if (!heroRender) {
      await showHUDModal({
        type: 'alert',
        title: 'SYNTHESIS BLOCKED',
        message: 'Please add a Hero Render to the project first to generate angles from it.'
      });
      return;
    }

    const isConfirmed = await showHUDModal({
      type: 'confirm',
      title: 'TOWER ANGLE SYNTHESIS',
      message: 'Auto-fill missing angles and assets based on the Hero Render? This will generate multiple camera angles.'
    });
    if (!isConfirmed) return;

    setIsAutoFilling(true);
    try {
      // Simulate calling the FAL synthesis engine to auto-populate angles
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const angleLabels = ['FRONT ELEVATION', '3/4 HERO VIEW', 'REAR 3/4 VIEW'];
      angleLabels.forEach(label => {
        if (!angles.some(a => a.label === label)) {
          useArchitectStore.getState().addProjectAsset('angles', {
            label,
            url: heroRender // fallback/placeholder URL
          });
        }
      });
    } catch (err: any) {
      console.error('Auto-fill error', err);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be re-selected
    try {
      // Compress before storing — prevents large base64 from hanging IndexedDB writes
      const compressed = await compressImage(file, 1920, 0.82);
      setUploadingImageBase64(compressed);
    } catch (err) {
      console.error('[vault] Image compression failed, using original:', err);
      // Fallback: read raw
      const reader = new FileReader();
      reader.onloadend = () => setUploadingImageBase64(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Only count gated assets if their flag is on
  const totalAssetsCount = floorPlans.length + (heroRender ? 1 : 0) + angles.length
    + (FLAGS.DXF_EXPORT && dxf ? 1 : 0)
    + (FLAGS.FLYTHROUGH && flythrough ? 1 : 0)
    + uploads.length;

  return (
    <div className="min-h-screen bg-[#02050c] text-white font-sans flex flex-col relative overflow-x-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <header className="relative z-10 flex justify-between items-center px-8 py-6 border-b border-blue-900/30 bg-[#02050c]/80 backdrop-blur glass-panel">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push('/jarvis')}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 transition-all cursor-pointer glass-card group"
          >
            <ArrowLeft className="text-blue-400 group-hover:text-blue-300" size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-[4px] uppercase text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] flex items-center gap-2">
              <FileText className="text-cyan-400" /> Project Vault
            </h1>
            <span className="text-[10px] tracking-[3px] text-blue-400/60 uppercase font-mono">
              {projectName ? `Project: ${projectName}` : 'Asset Collection'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/presentation')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/50 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer"
          >
            <Presentation size={14} />
            Presentation Deck
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full p-8 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[3px] text-cyan-400 border-b border-cyan-900/40 pb-2">
            Spine Assets ({totalAssetsCount})
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2 bg-blue-950/45 border border-blue-900/40 text-blue-400 hover:bg-blue-900/30 hover:border-blue-500/50 rounded text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer">
              <UploadCloud size={12} />
              Upload Image
              <input type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
            </label>
            {FLAGS.FLYTHROUGH && (
              <button
                onClick={handleAutoFill}
                disabled={isAutoFilling || !heroRender}
                className="flex items-center gap-2 px-4 py-2 bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:bg-purple-900/40 hover:border-purple-400 rounded text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {isAutoFilling ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Auto-fill Missing
              </button>
            )}
          </div>
        </div>

        {totalAssetsCount === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-40 select-none py-32">
            <FileText size={64} className="text-cyan-500 mb-4 animate-pulse" />
            <h3 className="text-xl font-bold uppercase tracking-widest">Vault is Empty</h3>
            <p className="text-xs uppercase tracking-wider mt-2">Generate and finalize assets to see them here.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Primary Floor Plan & Floor Plans Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                <Layers size={14} /> Floor Plans
              </h3>
              {floorPlans.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {floorPlans.map((fp) => (
                    <div key={fp.id} className={`relative group border rounded-lg overflow-hidden glass-card aspect-video flex flex-col ${fp.isPrimary ? 'border-cyan-400' : 'border-blue-900/30'}`}>
                      <img src={fp.url} alt="Floor Plan" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        <button
                          onClick={() => setPrimaryFloorPlan(fp.id)}
                          className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${
                            fp.isPrimary ? 'bg-cyan-500 text-black' : 'bg-black/60 text-cyan-400 hover:bg-cyan-500 hover:text-black'
                          }`}
                        >
                          {fp.isPrimary ? '★ Primary' : 'Make Primary'}
                        </button>
                      </div>
                      <button 
                        onClick={() => removeProjectAsset('floorPlans', fp.id)}
                        className="absolute top-2 right-2 p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900 hover:text-white"
                        title="Remove Floor Plan"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-white/30 uppercase tracking-widest border border-white/5 rounded-lg p-4 text-center bg-white/5">No Floor Plans Finalized</div>
              )}
            </div>

            {/* Locked Hero Render Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                <ImageIcon size={14} /> Locked Hero Render
              </h3>
              {heroRender ? (
                <div className="max-w-md relative group border border-cyan-400/50 rounded-lg overflow-hidden glass-card aspect-video flex items-center justify-center">
                  <img src={heroRender} alt="Hero Render" className="w-full h-full object-cover" />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-cyan-500 text-black text-[8px] font-bold uppercase tracking-wider rounded">
                    ★ Active Hero
                  </div>
                  <button 
                    onClick={() => useArchitectStore.setState((state) => {
                      if (state.activeProject) {
                        return { activeProject: { ...state.activeProject, assets: { ...state.activeProject.assets, hero: null } } };
                      }
                      return {};
                    })}
                    className="absolute top-2 right-2 p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900 hover:text-white"
                    title="Remove Hero Render"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-white/30 uppercase tracking-widest border border-white/5 rounded-lg p-4 text-center bg-white/5">No Hero Render Finalized</div>
              )}
            </div>

            {/* Exterior Angles Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                <Camera size={14} /> Exterior Angles
              </h3>
              {angles.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {angles.map((ang) => (
                    <div key={ang.id} className="relative group border border-blue-900/30 rounded-lg overflow-hidden glass-card aspect-video flex items-center justify-center">
                      <img src={ang.url} alt={ang.label} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[8px] font-bold uppercase tracking-wider rounded font-mono">
                        {ang.label}
                      </div>
                      <button 
                        onClick={() => removeProjectAsset('angles', ang.id)}
                        className="absolute top-2 right-2 p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900 hover:text-white"
                        title="Remove Angle"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-white/30 uppercase tracking-widest border border-white/5 rounded-lg p-4 text-center bg-white/5">No Exterior Angles Generated</div>
              )}
            </div>

            {/* Uploads Section (Visual distinction!) */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                <ImageIcon size={14} /> Custom Uploads
              </h3>
              {uploads.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {uploads.map((up) => (
                    <div key={up.id} className="relative group border border-purple-500/30 rounded-lg overflow-hidden glass-card aspect-video flex items-center justify-center">
                      <img src={up.url} alt="User Upload" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-purple-950 text-purple-300 text-[8px] font-bold uppercase tracking-wider rounded font-mono border border-purple-800/40">
                        Uploaded
                      </div>
                      <button 
                        onClick={() => removeProjectAsset('uploads', up.id)}
                        className="absolute top-2 right-2 p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900 hover:text-white"
                        title="Remove Upload"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-white/30 uppercase tracking-widest border border-white/5 rounded-lg p-4 text-center bg-white/5">No Custom Uploads</div>
              )}
            </div>

            {/* Flythrough & DXF Section — gated behind feature flags */}
            {(FLAGS.FLYTHROUGH || FLAGS.DXF_EXPORT) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {FLAGS.FLYTHROUGH && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                      <Presentation size={14} /> 3D Flythrough / Render Still
                    </h3>
                    {flythrough ? (
                      <div className="relative group border border-blue-900/30 rounded-lg overflow-hidden glass-card aspect-video flex items-center justify-center">
                        <img src={flythrough.stillUrl || flythrough.videoUrl} alt="Flythrough Still" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => useArchitectStore.setState((state) => {
                            if (state.activeProject) {
                              return { activeProject: { ...state.activeProject, assets: { ...state.activeProject.assets, flythrough: null } } };
                            }
                            return {};
                          })}
                          className="absolute top-2 right-2 p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900 hover:text-white"
                          title="Remove Flythrough"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-white/30 uppercase tracking-widest border border-white/5 rounded-lg p-4 text-center bg-white/5">No Flythrough Generated</div>
                    )}
                  </div>
                )}
                {FLAGS.DXF_EXPORT && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3 flex items-center gap-2">
                      <Layers size={14} /> DXF Vector File
                    </h3>
                    {dxf ? (
                      <div className="relative group border border-blue-900/30 rounded-lg overflow-hidden glass-card aspect-video flex flex-col items-center justify-center bg-black/40">
                        <Layers size={32} className="text-cyan-500 mb-2" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-400 font-mono">dxf_vector.dxf</span>
                        <button 
                          onClick={() => useArchitectStore.setState((state) => {
                            if (state.activeProject) {
                              return { activeProject: { ...state.activeProject, assets: { ...state.activeProject.assets, dxf: null } } };
                            }
                            return {};
                          })}
                          className="absolute top-2 right-2 p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900 hover:text-white"
                          title="Remove DXF"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-white/30 uppercase tracking-widest border border-white/5 rounded-lg p-4 text-center bg-white/5">No DXF Vector Trace Generated</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Target Category Selector Modal Overlay */}
      {uploadingImageBase64 && (
        <div className="fixed inset-0 w-full h-full z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-[4px] font-mono p-4">
          <div className="w-full max-w-sm bg-[#040714] border border-cyan-500/30 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(0,217,255,0.15)] flex flex-col">
            <div className="h-1 w-full bg-cyan-500" />
            <div className="px-6 py-4 border-b border-blue-900/20 bg-[#060b1e]/50 flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[2px] uppercase text-cyan-400">ASSIGN TARGET CATEGORY</span>
              <span className="text-[7.5px] text-zinc-500 tracking-[1px] uppercase select-none">UPLOAD ROUTING</span>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <div className="w-full aspect-video rounded-lg overflow-hidden border border-blue-900/20 bg-black/30">
                <img src={uploadingImageBase64} className="w-full h-full object-contain" alt="Preview" />
              </div>
              <p className="text-[9px] text-zinc-400 uppercase tracking-wider text-center leading-relaxed">
                Choose which vault slot this image should populate. Landing in the correct slot allows the Auto presentation builder to satisfy its requirements.
              </p>
              
              <div className="flex flex-col gap-2 mt-2">
                <button
                  onClick={() => {
                    addProjectAsset('floorPlans', { url: uploadingImageBase64, source: 'uploaded' });
                    setUploadingImageBase64(null);
                  }}
                  className="w-full py-2 bg-blue-950/40 border border-blue-900/40 hover:border-cyan-400 text-blue-400 hover:text-white rounded font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer text-left px-4"
                >
                  📁 Target: Floor Plan
                </button>
                <button
                  onClick={() => {
                    addProjectAsset('hero', uploadingImageBase64);
                    setUploadingImageBase64(null);
                  }}
                  className="w-full py-2 bg-blue-950/40 border border-blue-900/40 hover:border-cyan-400 text-blue-400 hover:text-white rounded font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer text-left px-4"
                >
                  🖼️ Target: Locked Hero Render
                </button>
                <button
                  onClick={() => {
                    addProjectAsset('angles', { label: 'EXTERIOR VIEW', url: uploadingImageBase64 });
                    setUploadingImageBase64(null);
                  }}
                  className="w-full py-2 bg-blue-950/40 border border-blue-900/40 hover:border-cyan-400 text-blue-400 hover:text-white rounded font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer text-left px-4"
                >
                  📷 Target: Exterior Perspective Angle
                </button>
                <button
                  onClick={() => {
                    addProjectAsset('uploads', { url: uploadingImageBase64 });
                    setUploadingImageBase64(null);
                  }}
                  className="w-full py-2 bg-blue-950/40 border border-blue-900/40 hover:border-cyan-400 text-blue-400 hover:text-white rounded font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer text-left px-4"
                >
                  💼 Target: Custom Upload
                </button>
              </div>
            </div>

            <div className="px-6 py-4 bg-[#060b1e]/40 border-t border-blue-900/10 flex justify-end">
              <button
                onClick={() => setUploadingImageBase64(null)}
                className="px-4 py-2 border border-red-900/30 hover:border-red-500/50 bg-red-950/20 hover:bg-red-950/40 text-red-400 hover:text-red-300 rounded font-bold text-[10px] tracking-wider uppercase transition-all cursor-pointer"
              >
                [ Cancel Upload ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
