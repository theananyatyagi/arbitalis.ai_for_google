import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  List,
  Network,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Scale,
  X,
  ArrowRight,
  HelpCircle,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import type {
  ArbitrationCase,
  CitationReference,
  DisputeNode,
  EdgeRelationship,
  NodeCategory,
  ReviewDecision,
} from '../types/arbitration';

interface DisputeReasoningMapProps {
  activeCase: ArbitrationCase;
  selectedIssueId: string;
  onSelectIssue: (issueId: string) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onOpenCitation: (citation: CitationReference) => void;
  onOpenFindingsForNode: (nodeId: string) => void;
  onOpenAria: () => void;
  onUserInteraction: (reason: string) => void;
  demoRevealCount?: number | null;
  /** Opens the map in this presentation (used by the guided demo to open Compare Positions). */
  requestedViewMode?: 'graph' | 'compare' | 'list';
  onUpdateNodeReview?: (nodeId: string, decision: ReviewDecision, note?: string) => void;
  onAskAriaAboutNode?: (node: DisputeNode) => void;
}

const CATEGORY_META: Record<
  NodeCategory,
  { label: string; badgeClass: string; nodeStyle: string }
> = {
  central_issue: {
    label: 'Central Disputed Issue',
    badgeClass: 'text-[#F5F1EC]',
    nodeStyle: 'bg-[#231612] text-white border-2 border-[#231612] shadow-md',
  },
  claimant_position: {
    label: 'Claimant Position',
    badgeClass: 'text-[#7E2833]',
    nodeStyle: 'bg-white text-[#231612] border-2 border-[#7E2833]',
  },
  respondent_position: {
    label: 'Respondent Position',
    badgeClass: 'text-[#3D312D]',
    nodeStyle: 'bg-white text-[#231612] border-2 border-[#3D312D]',
  },
  contractual_obligation: {
    label: 'Contractual Obligation',
    badgeClass: 'text-[#231612]',
    nodeStyle: 'bg-[#F5F1EC] text-[#231612] border border-[#231612]/50',
  },
  supporting_evidence: {
    label: 'Supporting Evidence',
    badgeClass: 'text-[#2D5A3F]',
    nodeStyle: 'bg-white text-[#231612] border border-[#2D5A3F]',
  },
  contradictory_evidence: {
    label: 'Contradictory Evidence',
    badgeClass: 'text-[#7E2833]',
    nodeStyle: 'bg-[#7E2833]/[0.05] text-[#231612] border border-[#7E2833]/70',
  },
  timeline_event: {
    label: 'Timeline Event',
    badgeClass: 'text-[#5A463F]',
    nodeStyle: 'bg-[#F5F1EC] text-[#231612] border border-[#DED6CF]',
  },
  missing_evidence: {
    label: 'Missing Evidence',
    badgeClass: 'text-[#7E2833]',
    nodeStyle: 'bg-white text-[#231612] border-2 border-dashed border-[#7E2833]',
  },
  human_question: {
    label: 'Question for Human Determination',
    badgeClass: 'text-[#8A5A19]',
    nodeStyle: 'bg-[#FFFDF9] text-[#231612] border border-[#8A5A19]',
  },
};

const ATTRIBUTION_LABELS: Record<string, string> = {
  party_statement: 'Statement made by a party',
  documentary_statement: 'Documentary statement',
  ai_interpretation: 'AI interpretation',
  human_finding: 'Human-reviewed finding',
};

const EDGE_COLOR: Record<EdgeRelationship, string> = {
  Supports: '#2D5A3F',
  Contradicts: '#7E2833',
  'Relates to': '#6F635E',
  'Depends on': '#231612',
  'Requires Verification': '#8A5A19',
};

interface PositionedNode {
  node: DisputeNode;
  x: number;
  y: number;
}

