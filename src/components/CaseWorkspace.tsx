import React, { useState, useRef } from 'react';
import {
  FileUp,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  XCircle,
  RotateCw,
  ArrowRight,
  Clock,
  BookOpen,
} from 'lucide-react';
import type {
  ArbitrationCase,
  CaseDocument,
  DocumentCategory,
  StructuredApiError,
} from '../types/arbitration';
import { extractPdfPages, buildVerifiedLiveCase } from '../utils/sourceVerification';
import { fetchApiJson } from '../utils/apiClient';

export interface StagedPdfUpload {
  docId: string;
  file: File;
  category: DocumentCategory;
  pageCount: number;
  pages: { pageNumber: number; text: string }[];
  objectUrl: string;
}

interface CaseWorkspaceProps {
  activeCase: ArbitrationCase | null;
  activeOrigin: 'demo' | 'live';
  stagedUploads: StagedPdfUpload[];
  onUpdateStagedUploads: React.Dispatch<React.SetStateAction<StagedPdfUpload[]>>;
  onLiveAnalysisComplete: (newCase: ArbitrationCase) => void;
  onOpenDocument: (
    doc: CaseDocument,
    page?: number | null,
    excerpt?: string
  ) => void;
  onGoToMap: () => void;
  initialSubTab?: 'documents' | 'intelligence';
}

