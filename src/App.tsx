import React, { useState, useEffect, useCallback } from 'react';
import { DEMO_CASE } from './data/demoCase';
import type {
  AppView,
  ArbitrationCase,
  AttributionType,
  CaseDocument,
  CaseOrigin,
  CitationReference,
  HearingTranscriptRecord,
  ReviewDecision,
  VerificationStatus,
} from './types/arbitration';
import { TopNav } from './components/TopNav';
import { WelcomeScreen } from './components/WelcomeScreen';
import { DemoTourController } from './components/DemoTourController';
import { CaseWorkspace, type StagedPdfUpload } from './components/CaseWorkspace';
import { DisputeReasoningMap } from './components/DisputeReasoningMap';
import { FindingsReviewBoard } from './components/FindingsReviewBoard';
import { SourceViewerModal } from './components/SourceViewerModal';
import { AriaBriefingDrawer } from './components/AriaBriefingDrawer';
import { HearingTranscriptionModal } from './components/HearingTranscriptionModal';

interface SourceViewerState {
  doc: CaseDocument;
  page?: number | null;
  excerpt?: string;
  verificationStatus?: VerificationStatus;
  verificationReason?: string;
  attributionType?: AttributionType;
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('home');
  const [activeOrigin, setActiveOrigin] = useState<CaseOrigin>('demo');

  // Strict state isolation between Demo Case and User Uploaded Live Case
  const [demoCase, setDemoCase] = useState<ArbitrationCase>(() => structuredClone(DEMO_CASE));
  const [liveCase, setLiveCase] = useState<ArbitrationCase | null>(null);
  const [stagedUploads, setStagedUploads] = useState<StagedPdfUpload[]>([]);

  // Guided Demo Tour State (6 stages)
  const [isDemoTourActive, setIsDemoTourActive] = useState(false);
  const [demoStage, setDemoStage] = useState(1);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [autoPausedReason, setAutoPausedReason] = useState<string | null>(null);
  const [demoRevealCount, setDemoRevealCount] = useState<number | null>(null);

  // Map & Review Selection State
  const [selectedIssueId, setSelectedIssueId] = useState<string>(DEMO_CASE.issues[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedReviewNodeId, setFocusedReviewNodeId] = useState<string | null>(null);
  const [workspaceSubTab, setWorkspaceSubTab] = useState<'documents' | 'intelligence'>('documents');

  // Modals / Drawers
  const [sourceViewer, setSourceViewer] = useState<SourceViewerState | null>(null);
  const [ariaOpen, setAriaOpen] = useState(false);
  const [ariaPrefill, setAriaPrefill] = useState<string | undefined>(undefined);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);

  const currentCase: ArbitrationCase | null =
    activeOrigin === 'demo' ? demoCase : liveCase;

  const pauseTourOnUserInteraction = useCallback(
    (reason: string) => {
      if (isDemoTourActive && isDemoPlaying) {
        setIsDemoPlaying(false);
        setAutoPausedReason(reason);
      }
    },
    [isDemoTourActive, isDemoPlaying]
  );

  // Synchronize view & stage behavior when Guided Demo stage changes
  const applyDemoStage = useCallback((stage: number) => {
    setDemoStage(stage);
    setActiveOrigin('demo');
    setSelectedIssueId(DEMO_CASE.issues[0].id);

    if (stage === 1) {
      setActiveView('workspace');
      setWorkspaceSubTab('documents');
      setDemoRevealCount(null);
      setSelectedNodeId(null);
    } else if (stage === 2) {
      setActiveView('workspace');
      setWorkspaceSubTab('documents');
      setDemoRevealCount(null);
    } else if (stage === 3) {
      setActiveView('workspace');
      setWorkspaceSubTab('intelligence');
      setDemoRevealCount(null);
    } else if (stage === 4) {
      setActiveView('map');
      setDemoRevealCount(1);
      setSelectedNodeId('node-central-delay');
    } else if (stage === 5) {
      setActiveView('map');
      setDemoRevealCount(null);
      setSelectedNodeId('node-ev-crane-log');
    } else if (stage === 6) {
      setActiveView('review');
      setDemoRevealCount(null);
      setFocusedReviewNodeId('node-missing-schedule');
    }
  }, []);

