import React from 'react';
import { ArrowRight, Compass, FileUp } from 'lucide-react';

interface WelcomeScreenProps {
  onStartDemo: () => void;
  onStartLiveAnalysis: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStartDemo,
  onStartLiveAnalysis,
}) => {
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-12 lg:py-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
        {/* Left Editorial Positioning Column */}
        <div className="lg:col-span-7 space-y-6">
          <div className="text-xs font-medium tracking-wide text-[#7E2833]">
            Arbitalis.AI · Arbitration Intelligence Workspace
          </div>

          <div className="space-y-2">
            <h1 className="font-serif text-[clamp(2.5rem,4.6vw,4rem)] font-semibold leading-[1.06] tracking-tight text-[#231612] text-balance">
              Every dispute has two sides.
            </h1>
            <p className="font-serif text-[clamp(1.65rem,2.8vw,2.35rem)] font-medium leading-[1.18] text-[#7E2833] text-balance">
              Discover what the evidence reveals.
            </p>
          </div>

          <p className="text-base sm:text-[17px] leading-relaxed text-[#231612]/80 max-w-2xl">
            From complex case records to a clear map of the dispute. Explore how
            artificial intelligence reveals the evidence, contradictions, and
            questions that matter.
          </p>

          <p className="text-sm leading-relaxed text-[#231612]/65 max-w-xl border-t border-[#DED6CF] pt-4">
            Transform complex arbitration records into connected evidence,
            competing arguments, and actionable intelligence — with human
            judgment at the centre.
          </p>

          {/* Two Prominent Interactive Choices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              type="button"
              onClick={onStartDemo}
              className="group text-left p-6 rounded-xl bg-[#231612] text-[#F5F1EC] hover:bg-[#31201B] transition-colors cursor-pointer flex flex-col justify-between min-h-[156px]"
            >
              <div className="flex items-center justify-between">
                <Compass className="w-5 h-5 text-[#DED6CF]" />
                <ArrowRight className="w-4 h-4 text-[#DED6CF] transition-transform duration-150 group-hover:translate-x-1" />
              </div>
              <div className="pt-6">
                <div className="font-serif text-2xl font-semibold tracking-tight text-white">
                  Explore a Demo
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#DED6CF]">
                  Take a guided tour of a construction arbitration.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={onStartLiveAnalysis}
              className="group text-left p-6 rounded-xl bg-white border border-[#DED6CF] hover:border-[#7E2833] transition-colors cursor-pointer flex flex-col justify-between min-h-[156px]"
            >
              <div className="flex items-center justify-between">
                <FileUp className="w-5 h-5 text-[#7E2833]" />
                <ArrowRight className="w-4 h-4 text-[#7E2833] transition-transform duration-150 group-hover:translate-x-1" />
              </div>
              <div className="pt-6">
                <div className="font-serif text-2xl font-semibold tracking-tight text-[#231612]">
                  Analyse a Case
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#231612]/70">
                  Upload documents and uncover the dispute with Google AI.
                </p>
              </div>
            </button>
          </div>

          <div className="pt-2 text-xs text-[#231612]/55">
            Powered by Google AI Tools
          </div>
        </div>

        {/* Right Architectural Reasoning Preview */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl bg-white border border-[#DED6CF] p-7 space-y-6">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[#7E2833]">
                How Evidence Connects
              </div>
              <p className="font-serif text-xl font-semibold text-[#231612] leading-snug">
                Arbitalis.AI does not simply summarise a dispute. It reveals how
                the evidence connects — and what still needs to be established.
              </p>
            </div>

            {/* Clean Typographic Structure Diagram */}
            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-lg bg-[#231612] text-white">
                <div className="text-[11px] text-[#DED6CF]">Central Disputed Issue</div>
                <div className="text-sm font-medium mt-0.5">
                  What drove the alleged project delay?
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-[#F5F1EC] border border-[#DED6CF]">
                  <div className="text-[11px] font-medium text-[#7E2833]">Claimant Side</div>
                  <div className="text-xs font-medium text-[#231612] mt-1">
                    Supporting Letters &amp; Contractual Access Clause
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-[#F5F1EC] border border-[#DED6CF]">
                  <div className="text-[11px] font-medium text-[#231612]/70">Respondent Side</div>
                  <div className="text-xs font-medium text-[#231612] mt-1">
                    Site Logs &amp; Concurrent Equipment Delay
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-dashed border-[#7E2833]/50 bg-[#7E2833]/[0.03]">
                <div className="text-[11px] font-medium text-[#7E2833]">
                  Explicit Gap &amp; Human Determination
                </div>
                <div className="text-xs text-[#231612]/80 mt-0.5">
                  Missing records are surfaced transparently so the arbitrator
                  verifies sources and exercises final judgment.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
