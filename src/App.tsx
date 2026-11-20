import React, { useState, useCallback } from 'react';
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
import { DEMO_STAGE_COUNT, getDemoStage } from './data/demoTour';
import { CaseWorkspace, type StagedPdfUpload } from './components/CaseWorkspace';
import { DisputeReasoningMap } from './components/DisputeReasoningMap';
import { FindingsReviewBoard } from './components/FindingsReviewBoard';
import { SourceViewerModal } from './components/SourceViewerModal';
import { AriaBriefingDrawer } from './components/AriaBriefingDrawer';
import { HearingTranscriptionModal } from './components/HearingTranscriptionModal';
import { SageDraftingWorkspace } from './components/SageDraftingWorkspace';

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

  // Guided Demo Tour State (5 manual stages, see src/data/demoTour.ts)
  const [isDemoTourActive, setIsDemoTourActive] = useState(false);
  const [demoStage, setDemoStage] = useState(1);

  // Map & Review Selection State
  const [selectedIssueId, setSelectedIssueId] = useState<string>(DEMO_CASE.issues[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedReviewNodeId, setFocusedReviewNodeId] = useState<string | null>(null);
  const [workspaceSubTab, setWorkspaceSubTab] = useState<'documents' | 'intelligence'>('documents');

  // Modals / Drawers
  const [sourceViewer, setSourceViewer] = useState<SourceViewerState | null>(null);
  const [ariaPrefill, setAriaPrefill] = useState<string | undefined>(undefined);

  const currentCase: ArbitrationCase | null =
    activeOrigin === 'demo' ? demoCase : liveCase;

  // The guided demo is manual-only (no autoplay), so user interactions never need to pause it.
  // Child components still report interactions through this callback.
  const noteUserInteraction = useCallback((_reason: string) => {}, []);

  // Open the view/mode for a guided-demo stage. Never touches drafting text, reviews or live-case data.
  const applyDemoStage = useCallback((stage: number) => {
    const cfg = getDemoStage(stage);
    setDemoStage(cfg.stage);
    setActiveOrigin('demo');
    setActiveView(cfg.view);
    if (cfg.workspaceSubTab) setWorkspaceSubTab(cfg.workspaceSubTab);
    if (cfg.mapMode) {
      setSelectedIssueId(DEMO_CASE.issues[0].id);
      setSelectedNodeId(null);
    }
    if (cfg.ariaSuggestedQuestion) setAriaPrefill(cfg.ariaSuggestedQuestion);
  }, []);

  const handleTourPrimaryAction = () => {
    if (demoStage === 2 && workspaceSubTab === 'documents') {
      setWorkspaceSubTab('intelligence');
      return;
    }
    if (demoStage >= DEMO_STAGE_COUNT) {
      setIsDemoTourActive(false);
      return;
    }
    applyDemoStage(demoStage + 1);
  };

  const tourPrimaryLabel =
    demoStage === 2 && workspaceSubTab === 'intelligence'
      ? 'Next: Investigate the contradiction'
      : undefined;

  const handleStartDemo = () => {
    setActiveOrigin('demo');
    setIsDemoTourActive(true);
    applyDemoStage(1);
  };

  const handleStartLiveAnalysis = () => {
    setIsDemoTourActive(false);
    setActiveOrigin('live');
    setSelectedNodeId(null);
    setFocusedReviewNodeId(null);
    setActiveView('workspace');
    setWorkspaceSubTab('documents');
  };

  const handleSwitchOrigin = (target: CaseOrigin) => {
    setIsDemoTourActive(false);
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
    noteUserInteraction('Opened source document');
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
        }}
        activeOrigin={activeOrigin}
        onSwitchOrigin={handleSwitchOrigin}
        isDemoTourActive={isDemoTourActive}
      />

      {isDemoTourActive && (
        <DemoTourController
          currentStage={demoStage}
          primaryLabel={tourPrimaryLabel}
          onPrimaryAction={handleTourPrimaryAction}
          onPrevious={() => applyDemoStage(Math.max(1, demoStage - 1))}
          onReplay={() => applyDemoStage(1)}
          onExit={() => setIsDemoTourActive(false)}
          onSelectStage={applyDemoStage}
          onAnalyseOwnCase={handleStartLiveAnalysis}
          onOpenHearing={() => setActiveView('hearing')}
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
            onSubTabChange={setWorkspaceSubTab}
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
              noteUserInteraction('Opened ARIA from Dispute Map');
              setAriaPrefill(undefined);
              setActiveView('aria');
            }}
            onUserInteraction={noteUserInteraction}
            requestedViewMode={isDemoTourActive ? getDemoStage(demoStage).mapMode : undefined}
            onUpdateNodeReview={handleUpdateNodeReview}
            onAskAriaAboutNode={(node) => {
              noteUserInteraction(`Asked ARIA about ${node.label}`);
              setAriaPrefill(
                `What does the documentary record establish regarding "${node.label}"?`
              );
              setActiveView('aria');
            }}
          />
        )}

        {activeView === 'review' && (
          <FindingsReviewBoard
            activeCase={currentCase}
            focusedNodeId={focusedReviewNodeId}
            onUpdateNodeReview={handleUpdateNodeReview}
            onOpenCitation={handleOpenCitation}
            onUserInteraction={noteUserInteraction}
          />
        )}

        {/* ARIA and Hearing stay mounted (hidden when inactive) so a conversation or an unsaved
            transcript draft survives tab changes. */}
        <div className={activeView === 'aria' ? '' : 'hidden'}>
          <AriaBriefingDrawer
            variant="page"
            isOpen
            onClose={() => setActiveView('home')}
            activeCase={currentCase}
            prefilledQuestion={ariaPrefill}
            onOpenDocumentById={handleOpenDocumentById}
            onUserInteraction={noteUserInteraction}
            onSwitchToDemo={() => handleSwitchOrigin('demo')}
          />
        </div>

        <div className={activeView === 'hearing' ? '' : 'hidden'}>
          <HearingTranscriptionModal
            variant="page"
            isOpen
            onClose={() => setActiveView('home')}
            activeCase={currentCase}
            activeOrigin={activeOrigin}
            onSaveTranscript={handleSaveTranscript}
            onUserInteraction={noteUserInteraction}
          />
        </div>

        {activeView === 'sage' && (
          <SageDraftingWorkspace
            activeCase={currentCase}
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            onOpenCitation={handleOpenCitation}
            onUserInteraction={noteUserInteraction}
            onGoToWorkspace={() => setActiveView('workspace')}
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
    </div>
  );
}
