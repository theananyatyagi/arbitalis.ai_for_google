import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  X,
  Compass,
  ArrowRight,
  Sparkles,
  FileUp,
} from 'lucide-react';

export interface DemoStageInfo {
  stage: number;
  title: string;
  headline: string;
  description: string;
}

export const DEMO_STAGES: DemoStageInfo[] = [
  {
    stage: 1,
    title: 'Welcome to the Case',
    headline: 'ABC Contractors v. XYZ Infrastructure',
    description:
      'A contractor says the employer delayed site access. The employer says the contractor was already behind schedule. What does the evidence actually establish?',
  },
  {
    stage: 2,
    title: 'Explore the Evidence',
    headline: 'Prepared Demo Documents',
    description:
      'Review the contract, handover letters, daily crane register, and pleadings. Notice EX-GAP explicitly flags the missing Baseline Programme rather than inventing one.',
  },
  {
    stage: 3,
    title: 'From Documents to Intelligence',
    headline: 'Prepared Demo Analysis',
    description:
      'See how Gemini structures raw case filings into verifiable facts, contractual obligations, chronological milestones, competing allegations, and evidentiary gaps.',
  },
  {
    stage: 4,
    title: 'Dispute Reasoning Map',
    headline: 'Who caused the 45-day project delay?',
    description:
      'Watch evidence nodes connect sequentially around the central disputed issue. Click any node to inspect its cited source passage and verification status.',
  },
  {
    stage: 5,
    title: 'Ask ARIA',
    headline: 'Voice & Case Intelligence Briefing',
    description:
      'Try asking ARIA: "What evidence suggests that the contractor was already delayed?" Voice and microphone controls activate only when you click.',
  },
  {
    stage: 6,
    title: 'Human Review',
    headline: 'AI organises the evidence. The arbitrator exercises judgment.',
    description:
      'Check a source passage, accept or reject a proposed finding, flag missing evidence, and record a human review note.',
  },
];

interface DemoTourControllerProps {
  currentStage: number;
  isPlaying: boolean;
  autoPausedReason: string | null;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReplay: () => void;
  onExit: () => void;
  onSelectStage: (stage: number) => void;
  onOpenAriaWithSample: () => void;
  onExploreMap: () => void;
  onAnalyseOwnCase: () => void;
}

export const DemoTourController: React.FC<DemoTourControllerProps> = ({
  currentStage,
  isPlaying,
  autoPausedReason,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onReplay,
  onExit,
  onSelectStage,
  onOpenAriaWithSample,
  onExploreMap,
  onAnalyseOwnCase,
}) => {
  const stageInfo = DEMO_STAGES[currentStage - 1] || DEMO_STAGES[0];

  return (
    <section
      aria-label="Guided demo tour controls"
      className="bg-[#231612] text-[#F5F1EC] border-b border-[#3D2821]"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-4 space-y-3">
        {/* Top Row: Stage Indicator + Playback Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Compass className="w-4 h-4 text-[#DED6CF] shrink-0" />
            <div className="text-xs font-medium text-[#DED6CF] whitespace-nowrap">
              Guided Demo · Stage <span className="font-mono tabular-nums text-white">{currentStage} / 6</span>
            </div>
            <span className="hidden sm:inline text-[#DED6CF]/40" aria-hidden="true">
              |
            </span>
            <div className="text-xs sm:text-sm font-semibold text-white truncate">
              {stageInfo.title}
            </div>
            {autoPausedReason && !isPlaying && (
              <span className="text-[11px] text-[#DED6CF] italic hidden md:inline">
                (Paused: {autoPausedReason})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onPrevious}
              disabled={currentStage <= 1}
              aria-label="Previous stage"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Previous</span>
            </button>

            {isPlaying ? (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPlay}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{autoPausedReason || currentStage > 1 ? 'Resume' : 'Play'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onNext}
              disabled={currentStage >= 6}
              aria-label="Next stage"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Next</span>
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onReplay}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Replay</span>
            </button>

            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 text-xs font-medium transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Exit Demo</span>
            </button>
          </div>
        </div>

        {/* 6-Stage Progress Bar */}
        <div className="grid grid-cols-6 gap-1.5" role="tablist" aria-label="Demo stages">
          {DEMO_STAGES.map((s) => {
            const active = s.stage === currentStage;
            const completed = s.stage < currentStage;
            return (
              <button
                key={s.stage}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectStage(s.stage)}
                className="text-left group cursor-pointer"
              >
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    active
                      ? 'bg-[#7E2833]'
                      : completed
                      ? 'bg-[#DED6CF]/75'
                      : 'bg-white/15 group-hover:bg-white/30'
                  }`}
                />
                <div
                  className={`mt-1 text-[11px] truncate ${
                    active ? 'text-white font-medium' : 'text-[#DED6CF]/65'
                  }`}
                >
                  {s.stage}. {s.title}
                </div>
              </button>
            );
          })}
        </div>

        {/* Stage Narrative & Contextual Stage Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1 border-t border-white/10">
          <div className="space-y-0.5 max-w-4xl">
            <div className="font-serif text-lg font-semibold text-white">
              {stageInfo.headline}
            </div>
            <p className="text-xs sm:text-sm text-[#DED6CF] leading-relaxed">
              {stageInfo.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {currentStage === 5 && (
              <button
                type="button"
                onClick={onOpenAriaWithSample}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Try Sample Question in ARIA</span>
              </button>
            )}

            {currentStage === 6 && (
              <>
                <button
                  type="button"
                  onClick={onExploreMap}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[#231612] hover:bg-[#F5F1EC] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Explore the Map</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onAnalyseOwnCase}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Analyse Your Own Case</span>
                </button>
                <button
                  type="button"
                  onClick={onReplay}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/25 hover:bg-white/10 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart Demo</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
