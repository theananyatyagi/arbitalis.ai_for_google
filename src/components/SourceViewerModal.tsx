import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
  Loader2,
} from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type {
  AttributionType,
  CaseDocument,
  VerificationStatus,
} from '../types/arbitration';
import { loadPdfFromObjectUrl } from '../utils/sourceVerification';

interface SourceViewerModalProps {
  document: CaseDocument | null;
  initialPage?: number | null;
  highlightedExcerpt?: string;
  verificationStatus?: VerificationStatus;
  verificationReason?: string;
  attributionType?: AttributionType;
  onClose: () => void;
}

const ATTRIBUTION_LABEL: Record<AttributionType, string> = {
  party_statement: 'Statement made by a party',
  documentary_statement: 'Documentary statement',
  ai_interpretation: 'AI interpretation',
  human_finding: 'Human-reviewed finding',
};

export const SourceViewerModal: React.FC<SourceViewerModalProps> = ({
  document: doc,
  initialPage,
  highlightedExcerpt,
  verificationStatus,
  verificationReason,
  attributionType,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'pdf' | 'text'>('pdf');
  const [zoom, setZoom] = useState<number>(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
  const [loadedDocKey, setLoadedDocKey] = useState<string | null>(null);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!doc) return;
    const safePage =
      initialPage && initialPage >= 1 && initialPage <= Math.max(1, doc.pageCount)
        ? initialPage
        : 1;
    setCurrentPage(safePage);
    setViewMode(doc.objectUrl ? 'pdf' : 'text');
    setZoom(1);
    setPdfRenderError(null);
  }, [doc, initialPage]);

  useEffect(() => {
    if (!doc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc, onClose]);

  // Load PDFDocumentProxy once per uploaded PDF blob URL
  useEffect(() => {
    const objectUrl = doc?.objectUrl;
    const docKey = doc ? `${doc.id}:${objectUrl || ''}` : null;

    if (!doc || !objectUrl || doc.isMissingPlaceholder) {
      if (pdfDocRef.current) {
        void pdfDocRef.current.cleanup();
        pdfDocRef.current = null;
      }
      setLoadedDocKey(null);
      setIsLoadingPdf(false);
      return;
    }

    let cancelled = false;
    setIsLoadingPdf(true);
    setPdfRenderError(null);
    setLoadedDocKey(null);

    loadPdfFromObjectUrl(objectUrl)
      .then((loadedPdf) => {
        if (cancelled) {
          void loadedPdf.cleanup();
          return;
        }
        if (pdfDocRef.current && pdfDocRef.current !== loadedPdf) {
          void pdfDocRef.current.cleanup();
        }
        pdfDocRef.current = loadedPdf;
        setLoadedDocKey(docKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setPdfRenderError(
          err instanceof Error
            ? `Unable to render PDF pages visually (${err.message}). Switched to extracted text view.`
            : 'Unable to render PDF pages visually.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPdf(false);
      });

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (pdfDocRef.current) {
        void pdfDocRef.current.cleanup();
        pdfDocRef.current = null;
      }
    };
  }, [doc]);

  // Render active page to canvas whenever page, zoom, viewMode, or loaded PDF changes
  useEffect(() => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    const expectedKey = doc ? `${doc.id}:${doc.objectUrl || ''}` : null;

    if (
      !doc ||
      !pdf ||
      !canvas ||
      viewMode !== 'pdf' ||
      loadedDocKey !== expectedKey ||
      pdfRenderError
    ) {
      return;
    }

    let cancelled = false;
    setIsRenderingPage(true);

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const clampedPage = Math.min(Math.max(1, currentPage), pdf.numPages);
        const page = await pdf.getPage(clampedPage);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = Math.max(320, (containerRef.current?.clientWidth || 760) - 24);
        const fitScale = Math.min(1.65, Math.max(0.6, containerWidth / baseViewport.width));
        const viewport = page.getViewport({ scale: fitScale * zoom });

        const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Canvas 2D context is unavailable.');
        }

        canvas.width = Math.floor(viewport.width * deviceScale);
        canvas.height = Math.floor(viewport.height * deviceScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: deviceScale !== 1 ? [deviceScale, 0, 0, deviceScale, 0, 0] : undefined,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === 'RenderingCancelledException') return;
        setPdfRenderError(
          err instanceof Error
            ? `Could not render page ${currentPage}: ${err.message}`
            : `Could not render page ${currentPage}.`
        );
      } finally {
        if (!cancelled) {
          setIsRenderingPage(false);
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [doc, currentPage, zoom, viewMode, loadedDocKey, pdfRenderError]);

  if (!doc) return null;

  const pageObj =
    doc.pages.find((p) => p.pageNumber === currentPage) || doc.pages[0];

  const renderHighlightedText = (text: string, excerpt?: string) => {
    if (!excerpt || excerpt.trim().length < 8) {
      return <p className="whitespace-pre-wrap leading-relaxed text-sm text-[#231612]">{text}</p>;
    }
    const cleanExcerpt = excerpt.trim();
    const idx = text.toLowerCase().indexOf(cleanExcerpt.toLowerCase());
    if (idx === -1) {
      return <p className="whitespace-pre-wrap leading-relaxed text-sm text-[#231612]">{text}</p>;
    }
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + cleanExcerpt.length);
    const after = text.slice(idx + cleanExcerpt.length);
    return (
      <p className="whitespace-pre-wrap leading-relaxed text-sm text-[#231612]">
        {before}
        <mark className="bg-[#7E2833]/15 text-[#231612] px-1 py-0.5 rounded font-medium border-b-2 border-[#7E2833]">
          {match}
        </mark>
        {after}
      </p>
    );
  };

  const showModeStrip =
    !doc.isMissingPlaceholder &&
    (Boolean(verificationStatus) || Boolean(highlightedExcerpt) || Boolean(doc.objectUrl));

  return (
    <div
      className="fixed inset-0 z-50 bg-[#231612]/60 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-viewer-title"
    >
      <div className="bg-white border border-[#DED6CF] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-[#F5F1EC] border-b border-[#DED6CF] flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#231612]/65">
              <span className="font-mono tabular-nums font-medium text-[#7E2833]">
                {doc.id}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {doc.origin === 'demo' ? 'Prepared Demo Document' : 'Uploaded Case PDF'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{doc.category}</span>
              {attributionType && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{ATTRIBUTION_LABEL[attributionType]}</span>
                </>
              )}
            </div>
            <h2
              id="source-viewer-title"
              className="font-serif text-xl font-semibold text-[#231612] truncate"
            >
              {doc.title || doc.filename}
            </h2>
            <div className="text-xs font-mono text-[#231612]/60 truncate">
              {doc.filename}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close source viewer"
            className="p-2 rounded-lg text-[#231612]/70 hover:text-[#231612] hover:bg-[#DED6CF]/40 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verification, Mode Toggle & Citation Strip */}
        {showModeStrip && (
          <div className="px-6 py-3 bg-white border-b border-[#DED6CF] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {verificationStatus === 'verified' ? (
                <div className="inline-flex items-center gap-2 text-xs font-medium text-[#2D5A3F]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Verified against source document
                    {initialPage ? ` (Page ${initialPage})` : ''}
                  </span>
                </div>
              ) : verificationStatus ? (
                <div className="inline-flex items-center gap-2 text-xs font-medium text-[#7E2833]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    {verificationReason ||
                      'Source not verified — human review required.'}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-[#231612]/65">
                  Source document inspection · Human-verified traceability
                </div>
              )}

              {doc.objectUrl && (
                <div className="flex items-center gap-1 p-0.5 bg-[#F5F1EC] rounded-lg border border-[#DED6CF]">
                  <button
                    type="button"
                    onClick={() => {
                      setPdfRenderError(null);
                      setViewMode('pdf');
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      viewMode === 'pdf'
                        ? 'bg-white text-[#231612] shadow-sm'
                        : 'text-[#231612]/65 hover:text-[#231612]'
                    }`}
                  >
                    PDF Page View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('text')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      viewMode === 'text'
                        ? 'bg-white text-[#231612] shadow-sm'
                        : 'text-[#231612]/65 hover:text-[#231612]'
                    }`}
                  >
                    Highlighted Text
                  </button>
                </div>
              )}
            </div>

            {highlightedExcerpt && (
              <div className="p-3 rounded-lg bg-[#F5F1EC] text-xs text-[#231612]/85">
                <span className="font-semibold text-[#231612]">Cited Passage: </span>
                &ldquo;{highlightedExcerpt}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div ref={containerRef} className="flex-1 overflow-y-auto p-6 bg-[#F5F1EC]/50">
          {doc.isMissingPlaceholder ? (
            <div className="rounded-xl bg-white border border-dashed border-[#7E2833]/50 p-8 text-center space-y-3 max-w-lg mx-auto my-6">
              <AlertTriangle className="w-8 h-8 text-[#7E2833] mx-auto" />
              <h3 className="font-serif text-xl font-semibold text-[#231612]">
                Document Missing from Record
              </h3>
              <p className="text-sm text-[#231612]/75 leading-relaxed">
                This exhibit ({doc.filename}) is referenced in the case record
                but has not been produced by either party. Arbitalis.AI displays
                an explicit evidentiary gap rather than inventing a supporting
                document.
              </p>
            </div>
          ) : viewMode === 'pdf' && doc.objectUrl ? (
            <div className="space-y-3 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#231612]/70">
                <span>
                  Viewing uploaded PDF at Page {currentPage} of {doc.pageCount}
                </span>
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center gap-1 bg-white border border-[#DED6CF] rounded-lg px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                      disabled={zoom <= 0.75}
                      aria-label="Zoom out PDF"
                      className="p-1 text-[#231612]/70 hover:text-[#231612] disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono tabular-nums text-[11px] min-w-[3rem] text-center text-[#231612]">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(2, Number((z + 0.25).toFixed(2))))}
                      disabled={zoom >= 2}
                      aria-label="Zoom in PDF"
                      className="p-1 text-[#231612]/70 hover:text-[#231612] disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <a
                    href={doc.objectUrl}
                    download={doc.filename}
                    className="inline-flex items-center gap-1 text-[#7E2833] font-medium hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </a>
                </div>
              </div>

              {pdfRenderError ? (
                <div className="rounded-xl bg-white border border-[#7E2833]/35 p-6 text-center space-y-3 max-w-lg mx-auto my-6">
                  <AlertTriangle className="w-6 h-6 text-[#7E2833] mx-auto" />
                  <p className="text-xs text-[#231612]/80">{pdfRenderError}</p>
                  <button
                    type="button"
                    onClick={() => setViewMode('text')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#231612] text-white text-xs font-medium hover:bg-[#38251F] cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Switch to Highlighted Text</span>
                  </button>
                </div>
              ) : (
                <div className="relative rounded-xl border border-[#DED6CF] bg-[#DED6CF]/25 p-3 overflow-auto max-h-[54vh] flex justify-center items-start min-h-[260px]">
                  {(isLoadingPdf || isRenderingPage) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 backdrop-blur-[1px] text-xs text-[#231612]">
                      <Loader2 className="w-4 h-4 animate-spin text-[#7E2833] mr-2" />
                      <span>Rendering PDF page {currentPage}...</span>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    aria-label={`${doc.filename} Page ${currentPage}`}
                    className="block bg-white shadow-sm rounded"
                  />
                </div>
              )}
            </div>
          ) : pageObj ? (
            <div className="rounded-xl bg-white border border-[#DED6CF] p-6 sm:p-8 shadow-sm max-w-3xl mx-auto">
              <div className="flex items-center justify-between border-b border-[#DED6CF] pb-3 mb-5">
                <div className="flex items-center gap-2 text-xs text-[#231612]/65">
                  <FileText className="w-4 h-4 text-[#7E2833]" />
                  <span>
                    Page {pageObj.pageNumber} of {doc.pageCount}
                  </span>
                </div>
                {doc.origin === 'demo' && (
                  <span className="text-[11px] font-medium text-[#7E2833]">
                    Prepared Demo Content
                  </span>
                )}
              </div>
              {renderHighlightedText(pageObj.text, highlightedExcerpt)}
            </div>
          ) : (
            <div className="text-sm text-[#231612]/70 text-center py-8">
              No extractable text available for this page.
            </div>
          )}
        </div>

        {/* Footer Page Controls */}
        {!doc.isMissingPlaceholder && doc.pageCount > 0 && (
          <div className="px-6 py-3 bg-white border-t border-[#DED6CF] flex items-center justify-between">
            <div className="text-xs font-mono tabular-nums text-[#231612]/70">
              Page {currentPage} / {doc.pageCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#DED6CF] text-xs font-medium text-[#231612] disabled:opacity-40 hover:bg-[#F5F1EC] cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous Page</span>
              </button>
              <button
                type="button"
                disabled={currentPage >= doc.pageCount}
                onClick={() => setCurrentPage((p) => Math.min(doc.pageCount, p + 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#DED6CF] text-xs font-medium text-[#231612] disabled:opacity-40 hover:bg-[#F5F1EC] cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Next Page</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