export const DisputeReasoningMap: React.FC<DisputeReasoningMapProps> = ({
  activeCase,
  selectedIssueId,
  onSelectIssue,
  selectedNodeId,
  onSelectNode,
  onOpenCitation,
  onOpenFindingsForNode,
  onOpenAria,
  onUserInteraction,
  demoRevealCount = null,
  requestedViewMode,
  onUpdateNodeReview,
  onAskAriaAboutNode,
}) => {
  const [viewMode, setViewMode] = useState<'graph' | 'compare' | 'list'>(requestedViewMode ?? 'graph');
  useEffect(() => {
    if (requestedViewMode) setViewMode(requestedViewMode);
  }, [requestedViewMode]);
  const [zoom, setZoom] = useState<number>(0.92);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [draftNote, setDraftNote] = useState<string>('');
  const [noteSavedFeedback, setNoteSavedFeedback] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const currentIssue =
    activeCase.issues.find((i) => i.id === selectedIssueId) || activeCase.issues[0];

  const issueNodes = useMemo(() => {
    const filtered = activeCase.nodes.filter((n) => n.issueId === currentIssue?.id);
    if (demoRevealCount !== null && demoRevealCount >= 0) {
      return filtered.slice(0, Math.max(1, demoRevealCount));
    }
    return filtered;
  }, [activeCase.nodes, currentIssue?.id, demoRevealCount]);

  // Determine hidden descendant nodes from collapsed parent nodes
  const visibleNodes = useMemo(() => {
    const hidden = new Set<string>();
    const markDescendants = (parentId: string) => {
      issueNodes.forEach((n) => {
        if (n.parentId === parentId && !hidden.has(n.id)) {
          hidden.add(n.id);
          markDescendants(n.id);
        }
      });
    };
    collapsedParents.forEach((pid) => markDescendants(pid));
    return issueNodes.filter((n) => !hidden.has(n.id));
  }, [issueNodes, collapsedParents]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes]
  );

  const visibleEdges = useMemo(
    () =>
      activeCase.edges.filter(
        (e) =>
          e.issueId === currentIssue?.id &&
          visibleNodeIds.has(e.source) &&
          visibleNodeIds.has(e.target)
      ),
    [activeCase.edges, currentIssue?.id, visibleNodeIds]
  );

  // Semantic, collision-free layout:
  // Central Issue at center (640, 380)
  // Claimant branch on Left (x < 640)
  // Respondent branch on Right (x > 640)
  // Contractual obligations & timelines on Top (y < 380)
  // Missing evidence & human questions on Bottom (y > 380)
  const layoutNodes: PositionedNode[] = useMemo(() => {
    const centerX = 640;
    const centerY = 380;
    const central =
      visibleNodes.find((n) => n.category === 'central_issue') || visibleNodes[0];
    if (!central) return [];

    const positions = new Map<string, PositionedNode>();
    positions.set(central.id, { node: central, x: centerX, y: centerY });

    const claimantPos = visibleNodes.find((n) => n.category === 'claimant_position');
    const respondentPos = visibleNodes.find((n) => n.category === 'respondent_position');
    const supportingEv = visibleNodes.filter((n) => n.category === 'supporting_evidence');
    const contradictoryEv = visibleNodes.filter((n) => n.category === 'contradictory_evidence');
    const obligations = visibleNodes.filter((n) => n.category === 'contractual_obligation');
    const timelines = visibleNodes.filter((n) => n.category === 'timeline_event');
    const missingEv = visibleNodes.filter((n) => n.category === 'missing_evidence');
    const humanQs = visibleNodes.filter((n) => n.category === 'human_question');

    // Position Claimant branch cleanly on the Left
    if (claimantPos) {
      positions.set(claimantPos.id, { node: claimantPos, x: 300, y: 350 });
      supportingEv.forEach((n, idx) => {
        const yPos = supportingEv.length === 1 ? 210 : idx === 0 ? 190 : 510;
        positions.set(n.id, { node: n, x: 120, y: yPos });
      });
    }

    // Position Respondent branch cleanly on the Right
    if (respondentPos) {
      positions.set(respondentPos.id, { node: respondentPos, x: 980, y: 350 });
      contradictoryEv.forEach((n, idx) => {
        const yPos = contradictoryEv.length === 1 ? 210 : idx === 0 ? 190 : 510;
        positions.set(n.id, { node: n, x: 1160, y: yPos });
      });
    }

    // Position Contractual obligations & timelines on Top
    const topNodes = [...obligations, ...timelines];
    topNodes.forEach((n, idx) => {
      const xOffset =
        topNodes.length === 1
          ? centerX
          : idx === 0
          ? centerX - 180
          : centerX + 180;
      positions.set(n.id, { node: n, x: xOffset, y: 130 });
    });

    // Position Missing evidence & Human questions on Bottom
    const bottomNodes = [...missingEv, ...humanQs];
    bottomNodes.forEach((n, idx) => {
      const xOffset =
        bottomNodes.length === 1
          ? centerX
          : idx === 0
          ? centerX - 180
          : centerX + 180;
      positions.set(n.id, { node: n, x: xOffset, y: 640 });
    });

    // Fallback for any unpositioned nodes
    const remaining = visibleNodes.filter((n) => !positions.has(n.id));
    remaining.forEach((n, idx) => {
      const angle = (idx / Math.max(1, remaining.length)) * Math.PI * 2;
      positions.set(n.id, {
        node: n,
        x: Math.round(centerX + Math.cos(angle) * 360),
        y: Math.round(centerY + Math.sin(angle) * 220),
      });
    });

    return Array.from(positions.values());
  }, [visibleNodes]);

  const positionLookup = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    layoutNodes.forEach((p) => map.set(p.node.id, p));
    return map;
  }, [layoutNodes]);

  const selectedNode = useMemo(
    () => visibleNodes.find((n) => n.id === selectedNodeId) || null,
    [visibleNodes, selectedNodeId]
  );

  useEffect(() => {
    if (selectedNode) {
      setDraftNote(selectedNode.reviewNote || '');
      setNoteSavedFeedback(false);
    }
  }, [selectedNode?.id]);

  // Connected nodes & edges for highlighting
  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    if (!selectedNode) return set;
    set.add(selectedNode.id);
    visibleEdges.forEach((e) => {
      if (e.source === selectedNode.id) set.add(e.target);
      if (e.target === selectedNode.id) set.add(e.source);
    });
    return set;
  }, [selectedNode, visibleEdges]);

  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    issueNodes.forEach((n) => {
      if (n.parentId) {
        map.set(n.parentId, (map.get(n.parentId) || 0) + 1);
      }
    });
    return map;
  }, [issueNodes]);

  useEffect(() => {
    // Reset pan when switching issues
    setPan({ x: 0, y: 0 });
    setZoom(0.92);
  }, [currentIssue?.id]);

  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUserInteraction('Expanding or collapsing branch');
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node-card="true"]')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    setPan({
      x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.y),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  if (activeCase.nodes.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-16 text-center space-y-4">
        <Network className="w-10 h-10 text-[#7E2833] mx-auto" />
        <h2 className="font-serif text-2xl font-semibold text-[#231612]">
          No Dispute Reasoning Map Generated Yet
        </h2>
        <p className="text-sm text-[#231612]/70 max-w-md mx-auto">
          Upload up to 5 PDF documents in Case Workspace and run Google AI
          analysis to build an interactive evidence graph for your case.
        </p>
      </div>
    );
  }

  // Segment issue nodes for the Priority A End-to-End Investigation View
  const claimantPositionNode = issueNodes.find((n) => n.category === 'claimant_position');
  const respondentPositionNode = issueNodes.find((n) => n.category === 'respondent_position');
  const claimantEvidenceNodes = issueNodes.filter((n) => n.category === 'supporting_evidence');
  const respondentEvidenceNodes = issueNodes.filter((n) => n.category === 'contradictory_evidence');
  const contractualObligations = issueNodes.filter((n) => n.category === 'contractual_obligation');
  const missingEvidenceNodes = issueNodes.filter((n) => n.category === 'missing_evidence');
  const humanQuestions = issueNodes.filter((n) => n.category === 'human_question');

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-4">
      {/* Top Toolbar: Issue Selector + View Toggle + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#DED6CF]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#231612]/65">
            <span className="font-medium text-[#7E2833]">
              {activeCase.origin === 'demo' ? 'Prepared Demo Analysis' : 'Live Case Analysis'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{activeCase.title}</span>
          </div>

          {/* Multi-issue switcher */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {activeCase.issues.map((issue) => {
              const active = issue.id === currentIssue?.id;
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => {
                    onSelectIssue(issue.id);
                    onSelectNode(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#231612] text-white shadow-sm'
                      : 'bg-white border border-[#DED6CF] text-[#231612]/80 hover:border-[#7E2833]'
                  }`}
                >
                  {issue.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Three View Modes: Interactive Map, Compare Positions (Priority A), List View */}
          <div className="flex items-center gap-1 p-1 bg-white border border-[#DED6CF] rounded-lg shadow-xs">
            <button
              type="button"
              onClick={() => {
                onUserInteraction('Switched to Interactive Map view');
                setViewMode('graph');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'graph'
                  ? 'bg-[#231612] text-white'
                  : 'text-[#231612]/70 hover:text-[#231612]'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>Interactive Map</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onUserInteraction('Switched to Compare Positions view');
                setViewMode('compare');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'compare'
                  ? 'bg-[#231612] text-white'
                  : 'text-[#231612]/70 hover:text-[#231612]'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Compare Positions</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onUserInteraction('Switched to Simplified List view');
                setViewMode('list');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#231612] text-white'
                  : 'text-[#231612]/70 hover:text-[#231612]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onUserInteraction('Opening ARIA from Dispute Map');
              onOpenAria();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ask ARIA</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'compare' ? (
        /* ========================================================================= */
        /* PRIORITY A: END-TO-END ISSUE INVESTIGATION & CONFRONTATION BOARD           */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Issue Header Banner */}
          <section className="rounded-2xl bg-white border border-[#DED6CF] p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-2.5 py-1 rounded-md bg-[#231612] text-white text-[11px] font-semibold tracking-wide uppercase">
                Primary Disputed Issue · End-to-End Investigation
              </span>
              <span className="text-xs text-[#231612]/60 font-mono">
                {issueNodes.length} connected reasoning nodes · {contractualObligations.length} clauses
              </span>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-[#231612]">
              {currentIssue?.question}
            </h2>
            <p className="text-sm text-[#231612]/80 leading-relaxed max-w-4xl">
              {currentIssue?.summary}
            </p>
          </section>

          {/* Confrontation Grid: Claimant vs. Respondent */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Claimant Column */}
            <div className="lg:col-span-5 rounded-2xl bg-white border-2 border-[#7E2833]/30 p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-[#DED6CF] pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#7E2833]">
                      Claimant Case · ABC Contractors
                    </span>
                    <h3 className="font-serif text-lg font-semibold text-[#231612] mt-0.5">
                      {claimantPositionNode ? claimantPositionNode.label : 'Claimant Position'}
                    </h3>
                  </div>
                  {claimantPositionNode && (
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                        claimantPositionNode.reviewDecision === 'accepted'
                          ? 'bg-[#2D5A3F]/15 text-[#2D5A3F]'
                          : claimantPositionNode.reviewDecision === 'rejected'
                          ? 'bg-[#7E2833]/15 text-[#7E2833]'
                          : 'bg-[#8A5A19]/15 text-[#8A5A19]'
                      }`}
                    >
                      {claimantPositionNode.reviewDecision.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#231612]/80 leading-relaxed">
                  {claimantPositionNode?.explanation}
                </p>

                {/* Primary Pleading Citation */}
                {claimantPositionNode?.citations.map((c) => (
                  <div
                    key={c.propositionId}
                    className="p-3.5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-[#7E2833]">
                        {c.docId} · Pleading Citation
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-[#2D5A3F] text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified Quote</span>
                      </span>
                    </div>
                    <blockquote className="text-xs italic text-[#231612]/90 leading-relaxed border-l-2 border-[#7E2833] pl-2.5">
                      &ldquo;{c.citedExcerpt}&rdquo;
                    </blockquote>
                    <button
                      type="button"
                      onClick={() => onOpenCitation(c)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7E2833] hover:underline cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        Open {c.filename} {c.pageReference ? `(Page ${c.pageReference})` : ''}
                      </span>
                    </button>
                  </div>
                ))}

                {/* Supporting Exhibits */}
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#2D5A3F] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Supporting Contemporaneous Evidence ({claimantEvidenceNodes.length})</span>
                  </div>
                  {claimantEvidenceNodes.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl bg-[#2D5A3F]/[0.04] border border-[#2D5A3F]/30 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#231612]">{ev.label}</span>
                        {ev.dateLabel && (
                          <span className="text-[11px] font-mono text-[#231612]/60">
                            {ev.dateLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#231612]/75 leading-relaxed">{ev.explanation}</p>
                      {ev.citations.map((c) => (
                        <div key={c.propositionId} className="pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenCitation(c)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2D5A3F] hover:underline cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              Inspect {c.filename} {c.pageReference ? `(Page ${c.pageReference})` : ''}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Actions for Claimant Position */}
              {claimantPositionNode && onUpdateNodeReview && (
                <div className="pt-3 border-t border-[#DED6CF] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#231612]/60">Tribunal review:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNodeReview(claimantPositionNode.id, 'accepted', 'Claimant delay confirmed by contemporaneous notice.')
                      }
                      className="px-2.5 py-1 rounded bg-[#2D5A3F] hover:bg-[#234731] text-white text-[11px] font-medium cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNodeReview(claimantPositionNode.id, 'rejected', 'Barred by concurrent delay under Clause 8.3.')
                      }
                      className="px-2.5 py-1 rounded bg-[#7E2833] hover:bg-[#631F28] text-white text-[11px] font-medium cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNodeReview(claimantPositionNode.id, 'further_evidence', 'Requires critical-path schedule comparison.')
                      }
                      className="px-2.5 py-1 rounded bg-[#F5F1EC] border border-[#DED6CF] text-[#231612] text-[11px] font-medium cursor-pointer"
                    >
                      Further Evidence
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Central Confrontation & Governing Rules Bridge */}
            <div className="lg:col-span-2 flex flex-col justify-center items-center text-center p-4 space-y-4 rounded-2xl bg-[#F5F1EC] border border-[#DED6CF]">
              <div className="w-10 h-10 rounded-full bg-[#7E2833] text-white flex items-center justify-center font-bold shadow-sm">
                VS
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-[#7E2833]">
                  Direct Conflict
                </div>
                <div className="text-[11px] text-[#231612]/75 leading-tight font-medium">
                  Site Access Delay vs. Concurrent Crane Failure
                </div>
              </div>
              <div className="w-full border-t border-[#DED6CF] pt-3 text-left space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#231612]">
                  Legal Bar
                </span>
                <p className="text-[11px] text-[#231612]/75 leading-relaxed">
                  Under <strong>Clause 8.3</strong>, an Employer delay does not grant compensable time if Contractor delay ran concurrently.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenAria}
                className="w-full py-2 px-3 rounded-lg bg-[#231612] hover:bg-[#38251F] text-white text-[11px] font-medium cursor-pointer transition-colors"
              >
                Synthesize with ARIA
              </button>
            </div>

            {/* Respondent Column */}
            <div className="lg:col-span-5 rounded-2xl bg-white border-2 border-[#3D312D]/30 p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-[#DED6CF] pb-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#3D312D]">
                      Respondent Defence · XYZ Infrastructure
                    </span>
                    <h3 className="font-serif text-lg font-semibold text-[#231612] mt-0.5">
                      {respondentPositionNode ? respondentPositionNode.label : 'Respondent Position'}
                    </h3>
                  </div>
                  {respondentPositionNode && (
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                        respondentPositionNode.reviewDecision === 'accepted'
                          ? 'bg-[#2D5A3F]/15 text-[#2D5A3F]'
                          : respondentPositionNode.reviewDecision === 'rejected'
                          ? 'bg-[#7E2833]/15 text-[#7E2833]'
                          : 'bg-[#8A5A19]/15 text-[#8A5A19]'
                      }`}
                    >
                      {respondentPositionNode.reviewDecision.replace('_', ' ')}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#231612]/80 leading-relaxed">
                  {respondentPositionNode?.explanation}
                </p>

                {/* Primary Defence Pleading Citation */}
                {respondentPositionNode?.citations.map((c) => (
                  <div
                    key={c.propositionId}
                    className="p-3.5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-[#3D312D]">
                        {c.docId} · Pleading Citation
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-[#2D5A3F] text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verified Quote</span>
                      </span>
                    </div>
                    <blockquote className="text-xs italic text-[#231612]/90 leading-relaxed border-l-2 border-[#3D312D] pl-2.5">
                      &ldquo;{c.citedExcerpt}&rdquo;
                    </blockquote>
                    <button
                      type="button"
                      onClick={() => onOpenCitation(c)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3D312D] hover:underline cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        Open {c.filename} {c.pageReference ? `(Page ${c.pageReference})` : ''}
                      </span>
                    </button>
                  </div>
                ))}

                {/* Contradictory Evidence */}
                <div className="space-y-3 pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#7E2833] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Contradictory Technical Evidence ({respondentEvidenceNodes.length})</span>
                  </div>
                  {respondentEvidenceNodes.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl bg-[#7E2833]/[0.04] border border-[#7E2833]/30 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#231612]">{ev.label}</span>
                        {ev.dateLabel && (
                          <span className="text-[11px] font-mono text-[#231612]/60">
                            {ev.dateLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#231612]/75 leading-relaxed">{ev.explanation}</p>
                      {ev.citations.map((c) => (
                        <div key={c.propositionId} className="pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenCitation(c)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7E2833] hover:underline cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              Inspect {c.filename} {c.pageReference ? `(Page ${c.pageReference})` : ''}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Actions for Respondent Position */}
              {respondentPositionNode && onUpdateNodeReview && (
                <div className="pt-3 border-t border-[#DED6CF] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-[#231612]/60">Tribunal review:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNodeReview(respondentPositionNode.id, 'accepted', 'Crane breakdown establishes concurrent delay.')
                      }
                      className="px-2.5 py-1 rounded bg-[#2D5A3F] hover:bg-[#234731] text-white text-[11px] font-medium cursor-pointer"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNodeReview(respondentPositionNode.id, 'rejected', 'No proof that crane affected critical path.')
                      }
                      className="px-2.5 py-1 rounded bg-[#7E2833] hover:bg-[#631F28] text-white text-[11px] font-medium cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateNodeReview(respondentPositionNode.id, 'further_evidence', 'Awaiting contemporaneous baseline programme.')
                      }
                      className="px-2.5 py-1 rounded bg-[#F5F1EC] border border-[#DED6CF] text-[#231612] text-[11px] font-medium cursor-pointer"
                    >
                      Further Evidence
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Governing Contractual Clauses & Missing Evidence Gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contractual Foundation */}
            <div className="rounded-2xl bg-white border border-[#DED6CF] p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-[#DED6CF] pb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#231612]">
                  Governing Contractual Framework
                </div>
                <span className="text-[11px] font-mono text-[#231612]/60">Subcontract Package C-4</span>
              </div>
              <div className="space-y-3">
                {contractualObligations.map((obl) => (
                  <div
                    key={obl.id}
                    className="p-3.5 rounded-xl bg-[#F5F1EC] border border-[#231612]/20 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#231612]">{obl.label}</span>
                      <span className="text-[10px] font-semibold text-[#2D5A3F] bg-[#2D5A3F]/10 px-2 py-0.5 rounded">
                        Binding Clause
                      </span>
                    </div>
                    <p className="text-xs text-[#231612]/75 leading-relaxed">{obl.explanation}</p>
                    {obl.citations.map((c) => (
                      <button
                        key={c.propositionId}
                        type="button"
                        onClick={() => onOpenCitation(c)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#231612] hover:underline cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>
                          Open Subcontract Agreement {c.pageReference ? `(Page ${c.pageReference})` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Evidentiary Gaps & Human Questions */}
            <div className="rounded-2xl bg-white border-2 border-dashed border-[#7E2833]/40 p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-[#DED6CF] pb-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#7E2833] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Evidentiary Gap &amp; Human Determination</span>
                </div>
                <span className="text-[10px] font-semibold text-[#7E2833] bg-[#7E2833]/10 px-2 py-0.5 rounded">
                  Unverified / Missing Record
                </span>
              </div>

              {missingEvidenceNodes.map((gap) => (
                <div
                  key={gap.id}
                  className="p-3.5 rounded-xl bg-[#7E2833]/[0.04] border border-[#7E2833]/30 space-y-2"
                >
                  <div className="text-xs font-semibold text-[#231612]">{gap.label}</div>
                  <p className="text-xs text-[#231612]/75 leading-relaxed">{gap.explanation}</p>
                  <div className="text-[11px] text-[#7E2833] font-medium">
                    ⚠️ The Baseline Programme is referenced in pleadings but was never submitted into the case record. Arbitalis.AI flags this gap rather than inventing critical-path data.
                  </div>
                </div>
              ))}

              {humanQuestions.map((q) => (
                <div
                  key={q.id}
                  className="p-3.5 rounded-xl bg-[#FFFDF9] border border-[#8A5A19]/40 space-y-2"
                >
                  <div className="text-xs font-bold text-[#8A5A19] flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Question Reserved for Human Tribunal</span>
                  </div>
                  <p className="text-xs text-[#231612]/80 leading-relaxed font-medium">
                    {q.label}: {q.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Main Split: Interactive Graph / Simplified List + Contextual Side Panel */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className={selectedNode ? 'lg:col-span-8' : 'lg:col-span-12'}>
            {viewMode === 'graph' ? (
              <div className="relative rounded-2xl bg-white border border-[#DED6CF] overflow-hidden">
                {/* Zoom & Pan Controls */}
                <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-white/95 border border-[#DED6CF] rounded-lg p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.12).toFixed(2))))}
                    aria-label="Zoom in"
                    className="p-1.5 rounded hover:bg-[#F5F1EC] text-[#231612] cursor-pointer"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <span className="px-1.5 text-[11px] font-mono tabular-nums text-[#231612]/70">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.12).toFixed(2))))}
                    aria-label="Zoom out"
                    className="p-1.5 rounded hover:bg-[#F5F1EC] text-[#231612] cursor-pointer"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(0.92);
                      setPan({ x: 0, y: 0 });
                    }}
                    aria-label="Reset view / Fit to screen"
                    className="p-1.5 rounded hover:bg-[#F5F1EC] text-[#231612] cursor-pointer"
                    title="Fit to Screen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Graph Canvas */}
                <div
                  className={`relative w-full h-[660px] bg-[#F5F1EC]/45 select-none overflow-hidden ${
                    isDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <div
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                      width: '1280px',
                      height: '800px',
                    }}
                    className="relative mx-auto transition-transform duration-75"
                  >
                    {/* Edges SVG Layer */}
                    <svg
                      width="1280"
                      height="800"
                      className="absolute inset-0 pointer-events-none"
                      aria-hidden="true"
                    >
                      <defs>
                        {Object.entries(EDGE_COLOR).map(([rel, color]) => (
                          <marker
                            key={rel}
                            id={`arrow-${rel.replace(/\s+/g, '-')}`}
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 1 L 10 5 L 0 9 z" fill={color} />
                          </marker>
                        ))}
                      </defs>

                      {visibleEdges.map((edge) => {
                        const src = positionLookup.get(edge.source);
                        const dst = positionLookup.get(edge.target);
                        if (!src || !dst) return null;

                        const isHighlighted =
                          !selectedNode ||
                          edge.source === selectedNode.id ||
                          edge.target === selectedNode.id;

                        const color = EDGE_COLOR[edge.relationship] || '#6F635E';
                        const dx = dst.x - src.x;
                        const dy = dst.y - src.y;
                        const curve = Math.min(50, Math.abs(dy) * 0.25);
                        const pathD = `M ${src.x} ${src.y} C ${src.x + dx * 0.35} ${src.y + (dy > 0 ? curve : -curve)}, ${dst.x - dx * 0.35} ${dst.y - (dy > 0 ? curve : -curve)}, ${dst.x} ${dst.y}`;

                        const midX = (src.x + dst.x) / 2;
                        const midY = (src.y + dst.y) / 2;

                        return (
                          <g key={edge.id} opacity={isHighlighted ? 0.95 : 0.2}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={color}
                              strokeWidth={isHighlighted && selectedNode ? 2.2 : 1.5}
                              strokeDasharray={
                                edge.relationship === 'Requires Verification'
                                  ? '5,4'
                                  : undefined
                              }
                              markerEnd={`url(#arrow-${edge.relationship.replace(/\s+/g, '-')})`}
                            />
                            <rect
                              x={midX - 52}
                              y={midY - 9}
                              width="104"
                              height="18"
                              rx="4"
                              fill="#FFFFFF"
                              stroke="#DED6CF"
                              strokeWidth="1"
                            />
                            <text
                              x={midX}
                              y={midY + 3.5}
                              textAnchor="middle"
                              fontSize="9.5"
                              fontWeight="600"
                              fill={color}
                            >
                              {edge.relationship}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Interactive Node Cards */}
                    {layoutNodes.map(({ node, x, y }) => {
                      const meta = CATEGORY_META[node.category];
                      const isSelected = selectedNode?.id === node.id;
                      const isConnected = !selectedNode || connectedIds.has(node.id);
                      const childCount = childCountMap.get(node.id) || 0;
                      const isCollapsed = collapsedParents.has(node.id);

                      return (
                        <div
                          key={node.id}
                          data-node-card="true"
                          style={{
                            left: `${x}px`,
                            top: `${y}px`,
                            transform: 'translate(-50%, -50%)',
                            opacity: isConnected ? 1 : 0.35,
                          }}
                          className="absolute w-[228px] transition-opacity duration-150"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onUserInteraction(`Inspecting node "${node.label}"`);
                              onSelectNode(node.id);
                            }}
                            className={`w-full text-left p-3.5 rounded-xl transition-all cursor-pointer ${
                              meta.nodeStyle
                            } ${
                              isSelected
                                ? 'ring-3 ring-[#7E2833]/40 shadow-lg scale-[1.02]'
                                : 'hover:shadow-md'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className={`text-[10px] font-semibold tracking-wide ${meta.badgeClass}`}>
                                {meta.label}
                              </span>
                              {node.reviewDecision !== 'pending' && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                    node.reviewDecision === 'accepted'
                                      ? 'bg-[#2D5A3F]/20 text-[#2D5A3F]'
                                      : node.reviewDecision === 'rejected'
                                      ? 'bg-[#7E2833]/20 text-[#7E2833]'
                                      : 'bg-[#8A5A19]/20 text-[#8A5A19]'
                                  }`}
                                >
                                  {node.reviewDecision.replace('_', ' ')}
                                </span>
                              )}
                            </div>

                            <div className="mt-1.5 text-xs font-semibold leading-snug line-clamp-2">
                              {node.label}
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[10px]">
                              <span
                                className={
                                  node.category === 'central_issue'
                                    ? 'text-[#DED6CF]'
                                    : 'text-[#231612]/60'
                                }
                              >
                                {node.citations.length > 0
                                  ? `${node.citations.length} source${node.citations.length > 1 ? 's' : ''}`
                                  : node.category === 'missing_evidence'
                                  ? 'Gap flagged'
                                  : 'Core issue'}
                              </span>

                              {childCount > 0 && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => toggleCollapse(node.id, e)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleCollapse(node.id, e as unknown as React.MouseEvent);
                                    }
                                  }}
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium ${
                                    node.category === 'central_issue'
                                      ? 'bg-white/15 text-white hover:bg-white/25'
                                      : 'bg-[#F5F1EC] text-[#231612] hover:bg-[#DED6CF]'
                                  }`}
                                >
                                  {isCollapsed ? (
                                    <>
                                      <ChevronRight className="w-3 h-3" />
                                      <span>Expand ({childCount})</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3 h-3" />
                                      <span>Collapse</span>
                                    </>
                                  )}
                                </span>
                              )}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Map Legend */}
                <div className="px-5 py-3 bg-white border-t border-[#DED6CF] flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[#231612]/80">
                  <span className="font-semibold text-[#231612]">Legend:</span>
                  <span>Central Issue (Espresso)</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#7E2833] font-medium">Claimant / Contradiction (Left / Burgundy)</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#2D5A3F] font-medium">Supporting Evidence (Sage)</span>
                  <span aria-hidden="true">·</span>
                  <span>Contractual Framework (Top)</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#7E2833]">Missing Evidence Gap (Dashed / Bottom)</span>
                </div>
              </div>
            ) : (
              /* Simplified Accessible List View */
              <div className="space-y-3">
                {visibleNodes.map((node) => {
                  const meta = CATEGORY_META[node.category];
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        onUserInteraction(`Inspecting node "${node.label}"`);
                        onSelectNode(node.id);
                      }}
                      className={`w-full text-left p-5 rounded-xl bg-white border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[#7E2833] ring-2 ring-[#7E2833]/20'
                          : 'border-[#DED6CF] hover:border-[#7E2833]/50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className={`font-semibold ${meta.badgeClass}`}>{meta.label}</span>
                        <span className="text-[#231612]/60">
                          {ATTRIBUTION_LABELS[node.attributionType] || node.attributionType}
                        </span>
                      </div>
                      <div className="font-serif text-lg font-semibold text-[#231612] mt-1">
                        {node.label}
                      </div>
                      <p className="text-xs text-[#231612]/75 mt-1 leading-relaxed">
                        {node.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Contextual Node Detail Side Panel */}
          {selectedNode && (
            <aside
              aria-label="Selected evidence node details"
              className="lg:col-span-4 rounded-2xl bg-white border border-[#DED6CF] overflow-hidden shadow-xs"
            >
              <div className="px-5 py-4 bg-[#F5F1EC] border-b border-[#DED6CF] flex items-start justify-between gap-3">
                <div>
                  <div className={`text-[11px] font-semibold ${CATEGORY_META[selectedNode.category].badgeClass}`}>
                    {CATEGORY_META[selectedNode.category].label}
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-[#231612] mt-0.5 leading-snug">
                    {selectedNode.label}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectNode(null)}
                  aria-label="Close node detail panel"
                  className="p-1.5 rounded-lg text-[#231612]/65 hover:text-[#231612] hover:bg-[#DED6CF]/40 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5 text-sm">
                {/* Attribution & Review State */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-[#DED6CF] pb-3">
                  <div className="text-[#231612]/70">
                    <strong className="text-[#231612]">Attribution:</strong>{' '}
                    {ATTRIBUTION_LABELS[selectedNode.attributionType] || selectedNode.attributionType}
                    {selectedNode.partyAttribution && ` (${selectedNode.partyAttribution})`}
                  </div>
                  {onAskAriaAboutNode && (
                    <button
                      type="button"
                      onClick={() => onAskAriaAboutNode(selectedNode)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7E2833] hover:underline cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Ask ARIA</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#231612]">Synthesis &amp; Context</div>
                  <p className="text-xs sm:text-sm text-[#231612]/80 leading-relaxed">
                    {selectedNode.explanation}
                  </p>
                </div>

                {/* Citations & Source Verification (Priority C) */}
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-[#231612]">
                    Source Citations &amp; Verbatim Proof
                  </div>
                  {selectedNode.citations.length === 0 ? (
                    <p className="text-xs text-[#231612]/65">
                      {selectedNode.category === 'missing_evidence'
                        ? 'Flagged evidentiary gap: document referenced in pleadings but missing from case record.'
                        : 'Central synthesis node connecting competing positions and documentary exhibits.'}
                    </p>
                  ) : (
                    selectedNode.citations.map((cit) => (
                      <div
                        key={cit.propositionId}
                        className="p-3.5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono font-medium text-[#231612]">
                            {cit.docId} · {cit.relationship}
                          </span>
                          {cit.verificationStatus === 'verified' ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#2D5A3F] bg-[#2D5A3F]/10 px-2 py-0.5 rounded text-[10px]">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Verified (PDF.js)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#7E2833] bg-[#7E2833]/10 px-2 py-0.5 rounded text-[10px]">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Unverified</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs italic text-[#231612]/85 leading-relaxed border-l-2 border-[#7E2833] pl-2">
                          &ldquo;{cit.citedExcerpt}&rdquo;
                        </p>

                        {cit.verificationStatus !== 'verified' && (
                          <p className="text-[11px] font-medium text-[#7E2833]">
                            {cit.verificationReason ||
                              'Source not verified — human review required.'}
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={() => onOpenCitation(cit)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7E2833] hover:underline cursor-pointer pt-0.5"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            Open {cit.filename}
                            {cit.pageReference ? ` (Page ${cit.pageReference})` : ''}
                          </span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Human Review Decision Status (Priority D) */}
                <div className="pt-3 border-t border-[#DED6CF] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#231612]/65">Arbitrator finding:</span>
                    <span
                      className={`font-semibold capitalize px-2 py-0.5 rounded text-[11px] ${
                        selectedNode.reviewDecision === 'accepted'
                          ? 'bg-[#2D5A3F]/15 text-[#2D5A3F]'
                          : selectedNode.reviewDecision === 'rejected'
                          ? 'bg-[#7E2833]/15 text-[#7E2833]'
                          : selectedNode.reviewDecision === 'further_evidence'
                          ? 'bg-[#8A5A19]/15 text-[#8A5A19]'
                          : 'bg-[#DED6CF]/50 text-[#231612]/70'
                      }`}
                    >
                      {selectedNode.reviewDecision.replace('_', ' ')}
                    </span>
                  </div>

                  {onUpdateNodeReview && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNodeReview(selectedNode.id, 'accepted', draftNote);
                            setNoteSavedFeedback(true);
                          }}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            selectedNode.reviewDecision === 'accepted'
                              ? 'bg-[#2D5A3F] text-white border-[#2D5A3F]'
                              : 'bg-white text-[#2D5A3F] border-[#2D5A3F]/40 hover:bg-[#2D5A3F]/10'
                          }`}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNodeReview(selectedNode.id, 'rejected', draftNote);
                            setNoteSavedFeedback(true);
                          }}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            selectedNode.reviewDecision === 'rejected'
                              ? 'bg-[#7E2833] text-white border-[#7E2833]'
                              : 'bg-white text-[#7E2833] border-[#7E2833]/40 hover:bg-[#7E2833]/10'
                          }`}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateNodeReview(selectedNode.id, 'further_evidence', draftNote);
                            setNoteSavedFeedback(true);
                          }}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            selectedNode.reviewDecision === 'further_evidence'
                              ? 'bg-[#8A5A19] text-white border-[#8A5A19]'
                              : 'bg-white text-[#8A5A19] border-[#8A5A19]/40 hover:bg-[#8A5A19]/10'
                          }`}
                        >
                          Need Info
                        </button>
                      </div>

                      <div className="space-y-1 pt-1">
                        <label htmlFor="node-review-note" className="text-[11px] font-medium text-[#231612]/70">
                          Reviewer Assessment Note:
                        </label>
                        <textarea
                          id="node-review-note"
                          rows={2}
                          value={draftNote}
                          onChange={(e) => {
                            setDraftNote(e.target.value);
                            setNoteSavedFeedback(false);
                          }}
                          placeholder="Record reason for accepting/rejecting this proposition..."
                          className="w-full p-2 text-xs rounded-lg border border-[#DED6CF] bg-[#F5F1EC] text-[#231612] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#7E2833]"
                        />
                        <div className="flex items-center justify-between text-[11px]">
                          {noteSavedFeedback ? (
                            <span className="text-[#2D5A3F] font-medium">✓ Finding note saved</span>
                          ) : (
                            <span className="text-[#231612]/50">Click decision above to save note</span>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenFindingsForNode(selectedNode.id)}
                            className="font-medium text-[#7E2833] hover:underline"
                          >
                            Open Review Board →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
};
