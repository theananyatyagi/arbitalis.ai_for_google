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
} from 'lucide-react';
import type {
  ArbitrationCase,
  CitationReference,
  DisputeNode,
  EdgeRelationship,
  NodeCategory,
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
}) => {
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [zoom, setZoom] = useState<number>(0.92);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

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

  // Deterministic, collision-free radial/hierarchical layout centered at (620, 390)
  const layoutNodes: PositionedNode[] = useMemo(() => {
    const centerX = 620;
    const centerY = 390;
    const central =
      visibleNodes.find((n) => n.category === 'central_issue') || visibleNodes[0];
    if (!central) return [];

    const ring1 = visibleNodes.filter(
      (n) =>
        n.id !== central.id &&
        (!n.parentId || n.parentId === central.id)
    );
    const ring2 = visibleNodes.filter(
      (n) =>
        n.id !== central.id &&
        n.parentId &&
        n.parentId !== central.id
    );

    const positions = new Map<string, PositionedNode>();
    positions.set(central.id, { node: central, x: centerX, y: centerY });

    const r1RadiusX = 330;
    const r1RadiusY = 215;
    ring1.forEach((node, idx) => {
      const angle = (idx / Math.max(1, ring1.length)) * Math.PI * 2 - Math.PI / 2;
      positions.set(node.id, {
        node,
        x: Math.round(centerX + Math.cos(angle) * r1RadiusX),
        y: Math.round(centerY + Math.sin(angle) * r1RadiusY),
      });
    });

    // Place ring2 children slightly outward along their parent's radial vector
    const childrenByParent = new Map<string, DisputeNode[]>();
    ring2.forEach((n) => {
      const pId = n.parentId || central.id;
      const list = childrenByParent.get(pId) || [];
      list.push(n);
      childrenByParent.set(pId, list);
    });

    childrenByParent.forEach((children, parentId) => {
      const parentPos = positions.get(parentId) || { x: centerX, y: centerY };
      const baseAngle = Math.atan2(parentPos.y - centerY, parentPos.x - centerX);
      const spread = 0.42;
      children.forEach((child, idx) => {
        const offset =
          children.length === 1
            ? 0
            : (idx - (children.length - 1) / 2) * spread;
        const a = baseAngle + offset;
        const dist = 235;
        positions.set(child.id, {
          node: child,
          x: Math.round(parentPos.x + Math.cos(a) * dist),
          y: Math.round(parentPos.y + Math.sin(a) * dist),
        });
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
                      ? 'bg-[#231612] text-white'
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
          {/* Graph vs List View toggle for accessibility */}
          <div className="flex items-center gap-1 p-1 bg-white border border-[#DED6CF] rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('graph')}
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
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#231612] text-white'
                  : 'text-[#231612]/70 hover:text-[#231612]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Simplified List</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onUserInteraction('Opening ARIA from Dispute Map');
              onOpenAria();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ask ARIA</span>
          </button>
        </div>
      </div>

      {/* Main Split: Graph/List Viewport + Contextual Node Side Panel */}
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
                  aria-label="Reset view"
                  className="p-1.5 rounded hover:bg-[#F5F1EC] text-[#231612] cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Graph Canvas */}
              <div
                className={`relative w-full h-[640px] bg-[#F5F1EC]/45 select-none overflow-hidden ${
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
                    width: '1240px',
                    height: '780px',
                  }}
                  className="relative mx-auto transition-transform duration-75"
                >
                  {/* Edges SVG Layer */}
                  <svg
                    width="1240"
                    height="780"
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
                      const midX = (src.x + dst.x) / 2;
                      const midY = (src.y + dst.y) / 2;

                      return (
                        <g key={edge.id} opacity={isHighlighted ? 0.92 : 0.22}>
                          <line
                            x1={src.x}
                            y1={src.y}
                            x2={dst.x}
                            y2={dst.y}
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
                            x={midX - 54}
                            y={midY - 10}
                            width="108"
                            height="20"
                            rx="4"
                            fill="#FFFFFF"
                            stroke="#DED6CF"
                            strokeWidth="1"
                          />
                          <text
                            x={midX}
                            y={midY + 3.5}
                            textAnchor="middle"
                            fontSize="10"
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
                        className="absolute w-[224px] transition-opacity duration-150"
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
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-semibold tracking-wide ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                            {node.dateLabel && (
                              <span
                                className={`text-[10px] font-mono tabular-nums ${
                                  node.category === 'central_issue'
                                    ? 'text-[#DED6CF]'
                                    : 'text-[#231612]/60'
                                }`}
                              >
                                {node.dateLabel}
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
                <span className="text-[#7E2833] font-medium">Claimant / Contradiction (Burgundy)</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#2D5A3F] font-medium">Supporting Evidence (Sage)</span>
                <span aria-hidden="true">·</span>
                <span>Contractual Obligation (Double Hairline)</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#7E2833]">Missing Evidence (Dashed Border)</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#8A5A19] font-medium">Human Determination</span>
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
                      isSelected ? 'border-[#7E2833] ring-2 ring-[#7E2833]/20' : 'border-[#DED6CF] hover:border-[#7E2833]/50'
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
            className="lg:col-span-4 rounded-2xl bg-white border border-[#DED6CF] overflow-hidden"
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#231612]/70 border-b border-[#DED6CF] pb-3">
                <span>
                  <strong className="text-[#231612]">Attribution:</strong>{' '}
                  {ATTRIBUTION_LABELS[selectedNode.attributionType] || selectedNode.attributionType}
                </span>
                {selectedNode.partyAttribution && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{selectedNode.partyAttribution}</span>
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#231612]">Explanation</div>
                <p className="text-xs sm:text-sm text-[#231612]/80 leading-relaxed">
                  {selectedNode.explanation}
                </p>
              </div>

              {/* Citations & Source Verification */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[#231612]">
                  Source Citations &amp; Verification
                </div>
                {selectedNode.citations.length === 0 ? (
                  <p className="text-xs text-[#231612]/65">
                    Central synthesis node connecting the competing positions and exhibits below.
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
                          <span className="inline-flex items-center gap-1 font-medium text-[#2D5A3F]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-[#7E2833]">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Unverified</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs italic text-[#231612]/85 leading-relaxed">
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
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7E2833] hover:underline cursor-pointer"
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

              {/* Human Review Decision Status */}
              <div className="pt-3 border-t border-[#DED6CF] flex items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="text-[#231612]/65">Review status: </span>
                  <span className="font-semibold text-[#231612] capitalize">
                    {selectedNode.reviewDecision.replace('_', ' ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenFindingsForNode(selectedNode.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#231612] hover:bg-[#38251F] text-white text-xs font-medium cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Review Finding</span>
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
