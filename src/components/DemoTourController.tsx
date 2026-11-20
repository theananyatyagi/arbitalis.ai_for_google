import React from 'react';
import { ArrowLeft, RotateCcw, X, Compass, ArrowRight, FileUp, Mic } from 'lucide-react';
import {
  DEMO_DATA_LABEL,
  DEMO_STAGE_COUNT,
  DEMO_TOUR_STAGES,
  getDemoStage,
} from '../data/demoTour';

interface DemoTourControllerProps {
  currentStage: number;
  /** Runs the stage's single highlighted action (provided by App). */
  onPrimaryAction: () => void;
  /** Label override for the primary action (e.g. after "Show extracted intelligence" was used). */
  primaryLabel?: string;
  onPrevious: () => void;
  onReplay: () => void;
  onExit: () => void;
  onSelectStage: (stage: number) => void;
  onAnalyseOwnCase: () => void;
  onOpenHearing: () => void;
}

/**
 * Single guided-demo banner. Entirely manual: it never advances, plays audio or calls Gemini.
 */
export const DemoTourController: React.FC<DemoTourControllerProps> = ({
  currentStage,
  onPrimaryAction,
  primaryLabel,
  onPrevious,
  onReplay,
  onExit,
  onSelectStage,
  onAnalyseOwnCase,
  onOpenHearing,
}) => {
  const stage = getDemoStage(currentStage);
  const isLast = stage.stage === DEMO_STAGE_COUNT;

  return (
    <section
      aria-label="Guided demo"
      className="bg-[#231612] text-[#F5F1EC] border-b border-[#3D2821]"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-4 space-y-3">
        {/* Progress: five clickable segments */}
        <div className="flex items-center gap-3">
          <Compass className="w-4 h-4 text-[#DED6CF] shrink-0" aria-hidden="true" />
          <div
            className="grid gap-1.5 flex-1"
            style={{ gridTemplateColumns: `repeat(${DEMO_STAGE_COUNT}, minmax(0, 1fr))` }}
            role="tablist"
            aria-label="Demo stages"
          >
            {DEMO_TOUR_STAGES.map((s) => {
              const active = s.stage === stage.stage;
              const done = s.stage < stage.stage;
              return (
                <button
                  key={s.stage}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Stage ${s.stage}: ${s.title}`}
                  onClick={() => onSelectStage(s.stage)}
                  className="text-left group cursor-pointer"
                >
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      active ? 'bg-[#E4B4B8]' : done ? 'bg-[#DED6CF]/70' : 'bg-white/15 group-hover:bg-white/30'
                    }`}
                  />
                  <div
                    className={`mt-1 text-[11px] truncate hidden sm:block ${
                      active ? 'text-white font-medium' : 'text-[#DED6CF]/60'
                    }`}
                  >
                    {s.title}
                  </div>
                </button>
              );
            })}
          </div>
          <span className="shrink-0 text-[11px] font-mono tabular-nums text-[#DED6CF]">
            {stage.stage}/{DEMO_STAGE_COUNT}
          </span>
        </div>

        {/* One objective, one primary action */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#DED6CF]/80">
              <span>{stage.title}</span>
              <span aria-hidden="true">·</span>
              <span className="normal-case tracking-normal text-[#E4B4B8]">{DEMO_DATA_LABEL}</span>
            </div>
            <h2 className="font-serif text-xl font-semibold text-white mt-0.5">{stage.headline}</h2>
            <p className="text-sm text-[#DED6CF] leading-relaxed mt-1">{stage.instruction}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onPrevious}
              disabled={stage.stage <= 1}
              aria-label="Previous stage"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 disabled:opacity-40 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <button
              type="button"
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#F5F1EC] text-[#231612] hover:bg-white text-sm font-semibold transition-colors cursor-pointer ring-2 ring-[#E4B4B8]/60"
            >
              <span>{primaryLabel ?? stage.primaryLabel}</span>
              {!isLast && <ArrowRight className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 text-xs font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Replay</span>
            </button>

            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-white/25 hover:bg-white/10 text-xs font-medium transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>

        {isLast && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 border-t border-white/10 text-xs">
            <button
              type="button"
              onClick={onAnalyseOwnCase}
              className="inline-flex items-center gap-1.5 text-[#F5F1EC] hover:underline cursor-pointer"
            >
              <FileUp className="w-3.5 h-3.5" />
              Analyse your own case
            </button>
            <button
              type="button"
              onClick={onOpenHearing}
              className="inline-flex items-center gap-1.5 text-[#DED6CF] hover:underline cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              Optional: see Hearing Intelligence
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
