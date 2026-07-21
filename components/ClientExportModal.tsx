'use client';

import React from 'react';
import { X, Printer, FileText } from 'lucide-react';

interface ClientExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  locationName: string;
  floorPlanUrl: string | null;
  heroRenderUrl: string | null;
  angleViews: { title: string; url: string | null }[];
  storyCount: string;
  footprintShape: string;
  dimensions: string;
}

export default function ClientExportModal({
  isOpen,
  onClose,
  projectName,
  locationName,
  floorPlanUrl,
  heroRenderUrl,
  angleViews,
  storyCount,
  footprintShape,
  dimensions
}: ClientExportModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto print:static print:bg-white">
      {/* Modal Card */}
      <div className="relative w-full max-w-5xl h-[90vh] bg-[#FDFCF7] text-[#0B4F30] font-sans flex flex-col rounded-2xl overflow-hidden border border-[#0B4F30]/20 shadow-2xl print:h-auto print:w-full print:border-none print:shadow-none print:rounded-none">
        
        {/* Controls - Hidden during printing */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#0B4F30]/10 bg-white print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#0B4F30]" />
            <span className="font-semibold text-xs tracking-wider uppercase">CLIENT EXPORT PROTOCOL</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-[#0B4F30] hover:bg-[#083a23] text-[#FDFCF7] rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 text-[#0B4F30]/70 hover:text-[#0B4F30] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable/Branded Document Body */}
        <div className="flex-1 overflow-y-auto p-8 font-sans print:overflow-visible print:p-0">
          
          {/* UKA Header Logo Block */}
          <div className="border-b-2 border-[#0B4F30] pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-left">
              <div className="flex items-center gap-2.5">
                {/* Forest green graphic emblem representing UKA */}
                <div className="w-8 h-8 rounded bg-[#0B4F30] flex items-center justify-center text-[#FDFCF7] font-serif text-lg font-bold">
                  K
                </div>
                <div>
                  <h1 className="text-lg font-serif font-extrabold tracking-wider text-[#0B4F30]">
                    UMESH KEKRE & ASSOCIATES
                  </h1>
                  <p className="text-[10px] tracking-[2px] uppercase text-[#0B4F30]/60 font-semibold">
                    Architects & Urban Planners
                  </p>
                </div>
              </div>
            </div>
            
            <div className="text-left md:text-right text-xs">
              <p className="font-bold text-[#0B4F30] uppercase">PROJECT PRESENTATION SHEET</p>
              <p className="text-[#0B4F30]/70">Date: {new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* Project Details Panel */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 bg-[#0B4F30]/5 p-4 rounded-xl border border-[#0B4F30]/10 text-left">
            <div>
              <span className="text-[8px] tracking-wider text-[#0B4F30]/60 uppercase block">PROJECT NAME</span>
              <span className="text-sm font-bold uppercase">{projectName || 'UNNAMED TOWER DEVELOPMENT'}</span>
            </div>
            <div>
              <span className="text-[8px] tracking-wider text-[#0B4F30]/60 uppercase block">LOCATION</span>
              <span className="text-sm font-bold uppercase">{locationName || 'UNKNOWN LOCATION'}</span>
            </div>
            <div>
              <span className="text-[8px] tracking-wider text-[#0B4F30]/60 uppercase block">HEIGHT & SHAPE</span>
              <span className="text-sm font-bold uppercase">{storyCount} / {footprintShape}</span>
            </div>
            <div>
              <span className="text-[8px] tracking-wider text-[#0B4F30]/60 uppercase block">FOOTPRINT BOUNDS</span>
              <span className="text-sm font-bold uppercase">{dimensions}</span>
            </div>
          </div>

          {/* Core Floor Plan & Exterior Hero Side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider border-b border-[#0B4F30]/20 pb-1.5 text-left">
                TYPICAL FLOOR PLAN
              </h3>
              <div className="aspect-[4/3] rounded-lg border border-[#0B4F30]/10 overflow-hidden bg-white flex items-center justify-center p-4">
                {floorPlanUrl ? (
                  <img src={floorPlanUrl} alt="Typical Floor Plan" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-[#0B4F30]/40 italic">Awaiting floor plan render</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider border-b border-[#0B4F30]/20 pb-1.5 text-left">
                EXTERIOR HERO VIEW
              </h3>
              <div className="aspect-[4/3] rounded-lg border border-[#0B4F30]/10 overflow-hidden bg-white flex items-center justify-center p-4">
                {heroRenderUrl ? (
                  <img src={heroRenderUrl} alt="Exterior Hero View" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-[#0B4F30]/40 italic">Awaiting exterior visualization</span>
                )}
              </div>
            </div>
          </div>

          {/* 6 Multi-Angle Views Grid */}
          <div className="flex flex-col gap-2 mb-8 page-break-before print:pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider border-b border-[#0B4F30]/20 pb-1.5 text-left">
              MULTI-ANGLE VIEW SYNTHESIS
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {angleViews.map((view, idx) => (
                <div key={idx} className="flex flex-col gap-1.5">
                  <div className="aspect-[4/3] rounded-lg border border-[#0B4F30]/10 overflow-hidden bg-white flex items-center justify-center p-2">
                    {view.url ? (
                      <img src={view.url} alt={view.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-[#0B4F30]/30 italic">Not generated</span>
                    )}
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-center block text-[#0B4F30]">
                    {view.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Legal Compliance Disclaimer */}
          <div className="border-t border-[#0B4F30]/20 pt-4 mt-8 text-left text-[9px] leading-relaxed text-[#0B4F30]/60">
            <p className="font-bold uppercase text-[#0B4F30] mb-1">Indicative Compliance Disclaimer</p>
            <p>
              AI-assisted concept — indicative, not certified. This conceptual design, floor layout boundary, and perspective rendering is generated for visual exploration purposes using machine learning. It does not constitute a certified, stamped, or construction-ready engineering document. All dimensions, occupant loads, Vaastu alignments, egress details, and structural requirements must be fully calculated, verified, and certified by a licensed professional architect or engineer before site submission or physical fabrication.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
