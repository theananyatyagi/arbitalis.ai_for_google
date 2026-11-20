import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Mic, Sparkles, FolderGit2 } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { AppView, CaseOrigin } from '../types/arbitration';

interface TopNavProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  activeOrigin: CaseOrigin;
  onSwitchOrigin: (origin: CaseOrigin) => void;
  onOpenAria: () => void;
  onOpenTranscription: () => void;
  isDemoTourActive: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onNavigate,
  activeOrigin,
  onSwitchOrigin,
  onOpenAria,
  onOpenTranscription,
  isDemoTourActive,
}) => {
  const [toolsOpen, setToolsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems: { id: AppView; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'workspace', label: 'Case Workspace' },
    { id: 'map', label: 'Dispute Map' },
    { id: 'review', label: 'Findings Review' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F5F1EC]/95 backdrop-blur-sm border-b border-[#DED6CF]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Official Arbitalis.AI Logo */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Arbitalis.AI Home"
          className="flex items-center whitespace-nowrap shrink-0 text-left group cursor-pointer"
        >
          <BrandLogo className="h-9 sm:h-10 w-auto object-contain transition-transform duration-150 group-hover:scale-[1.02]" />
        </button>

        {/* Zone 2: Four primary destinations */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-[#7E2833]'
                    : 'text-[#231612]/75 hover:text-[#231612]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 -bottom-[21px] h-[2px] bg-[#7E2833]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Secondary Tools Menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setToolsOpen((prev) => !prev)}
            aria-expanded={toolsOpen}
            aria-haspopup="menu"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#231612] text-white text-xs font-medium hover:bg-[#38251F] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Tools</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${toolsOpen ? 'rotate-180' : ''}`} />
          </button>

          {toolsOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-[#DED6CF] shadow-lg py-1.5 z-50"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenAria();
                }}
                className="w-full px-4 py-2.5 text-left flex items-start gap-3 hover:bg-[#F5F1EC] transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#7E2833] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[#231612]">Ask ARIA Briefing</div>
                  <div className="text-[11px] text-[#231612]/65">
                    Voice & text Q&amp;A grounded in active case
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setToolsOpen(false);
                  onOpenTranscription();
                }}
                className="w-full px-4 py-2.5 text-left flex items-start gap-3 hover:bg-[#F5F1EC] transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4 text-[#7E2833] mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[#231612]">Hearing Transcription</div>
                  <div className="text-[11px] text-[#231612]/65">
                    Transcribe &amp; review hearing audio
                  </div>
                </div>
              </button>

              <div className="my-1 border-t border-[#DED6CF]" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setToolsOpen(false);
                  onSwitchOrigin(activeOrigin === 'demo' ? 'live' : 'demo');
                }}
                className="w-full px-4 py-2.5 text-left flex items-start gap-3 hover:bg-[#F5F1EC] transition-colors cursor-pointer"
              >
                <FolderGit2 className="w-4 h-4 text-[#231612]/70 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-[#231612]">
                    {activeOrigin === 'demo'
                      ? 'Switch to Analyse Your Case'
                      : 'Switch to Prepared Demo Case'}
                  </div>
                  <div className="text-[11px] text-[#231612]/65">
                    {isDemoTourActive
                      ? 'Leaves guided tour for clean upload workspace'
                      : activeOrigin === 'demo'
                      ? 'Upload up to 5 PDFs for Gemini analysis'
                      : 'View ABC Contractors v. XYZ Infrastructure'}
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile primary navigation strip */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden flex items-center justify-around border-t border-[#DED6CF] bg-[#F5F1EC] px-2 py-1.5"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`px-2 py-1.5 text-xs font-medium whitespace-nowrap rounded-md transition-colors ${
                isActive ? 'text-[#7E2833] bg-white' : 'text-[#231612]/75'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