  // Auto-advance Guided Demo Stages when Playing
  useEffect(() => {
    if (!isDemoTourActive || !isDemoPlaying) return;
    if (demoStage >= 6) {
      setIsDemoPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => {
      applyDemoStage(demoStage + 1);
    }, 10500);

    return () => window.clearTimeout(timer);
  }, [isDemoTourActive, isDemoPlaying, demoStage, applyDemoStage]);

  // Sequential node reveal on Stage 4 without blocking user actions
  useEffect(() => {
    if (!isDemoTourActive || demoStage !== 4) {
      setDemoRevealCount(null);
      return;
    }
    const totalIssueNodes = demoCase.nodes.filter(
      (n) => n.issueId === DEMO_CASE.issues[0].id
    ).length;

    if ((demoRevealCount ?? 1) >= totalIssueNodes) return;

    const interval = window.setInterval(() => {
      setDemoRevealCount((prev) => {
        const next = (prev ?? 1) + 1;
        return next > totalIssueNodes ? totalIssueNodes : next;
      });
    }, 750);

    return () => window.clearInterval(interval);
  }, [isDemoTourActive, demoStage, demoRevealCount, demoCase.nodes]);

  const handleStartDemo = () => {
    setActiveOrigin('demo');
    setIsDemoTourActive(true);
    setIsDemoPlaying(true);
    setAutoPausedReason(null);
    applyDemoStage(1);
  };

  const handleStartLiveAnalysis = () => {
    setIsDemoTourActive(false);
    setIsDemoPlaying(false);
    setAutoPausedReason(null);
    setActiveOrigin('live');
    setSelectedNodeId(null);
    setFocusedReviewNodeId(null);
    setActiveView('workspace');
    setWorkspaceSubTab('documents');
  };

  const handleSwitchOrigin = (target: CaseOrigin) => {
    setIsDemoTourActive(false);
    setIsDemoPlaying(false);
    setAutoPausedReason(null);
    setActiveOrigin(target);
    setSelectedNodeId(null);
    setFocusedReviewNodeId(null);
    if (target === 'demo') {
      setSelectedIssueId(demoCase.issues[0].id);
    } else if (liveCase?.issues[0]) {
      setSelectedIssueId(liveCase.issues[0].id);
    }
    setActiveView('workspace');
  };

  const handleOpenDocument = (
    doc: CaseDocument,
    page?: number | null,
    excerpt?: string,
    verificationStatus?: VerificationStatus,
    verificationReason?: string,
    attributionType?: AttributionType
  ) => {
    pauseTourOnUserInteraction('Opened source document');
    setSourceViewer({
      doc,
      page,
      excerpt,
      verificationStatus,
      verificationReason,
      attributionType,
    });
  };

  const handleOpenCitation = (citation: CitationReference) => {
    if (!currentCase) return;
    const matchedDoc =
      currentCase.documents.find((d) => d.id === citation.docId) ||
      currentCase.documents.find(
        (d) => d.filename.toLowerCase() === citation.filename.toLowerCase()
      );
    if (!matchedDoc) return;

    handleOpenDocument(
      matchedDoc,
      citation.pageReference,
      citation.citedExcerpt,
      citation.verificationStatus,
      citation.verificationReason,
      citation.attributionType
    );
  };

  const handleOpenDocumentById = (docId: string) => {
    if (!currentCase) return;
    const doc = currentCase.documents.find((d) => d.id === docId);
    if (doc) handleOpenDocument(doc, 1);
  };

