import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, FolderGit2 } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { AppView, CaseOrigin } from '../types/arbitration';

interface TopNavProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  activeOrigin: CaseOrigin;
  onSwitchOrigin: (origin: CaseOrigin) => void;
  isDemoTourActive: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeView,
  onNavigate,
  activeOrigin,
  onSwitchOrigin,
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

  const navItems: { id: AppView; label: string; short: string }[] = [
    { id: 'home', label: 'Home', short: 'Home' },
    { id: 'workspace', label: 'Case Workspace', short: 'Workspace' },
    { id: 'map', label: 'Dispute Map', short: 'Map' },
    { id: 'aria', label: 'Ask ARIA', short: 'ARIA' },
    { id: 'hearing', label: 'Hearing Intelligence', short: 'Hearing' },
    { id: 'sage', label: 'SAGE Drafting', short: 'SAGE' },
  ];
  // Findings Review is no longer a primary destination, but remains reachable from the map
  // and the guided demo; keep Dispute Map highlighted while it is open.
  const highlightedView: AppView = activeView === 'review' ? 'map' : activeView;

  return (
    <header className="sticky top-0 z-40 bg-[#F5F1EC]/95 backdrop-blur-sm border-b border-[#DED6CF]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Official Arbitalis.AI Logo */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-label="Arbitalis.AI Home"
          className="flex items-center whitespace-nowrap shrink-0 text-left group cursor-pointer"
        >
          <BrandLogo />
        </button>

        {/* Zone 2: Four primary destinations */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-6"
        >
          {navItems.map((item) => {
            const isActive = highlightedView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
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
        className="lg:hidden grid grid-cols-6 gap-0.5 border-t border-[#DED6CF] bg-[#F5F1EC] px-2 py-1.5"
      >
        {navItems.map((item) => {
          const isActive = highlightedView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`px-0 py-2 text-[10.5px] sm:text-xs tracking-tight font-medium whitespace-nowrap rounded-md transition-colors cursor-pointer ${
                isActive ? 'text-[#7E2833] bg-white font-semibold' : 'text-[#231612]/75'
              }`}
            >
              {item.short}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
