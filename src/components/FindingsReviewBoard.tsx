import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  FileText,
  Scale,
} from 'lucide-react';
import type {
  ArbitrationCase,
  CitationReference,
  ReviewDecision,
} from '../types/arbitration';

interface FindingsReviewBoardProps {
  activeCase: ArbitrationCase | null;
  focusedNodeId: string | null;
  onUpdateNodeReview: (
    nodeId: string,
    decision: ReviewDecision,
    note?: string
  ) => void;
  onOpenCitation: (citation: CitationReference) => void;
  onUserInteraction: (reason: string) => void;
}

const ATTRIBUTION_LABELS: Record<string, string> = {
  party_statement: 'Statement made by a party',
  documentary_statement: 'Documentary statement',
  ai_interpretation: 'AI interpretation',
  human_finding: 'Human-reviewed finding',
};

export const FindingsReviewBoard: React.FC<FindingsReviewBoardProps> = ({
  activeCase,
  focusedNodeId,
  onUpdateNodeReview,
  onOpenCitation,
  onUserInteraction,
}) => {
  const [filter, setFilter] = useState<'all' | ReviewDecision>('all');
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  if (!activeCase || activeCase.nodes.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 text-center space-y-4">
        <Scale className="w-10 h-10 text-[#7E2833] mx-auto" />
        <h2 className="font-serif text-2xl font-semibold text-[#231612]">
          No Findings Ready for Human Review
        </h2>
        <p className="text-sm text-[#231612]/70 max-w-md mx-auto">
          Upload and analyse a case in Case Workspace, or explore the Guided
          Demo to review structured propositions against source documents.
        </p>
      </div>
    );
  }

  const reviewableNodes = activeCase.nodes.filter(
    (n) => n.category !== 'central_issue'
  );

  const filteredNodes = reviewableNodes.filter((n) =>
    filter === 'all' ? true : n.reviewDecision === filter
  );

  const counts = {
    all: reviewableNodes.length,
    pending: reviewableNodes.filter((n) => n.reviewDecision === 'pending').length,
    accepted: reviewableNodes.filter((n) => n.reviewDecision === 'accepted').length,
    rejected: reviewableNodes.filter((n) => n.reviewDecision === 'rejected').length,
    further_evidence: reviewableNodes.filter(
      (n) => n.reviewDecision === 'further_evidence'
    ).length,
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DED6CF] pb-5">
        <div className="space-y-1">
          <div className="text-xs font-medium text-[#7E2833]">
            Evidence-to-Findings Board · {activeCase.origin === 'demo' ? 'Prepared Fictional Demo' : 'Live Uploaded Case'}
          </div>
          <h1 className="font-serif text-3xl font-semibold text-[#231612]">
            Human Judgment &amp; Findings Review
          </h1>
          <p className="text-sm text-[#231612]/75 max-w-2xl">
            AI organises the evidence. The arbitrator exercises judgment. Verify
            source passages below before accepting, rejecting, or requesting
            further evidence.
          </p>
        </div>

        {/* Summary Counters */}
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-[#231612]/75">
          <span>Accepted: <strong className="text-[#2D5A3F]">{counts.accepted}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Rejected: <strong className="text-[#7E2833]">{counts.rejected}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Further Evidence: <strong className="text-[#8A5A19]">{counts.further_evidence}</strong></span>
          <span aria-hidden="true">·</span>
          <span>Pending: <strong>{counts.pending}</strong></span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-white border border-[#DED6CF] rounded-lg w-fit">
        {(
          [
            ['all', `All (${counts.all})`],
            ['pending', `Pending (${counts.pending})`],
            ['accepted', `Accepted (${counts.accepted})`],
            ['rejected', `Rejected (${counts.rejected})`],
            ['further_evidence', `Further Evidence (${counts.further_evidence})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filter === key
                ? 'bg-[#231612] text-white'
                : 'text-[#231612]/70 hover:text-[#231612]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Findings List */}
      <div className="space-y-4">
        {filteredNodes.map((node) => {
          const isFocused = focusedNodeId === node.id;
          const noteValue =
            draftNotes[node.id] !== undefined
              ? draftNotes[node.id]
              : node.reviewNote || '';

          return (
            <article
              key={node.id}
              className={`rounded-2xl bg-white border p-6 space-y-4 transition-colors ${
                isFocused
                  ? 'border-[#7E2833] ring-2 ring-[#7E2833]/20'
                  : 'border-[#DED6CF]'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#231612]/65">
                    <span className="font-semibold text-[#7E2833]">
                      {ATTRIBUTION_LABELS[node.attributionType] || node.attributionType}
                    </span>
                    {node.partyAttribution && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{node.partyAttribution}</span>
                      </>
                    )}
                    {node.isDemoReview && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-[#8A5A19]">Demo Review Data</span>
                      </>
                    )}
                    {node.reviewedAt && !node.isDemoReview && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Updated {node.reviewedAt}
                        </span>
                      </>
                    )}
                  </div>

                  <h2 className="font-serif text-xl font-semibold text-[#231612]">
                    {node.label}
                  </h2>
                  <p className="text-sm text-[#231612]/80 leading-relaxed max-w-3xl">
                    {node.explanation}
                  </p>
                </div>

                {/* Human Reviewer Decision Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onUserInteraction('Updated finding decision');
                      onUpdateNodeReview(node.id, 'accepted', noteValue);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      node.reviewDecision === 'accepted'
                        ? 'bg-[#2D5A3F] text-white border-[#2D5A3F]'
                        : 'bg-white text-[#231612] border-[#DED6CF] hover:border-[#2D5A3F]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUserInteraction('Updated finding decision');
                      onUpdateNodeReview(node.id, 'rejected', noteValue);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      node.reviewDecision === 'rejected'
                        ? 'bg-[#7E2833] text-white border-[#7E2833]'
                        : 'bg-white text-[#231612] border-[#DED6CF] hover:border-[#7E2833]'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUserInteraction('Requested further evidence');
                      onUpdateNodeReview(node.id, 'further_evidence', noteValue);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      node.reviewDecision === 'further_evidence'
                        ? 'bg-[#8A5A19] text-white border-[#8A5A19]'
                        : 'bg-white text-[#231612] border-[#DED6CF] hover:border-[#8A5A19]'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Request Further Evidence</span>
                  </button>
                </div>
              </div>

              {/* Citations */}
              {node.citations.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {node.citations.map((cit) => (
                    <div
                      key={cit.propositionId}
                      className="p-3.5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono font-medium text-[#231612]">
                          {cit.docId} · {cit.relationship}
                        </span>
                        {cit.verificationStatus === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-[#2D5A3F] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#7E2833] font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Source not verified — human review required</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs italic text-[#231612]/80">
                        &ldquo;{cit.citedExcerpt}&rdquo;
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenCitation(cit)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7E2833] hover:underline cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>
                          Inspect {cit.filename}
                          {cit.pageReference ? ` (Page ${cit.pageReference})` : ''}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Reviewer Note Input */}
              <div className="pt-3 border-t border-[#DED6CF] flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={noteValue}
                  onChange={(e) => {
                    onUserInteraction('Entering review note');
                    setDraftNotes((prev) => ({ ...prev, [node.id]: e.target.value }));
                  }}
                  placeholder="Record human arbitrator note or evidentiary direction..."
                  className="flex-1 px-3.5 py-2 rounded-lg bg-[#F5F1EC] border border-[#DED6CF] text-xs text-[#231612] placeholder:text-[#231612]/45"
                />
                <button
                  type="button"
                  onClick={() => {
                    onUserInteraction('Saved review note');
                    onUpdateNodeReview(node.id, node.reviewDecision, noteValue);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#231612] hover:bg-[#38251F] text-white text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  Save Note
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