  const handleUpdateNodeReview = (
    nodeId: string,
    decision: ReviewDecision,
    note?: string
  ) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const updater = (prev: ArbitrationCase): ArbitrationCase => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              reviewDecision: decision,
              reviewNote: note !== undefined ? note : n.reviewNote,
              reviewedAt: timestamp,
              isDemoReview: false,
            }
          : n
      ),
    });

    if (activeOrigin === 'demo') {
      setDemoCase((prev) => updater(prev));
    } else {
      setLiveCase((prev) => (prev ? updater(prev) : prev));
    }
  };

  const handleSaveTranscript = (record: HearingTranscriptRecord) => {
    const updater = (prev: ArbitrationCase): ArbitrationCase => ({
      ...prev,
      transcripts: [record, ...prev.transcripts],
    });
    if (activeOrigin === 'demo') {
      setDemoCase((prev) => updater(prev));
    } else {
      setLiveCase((prev) =>
        prev
          ? updater(prev)
          : {
              id: `live-case-${Date.now()}`,
              title: 'Uploaded Arbitration Case',
              caseNumber: `LIVE-${new Date().toISOString().slice(0, 10)}`,
              origin: 'live',
              claimant: 'Claimant (Pending PDF Analysis)',
              respondent: 'Respondent (Pending PDF Analysis)',
              seatAndRules: 'Live Case Session',
              overview: 'Transcript artifact recorded; upload PDFs in Case Workspace to extract full case map.',
              documents: [],
              issues: [],
              nodes: [],
              edges: [],
              timeline: [],
              obligations: [],
              gaps: [],
              transcripts: [record],
            }
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F1EC] text-[#231612]">
      <TopNav
        activeView={activeView}
        onNavigate={(view) => {
          setActiveView(view);
          if (view === 'home') {
            setIsDemoPlaying(false);
          }
        }}
        activeOrigin={activeOrigin}
        onSwitchOrigin={handleSwitchOrigin}
        onOpenAria={() => {
          pauseTourOnUserInteraction('Opened ARIA panel');
          setAriaPrefill(undefined);
          setAriaOpen(true);
        }}
        onOpenTranscription={() => {
          pauseTourOnUserInteraction('Opened Hearing Transcription');
          setTranscriptionOpen(true);
        }}
        isDemoTourActive={isDemoTourActive}
      />

      {isDemoTourActive && (
        <DemoTourController
          currentStage={demoStage}
          isPlaying={isDemoPlaying}
          autoPausedReason={autoPausedReason}
          onPlay={() => {
            setAutoPausedReason(null);
            setIsDemoPlaying(true);
          }}
          onPause={() => {
            setIsDemoPlaying(false);
            setAutoPausedReason('Manual pause');
          }}
          onNext={() => {
            setAutoPausedReason(null);
            applyDemoStage(Math.min(6, demoStage + 1));
          }}
          onPrevious={() => {
            setAutoPausedReason(null);
            applyDemoStage(Math.max(1, demoStage - 1));
          }}
          onReplay={() => {
            setAutoPausedReason(null);
            setIsDemoPlaying(true);
            applyDemoStage(1);
          }}
          onExit={() => {
            setIsDemoTourActive(false);
            setIsDemoPlaying(false);
            setAutoPausedReason(null);
            setDemoRevealCount(null);
          }}
          onSelectStage={(stage) => {
            setAutoPausedReason(null);
            applyDemoStage(stage);
          }}
          onOpenAriaWithSample={() => {
            pauseTourOnUserInteraction('Opened ARIA sample briefing');
            setAriaPrefill(
              'What evidence suggests that the contractor was already delayed?'
            );
            setAriaOpen(true);
          }}
          onExploreMap={() => {
            setIsDemoTourActive(false);
            setIsDemoPlaying(false);
            setDemoRevealCount(null);
            setActiveView('map');
          }}
          onAnalyseOwnCase={handleStartLiveAnalysis}
        />
      )}

      <div className="flex-1">
        {activeView === 'home' && (
          <WelcomeScreen
            onStartDemo={handleStartDemo}
            onStartLiveAnalysis={handleStartLiveAnalysis}
          />
        )}

        {activeView === 'workspace' && (
          <CaseWorkspace
            activeCase={currentCase}
            activeOrigin={activeOrigin}
            stagedUploads={stagedUploads}
            onUpdateStagedUploads={setStagedUploads}
            onLiveAnalysisComplete={(newCase) => {
              setLiveCase(newCase);
              if (newCase.issues[0]) {
                setSelectedIssueId(newCase.issues[0].id);
              }
              setSelectedNodeId(null);
              setFocusedReviewNodeId(null);
            }}
            onOpenDocument={(doc, page, excerpt) =>
              handleOpenDocument(doc, page, excerpt)
            }
            onGoToMap={() => setActiveView('map')}
            initialSubTab={workspaceSubTab}
          />
        )}

        {activeView === 'map' && (
          <DisputeReasoningMap
            activeCase={
              currentCase || {
                ...demoCase,
                id: 'empty-live',
                title: 'No Case Analysed Yet',
                origin: 'live',
                documents: [],
                issues: [],
                nodes: [],
                edges: [],
                timeline: [],
                obligations: [],
                gaps: [],
                transcripts: [],
              }
            }
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onOpenCitation={handleOpenCitation}
            onOpenFindingsForNode={(nodeId) => {
              setFocusedReviewNodeId(nodeId);
              setActiveView('review');
            }}
            onOpenAria={() => {
              pauseTourOnUserInteraction('Opened ARIA from Dispute Map');
              setAriaPrefill(undefined);
              setAriaOpen(true);
            }}
            onUserInteraction={pauseTourOnUserInteraction}
            demoRevealCount={isDemoTourActive && demoStage === 4 ? demoRevealCount : null}
          />
        )}

        {activeView === 'review' && (
          <FindingsReviewBoard
            activeCase={currentCase}
            focusedNodeId={focusedReviewNodeId}
            onUpdateNodeReview={handleUpdateNodeReview}
            onOpenCitation={handleOpenCitation}
            onUserInteraction={pauseTourOnUserInteraction}
          />
        )}
      </div>

      {/* Quiet Institutional Footer */}
      <footer className="border-t border-[#DED6CF] bg-[#F5F1EC] py-4 px-4 sm:px-8">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#231612]/60">
          <div>
            Arbitalis.AI · Arbitration Intelligence Workspace · Powered by Google AI Tools
          </div>
          <div>
            Buildathon prototype · AI organises the evidence; human judgment determines the dispute.
          </div>
        </div>
      </footer>

      {/* Contextual Modals & Drawers */}
      <SourceViewerModal
        document={sourceViewer?.doc || null}
        initialPage={sourceViewer?.page}
        highlightedExcerpt={sourceViewer?.excerpt}
        verificationStatus={sourceViewer?.verificationStatus}
        verificationReason={sourceViewer?.verificationReason}
        attributionType={sourceViewer?.attributionType}
        onClose={() => setSourceViewer(null)}
      />

      <AriaBriefingDrawer
        isOpen={ariaOpen}
        onClose={() => setAriaOpen(false)}
        activeCase={currentCase}
        prefilledQuestion={ariaPrefill}
        onOpenDocumentById={handleOpenDocumentById}
        onUserInteraction={pauseTourOnUserInteraction}
        onSwitchToDemo={() => handleSwitchOrigin('demo')}
      />

      <HearingTranscriptionModal
        isOpen={transcriptionOpen}
        onClose={() => setTranscriptionOpen(false)}
        activeCase={currentCase}
        activeOrigin={activeOrigin}
        onSaveTranscript={handleSaveTranscript}
        onUserInteraction={pauseTourOnUserInteraction}
      />
    </div>
  );
}