const CATEGORIES: DocumentCategory[] = [
  'Contract',
  'Pleadings',
  'Correspondence',
  'Technical Record',
  'Evidence / Exhibit',
];

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({
  activeCase,
  activeOrigin,
  stagedUploads,
  onUpdateStagedUploads,
  onLiveAnalysisComplete,
  onOpenDocument,
  onGoToMap,
  initialSubTab = 'documents',
}) => {
  const [subTab, setSubTab] = useState<'documents' | 'intelligence'>(initialSubTab);
  const [isParsingFiles, setIsParsingFiles] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStepText, setAnalysisStepText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<StructuredApiError | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setApiError(null);

    const remainingSlots = 5 - stagedUploads.length;
    if (remainingSlots <= 0) {
      setUploadError('Maximum 5 PDF documents per case batch.');
      return;
    }

    const incoming = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setUploadError(
        `Only ${remainingSlots} additional slot(s) available; extra files were skipped (max 5 PDFs per batch).`
      );
    }

    setIsParsingFiles(true);
    try {
      const prepared: StagedPdfUpload[] = [];
      for (let i = 0; i < incoming.length; i += 1) {
        const file = incoming[i];
        const isPdf =
          file.type === 'application/pdf' ||
          file.name.toLowerCase().endsWith('.pdf');
        if (!isPdf) {
          setUploadError(`Skipped "${file.name}": only PDF files are accepted.`);
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          setUploadError(`Skipped "${file.name}": exceeds 15 MB per-file limit.`);
          continue;
        }

        const { pageCount, pages } = await extractPdfPages(file);
        const objectUrl = URL.createObjectURL(file);
        const nextIndex = stagedUploads.length + prepared.length + 1;

        prepared.push({
          docId: `DOC-0${nextIndex}`,
          file,
          category: 'Evidence / Exhibit',
          pageCount,
          pages,
          objectUrl,
        });
      }

      if (prepared.length > 0) {
        onUpdateStagedUploads((prev) => [...prev, ...prepared]);
      }
    } catch {
      setUploadError('Failed to inspect one of the selected PDFs. Please verify it is not corrupted or password-locked.');
    } finally {
      setIsParsingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveUpload = (docId: string) => {
    onUpdateStagedUploads((prev) => {
      const target = prev.find((u) => u.docId === docId);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev
        .filter((u) => u.docId !== docId)
        .map((u, idx) => ({ ...u, docId: `DOC-0${idx + 1}` }));
    });
  };

  const handleRunLiveAnalysis = async () => {
    if (stagedUploads.length === 0 || isAnalyzing) return;

    setApiError(null);
    setUploadError(null);
    setIsAnalyzing(true);
    setAnalysisStepText('Preparing document record and extracted page text...');

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      const metadata = stagedUploads.map((u) => {
        const totalChars = u.pages.reduce((sum, p) => sum + p.text.length, 0);
        const avgChars = u.pageCount > 0 ? totalChars / u.pageCount : 0;
        const sendTextOnly = u.file.size > 500 * 1024 && avgChars >= 80 && u.pages.length > 0;
        if (!sendTextOnly) {
          formData.append('files', u.file, u.file.name);
        }
        return {
          docId: u.docId,
          filename: u.file.name,
          category: u.category,
          hasBinary: !sendTextOnly,
          ...(sendTextOnly ? { extractedPages: u.pages } : {}),
        };
      });
      formData.append('metadata', JSON.stringify(metadata));

      setAnalysisStepText('Reasoning with Gemini 3.1 Flash Lite (Timeout window: 65s)...');

      const parsed = await fetchApiJson<{
        analysis: Parameters<typeof buildVerifiedLiveCase>[0];
        model?: string;
      }>('/api/analyze', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!parsed.ok || !parsed.data) {
        setApiError(
          parsed.error || {
            category: 'UNKNOWN_ERROR',
            message: 'Analysis did not return a valid result.',
            retryable: true,
          }
        );
        return;
      }

      setAnalysisStepText('Verifying cited passages verbatim against extracted PDF pages...');

      const docsForCase: CaseDocument[] = stagedUploads.map((u) => ({
        id: u.docId,
        filename: u.file.name,
        title: u.file.name.replace(/\.pdf$/i, ''),
        category: u.category,
        origin: 'live',
        sizeBytes: u.file.size,
        pageCount: u.pageCount,
        pages: u.pages,
        objectUrl: u.objectUrl,
        uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));

      const verifiedCase = buildVerifiedLiveCase(
        parsed.data.analysis,
        docsForCase,
        parsed.data.model || 'gemini-4-hydrogen'
      );

      onLiveAnalysisComplete(verifiedCase);
      setSubTab('intelligence');
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setApiError({
          category: 'NETWORK_ERROR',
          message: 'Analysis was cancelled. Your uploaded documents are preserved.',
          retryable: true,
        });
        return;
      }
      setApiError({
        category: 'NETWORK_ERROR',
        message: 'Network interruption while communicating with the analysis server. Your uploaded documents remain intact.',
        retryable: true,
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisStepText('');
    }
  };

  const handleCancelAnalysis = () => {
    abortControllerRef.current?.abort();
  };

  const displayCase = activeCase;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#DED6CF] pb-5">
        <div className="space-y-1">
          <div className="text-xs font-medium text-[#7E2833]">
            {activeOrigin === 'demo'
              ? 'Prepared Demo Workspace · Fictional Construction Dispute'
              : 'Live Case Analysis Workspace · Isolated User Session'}
          </div>
          <h1 className="font-serif text-3xl font-semibold text-[#231612]">
            {displayCase ? displayCase.title : 'Analyse Your Arbitration Case'}
          </h1>
          <p className="text-sm text-[#231612]/70 max-w-2xl">
            {displayCase
              ? displayCase.overview
              : 'Upload up to 5 PDF case documents (contracts, pleadings, correspondence, or technical records) to extract verifiable facts, obligations, timeline events, and evidentiary gaps with Google AI.'}
          </p>
        </div>

        {displayCase && displayCase.nodes.length > 0 && (
          <button
            type="button"
            onClick={onGoToMap}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#231612] hover:bg-[#38251F] text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
          >
            <span>Open Dispute Reasoning Map</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Live Upload Panel (Strictly when in Live mode) */}
      {activeOrigin === 'live' && (
        <section className="rounded-2xl bg-white border border-[#DED6CF] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#231612]">
                Upload Case PDFs ({stagedUploads.length} / 5)
              </h2>
              <p className="text-xs text-[#231612]/65">
                Synthetic or non-confidential PDFs recommended for demonstration · Max 5 PDFs, 15 MB each.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={(e) => handleFileSelection(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                disabled={stagedUploads.length >= 5 || isParsingFiles || isAnalyzing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#DED6CF] bg-[#F5F1EC] hover:bg-[#DED6CF]/40 disabled:opacity-50 text-xs font-medium text-[#231612] cursor-pointer disabled:cursor-not-allowed"
              >
                <FileUp className="w-4 h-4 text-[#7E2833]" />
                <span>{isParsingFiles ? 'Reading PDF...' : 'Select PDF Files'}</span>
              </button>

              {isAnalyzing ? (
                <button
                  type="button"
                  onClick={handleCancelAnalysis}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Analysis</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={stagedUploads.length === 0 || isParsingFiles}
                  onClick={handleRunLiveAnalysis}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#231612] hover:bg-[#38251F] disabled:opacity-40 text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
                >
                  <span>Analyse with Google AI</span>
                </button>
              )}
            </div>
          </div>

          {uploadError && (
            <div className="p-3.5 rounded-xl bg-[#7E2833]/10 border border-[#7E2833]/30 text-xs text-[#7E2833] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {isAnalyzing && (
            <div className="p-4 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] flex items-center gap-3 text-xs text-[#231612]">
              <Loader2 className="w-4 h-4 animate-spin text-[#7E2833] shrink-0" />
              <div>
                <div className="font-semibold">Live Gemini Document Analysis in Progress</div>
                <div className="text-[#231612]/70 mt-0.5">{analysisStepText}</div>
              </div>
            </div>
          )}

          {apiError && (
            <div className="p-4 rounded-xl bg-[#7E2833]/10 border border-[#7E2833]/35 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-[#7E2833] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Analysis Notice ({apiError.category.replace('_', ' ')})</span>
                </div>
                {stagedUploads.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRunLiveAnalysis}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-[#231612] text-white font-medium hover:bg-[#38251F] cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
              <p className="text-[#231612]">{apiError.message}</p>
              {apiError.category === 'AUTH_ERROR' && (
                <p className="text-[11px] text-[#7E2833] font-medium pt-1 border-t border-[#7E2833]/20">
                  Tip: Configure GEMINI_API_KEY in your local .env file, or click &ldquo;Explore a Demo&rdquo; on the Home screen to test all features with the prepared arbitral record.
                </p>
              )}
              {apiError.category === 'CAPACITY_ERROR' && (
                <p className="text-[11px] text-[#7E2833] font-medium pt-1 border-t border-[#7E2833]/20">
                  Tip: If your document batch is large, try analyzing 1–2 key pleadings or contracts first to stay within model limits.
                </p>
              )}
            </div>
          )}

          {stagedUploads.length > 0 ? (
            <div className="divide-y divide-[#DED6CF] border border-[#DED6CF] rounded-xl overflow-hidden">
              {stagedUploads.map((item) => (
                <div
                  key={item.docId}
                  className="px-4 py-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-[#7E2833] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#231612] truncate">
                        {item.docId} · {item.file.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[#231612]/60">
                        {item.pageCount} pages · {(item.file.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label={`Category for ${item.file.name}`}
                      value={item.category}
                      disabled={isAnalyzing}
                      onChange={(e) => {
                        const val = e.target.value as DocumentCategory;
                        onUpdateStagedUploads((prev) =>
                          prev.map((u) =>
                            u.docId === item.docId ? { ...u, category: val } : u
                          )
                        );
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-[#DED6CF] bg-[#F5F1EC] text-xs text-[#231612]"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={isAnalyzing}
                      onClick={() => handleRemoveUpload(item.docId)}
                      aria-label={`Remove ${item.file.name}`}
                      className="p-1.5 rounded-lg text-[#231612]/60 hover:text-[#7E2833] hover:bg-[#F5F1EC] cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#DED6CF] bg-[#F5F1EC]/50 p-8 text-center text-xs text-[#231612]/65">
              No PDF files attached yet. Click &ldquo;Select PDF Files&rdquo; above to begin analysing your own dispute record.
            </div>
          )}
        </section>
      )}

      {/* Case Documents & Case Intelligence Tabs */}
      {displayCase && (
        <div className="space-y-5">
          <div className="flex items-center gap-1 p-1 bg-white border border-[#DED6CF] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setSubTab('documents')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                subTab === 'documents'
                  ? 'bg-[#231612] text-white'
                  : 'text-[#231612]/70 hover:text-[#231612]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                {displayCase.origin === 'demo' ? 'Prepared Demo Documents' : 'Case Documents'} (
                {displayCase.documents.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('intelligence')}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                subTab === 'intelligence'
                  ? 'bg-[#231612] text-white'
                  : 'text-[#231612]/70 hover:text-[#231612]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>
                {displayCase.origin === 'demo' ? 'Prepared Demo Analysis' : 'Case Intelligence'}
              </span>
            </button>
          </div>

          {subTab === 'documents' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayCase.documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onOpenDocument(doc, 1)}
                  className={`text-left p-5 rounded-xl bg-white transition-colors cursor-pointer flex flex-col justify-between gap-4 ${
                    doc.isMissingPlaceholder
                      ? 'border-2 border-dashed border-[#7E2833]/60 hover:border-[#7E2833]'
                      : 'border border-[#DED6CF] hover:border-[#7E2833]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono font-medium text-[#7E2833]">{doc.id}</span>
                      <span className="text-[#231612]/60">{doc.category}</span>
                    </div>
                    <h3 className="font-serif text-lg font-semibold text-[#231612] leading-snug">
                      {doc.title}
                    </h3>
                    <div className="text-[11px] font-mono text-[#231612]/55 truncate">
                      {doc.filename}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-[#DED6CF]">
                    <span className="text-[#231612]/65 font-mono tabular-nums">
                      {doc.isMissingPlaceholder
                        ? 'Missing from record'
                        : `${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}`}
                    </span>
                    <span className="text-[#7E2833] font-medium">
                      {doc.isMissingPlaceholder ? 'Inspect Gap →' : 'Open Source →'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Obligations & Evidentiary Gaps */}
              <div className="lg:col-span-5 space-y-6">
                <section className="rounded-2xl bg-white border border-[#DED6CF] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif text-xl font-semibold text-[#231612]">
                      Contractual Obligations
                    </h2>
                    <span className="text-[11px] text-[#231612]/60">
                      {displayCase.origin === 'demo' ? 'Prepared Demo Analysis' : 'Extracted Record'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {displayCase.obligations.map((obl) => {
                      const matchedDoc = displayCase.documents.find((d) => d.id === obl.docId);
                      return (
                        <div
                          key={obl.id}
                          className="p-3.5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-[#7E2833]">{obl.clause}</span>
                            {obl.verificationStatus === 'verified' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#2D5A3F]">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#7E2833]">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Review required</span>
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-medium text-[#231612]">{obl.party}</div>
                          <p className="text-xs text-[#231612]/75 leading-relaxed">
                            {obl.obligation}
                          </p>
                          {matchedDoc && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenDocument(matchedDoc, obl.pageReference, obl.citedExcerpt)
                              }
                              className="text-[11px] font-medium text-[#7E2833] hover:underline cursor-pointer"
                            >
                              Verify in {matchedDoc.filename}
                              {obl.pageReference ? ` (p.${obl.pageReference})` : ''}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl bg-white border border-dashed border-[#7E2833]/50 p-5 space-y-4">
                  <h2 className="font-serif text-xl font-semibold text-[#7E2833]">
                    Explicit Evidentiary Gaps
                  </h2>
                  <div className="space-y-3">
                    {displayCase.gaps.map((gap) => (
                      <div
                        key={gap.id}
                        className="p-3.5 rounded-xl bg-[#7E2833]/[0.04] border border-[#7E2833]/25 space-y-1.5"
                      >
                        <div className="text-xs font-semibold text-[#231612]">{gap.title}</div>
                        <p className="text-xs text-[#231612]/75 leading-relaxed">
                          {gap.description}
                        </p>
                        <div className="text-[11px] text-[#7E2833]">
                          <strong>Impact:</strong> {gap.impact}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Right: Chronological Timeline */}
              <div className="lg:col-span-7">
                <section className="rounded-2xl bg-white border border-[#DED6CF] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif text-xl font-semibold text-[#231612]">
                      Chronological Event Timeline
                    </h2>
                    <span className="text-[11px] text-[#231612]/60 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{displayCase.timeline.length} key milestones</span>
                    </span>
                  </div>

                  <div className="divide-y divide-[#DED6CF]">
                    {displayCase.timeline.map((evt) => {
                      const matchedDoc = displayCase.documents.find((d) => d.id === evt.docId);
                      return (
                        <div key={evt.id} className="py-4 first:pt-1 last:pb-1 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-mono tabular-nums font-semibold text-[#7E2833]">
                              {evt.date}
                            </span>
                            {evt.verificationStatus === 'verified' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#2D5A3F]">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Verified source</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#7E2833]">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Source not verified — human review required</span>
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-[#231612]">{evt.title}</h3>
                          <p className="text-xs text-[#231612]/80 leading-relaxed">
                            {evt.description}
                          </p>
                          <div className="text-[11px] text-[#231612]/65">
                            <strong>Significance:</strong> {evt.significance}
                          </div>
                          {matchedDoc && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenDocument(matchedDoc, evt.pageReference, evt.citedExcerpt)
                              }
                              className="text-[11px] font-medium text-[#7E2833] hover:underline cursor-pointer"
                            >
                              Inspect {matchedDoc.filename}
                              {evt.pageReference ? ` (Page ${evt.pageReference})` : ''}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
