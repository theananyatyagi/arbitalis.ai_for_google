import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Send,
  Volume2,
  Mic,
  Square,
  Sparkles,
  FileText,
  AlertTriangle,
  Loader2,
  RotateCw,
} from 'lucide-react';
import type { ArbitrationCase, StructuredApiError } from '../types/arbitration';
import { serializeCaseContextForAria } from '../utils/sourceVerification';
import { fetchApiJson } from '../utils/apiClient';

interface AriaBriefingResult {
  question: string;
  summaryAnswer: string;
  sourcedFacts: string[];
  missingOrUnverified: string[];
  aiInterpretationNote: string;
  referencedDocIds: string[];
  audioBase64?: string;
  audioError?: string;
}

interface AriaBriefingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeCase: ArbitrationCase | null;
  prefilledQuestion?: string;
  onOpenDocumentById: (docId: string) => void;
  onUserInteraction: (reason: string) => void;
  onSwitchToDemo?: () => void;
}

export const AriaBriefingDrawer: React.FC<AriaBriefingDrawerProps> = ({
  isOpen,
  onClose,
  activeCase,
  prefilledQuestion,
  onOpenDocumentById,
  onUserInteraction,
  onSwitchToDemo,
}) => {
  const [question, setQuestion] = useState('');
  const [includeVoice, setIncludeVoice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribingVoiceQ, setIsTranscribingVoiceQ] = useState(false);
  const [error, setError] = useState<StructuredApiError | null>(null);
  const [history, setHistory] = useState<AriaBriefingResult[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>('');

  useEffect(() => {
    if (prefilledQuestion) {
      setQuestion(prefilledQuestion);
    }
  }, [prefilledQuestion]);

  useEffect(() => {
    // Clear ARIA conversation when switching between Demo and Live cases to prevent cross-case contamination
    setHistory([]);
    setError(null);
  }, [activeCase?.id]);

  if (!isOpen) return null;

  const sampleQuestions =
    activeCase?.origin === 'demo'
      ? [
          'What evidence suggests that the contractor was already delayed?',
          'What documents are missing to resolve critical-path concurrency?',
          'How do Clauses 4.1, 8.3, and 14.3 interact in this dispute?',
        ]
      : [
          'What are the core competing party positions in the uploaded record?',
          'Which factual propositions are missing or require human verification?',
          'Summarize the key contractual obligations and timeline events.',
        ];

  const handleSubmit = async (qOverride?: string) => {
    if (!activeCase) return;
    const query = (qOverride ?? question).trim();
    if (!query || isLoading) return;

    lastQueryRef.current = query;
    onUserInteraction('Interacting with ARIA');
    setIsLoading(true);
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const parsed = await fetchApiJson<Omit<AriaBriefingResult, 'question'>>(
        '/api/aria/briefing',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            question: query,
            caseContext: serializeCaseContextForAria(activeCase),
            caseTitle: activeCase.title,
            caseOrigin: activeCase.origin,
            generateAudio: includeVoice,
          }),
        }
      );
      if (!parsed.ok || !parsed.data) {
        setError(
          parsed.error || {
            category: 'UNKNOWN_ERROR',
            message: 'ARIA did not return a valid briefing response.',
            retryable: true,
          }
        );
        return;
      }

      setHistory((prev) => [{ question: query, ...parsed.data! }, ...prev]);
      if (!qOverride) setQuestion('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError({
        category: 'NETWORK_ERROR',
        message: 'Could not reach ARIA briefing endpoint. Please check connection and retry.',
        retryable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMic = async () => {
    onUserInteraction('Recording voice question for ARIA');
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const recordedMime = (recorder.mimeType || 'audio/webm').split(';')[0].trim();
        const ext = recordedMime.includes('mp4')
          ? 'm4a'
          : recordedMime.includes('ogg')
          ? 'ogg'
          : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: recordedMime });
        if (blob.size === 0) return;

        setIsTranscribingVoiceQ(true);
        try {
          const form = new FormData();
          form.append('audio', blob, `aria_question.${ext}`);
          form.append('title', 'ARIA Voice Question');
          const parsed = await fetchApiJson<{
            segments?: { text: string }[];
          }>('/api/transcribe', {
            method: 'POST',
            body: form,
          });
          if (!parsed.ok || !parsed.data) {
            setError(
              parsed.error || {
                category: 'UNKNOWN_ERROR',
                message: 'Voice transcription failed. You may type your question below.',
                retryable: true,
              }
            );
            return;
          }
          const combinedText = (parsed.data.segments || [])
            .map((s) => s.text)
            .join(' ')
            .trim();
          if (combinedText) {
            setQuestion(combinedText);
          }
        } catch {
          setError({
            category: 'NETWORK_ERROR',
            message: 'Voice transcription failed. You may type your question below.',
            retryable: true,
          });
        } finally {
          setIsTranscribingVoiceQ(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError({
        category: 'AUTH_ERROR',
        message: 'Microphone permission was denied or is unavailable in this browser.',
        retryable: false,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#231612]/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aria-drawer-title"
    >
      <div className="w-full max-w-xl bg-white h-full border-l border-[#DED6CF] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-[#F5F1EC] border-b border-[#DED6CF] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#7E2833]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ARIA · Voice &amp; Evidence Briefing</span>
            </div>
            <h2
              id="aria-drawer-title"
              className="font-serif text-xl font-semibold text-[#231612] mt-0.5"
            >
              {activeCase ? activeCase.title : 'No Live Case Analysed Yet'}
            </h2>
            <p className="text-[11px] text-[#231612]/65">
              Active Context:{' '}
              {!activeCase
                ? 'Awaiting uploaded PDF analysis'
                : activeCase.origin === 'demo'
                ? 'Prepared Fictional Demo'
                : 'Uploaded Case Record'}{' '}
              · Non-binding intelligence
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            aria-label="Close ARIA panel"
            className="p-2 rounded-lg text-[#231612]/70 hover:text-[#231612] hover:bg-[#DED6CF]/40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Briefing Thread */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!activeCase ? (
            <div className="p-5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] text-xs text-[#231612]/80 leading-relaxed space-y-3">
              <p>
                Upload up to 5 PDF documents in Case Workspace and run Google AI
                analysis first so ARIA can ground answers in your uploaded case,
                or switch to the Prepared Demo Case to try ARIA immediately.
              </p>
              {onSwitchToDemo && (
                <button
                  type="button"
                  onClick={onSwitchToDemo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#231612] hover:bg-[#38251F] text-white text-xs font-medium cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Load Prepared Demo Case in ARIA</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Prompt Suggestions */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-[#231612]/70">
                  Suggested Arbitration Questions
                </div>
                <div className="flex flex-col gap-2">
                  {sampleQuestions.map((sq) => (
                    <button
                      key={sq}
                      type="button"
                      onClick={() => handleSubmit(sq)}
                      disabled={isLoading}
                      className="text-left px-3.5 py-2.5 rounded-lg bg-[#F5F1EC] hover:bg-[#DED6CF]/45 border border-[#DED6CF] text-xs font-medium text-[#231612] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {sq}
                    </button>
                  ))}
                </div>
              </div>

          {error && (
            <div className="p-4 rounded-xl bg-[#7E2833]/10 border border-[#7E2833]/30 text-xs text-[#231612] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-[#7E2833] flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{error.category.replace('_', ' ')}</span>
                </div>
                {lastQueryRef.current && (
                  <button
                    type="button"
                    onClick={() => handleSubmit(lastQueryRef.current)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#231612] text-white text-[11px] font-medium hover:bg-[#38251F] cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
              <p>{error.message}</p>
            </div>
          )}

          {isLoading && (
            <div className="p-5 rounded-xl border border-[#DED6CF] bg-[#F5F1EC]/60 flex items-center gap-3 text-xs text-[#231612]/80">
              <Loader2 className="w-4 h-4 animate-spin text-[#7E2833]" />
              <span>
                Reviewing active case record{includeVoice ? ' and generating voice briefing' : ''}...
              </span>
            </div>
          )}

          {history.map((item, idx) => (
            <article
              key={`${idx}-${item.question}`}
              className="rounded-xl border border-[#DED6CF] bg-white overflow-hidden"
            >
              <div className="px-4 py-3 bg-[#F5F1EC] border-b border-[#DED6CF] text-xs font-semibold text-[#231612]">
                Q: {item.question}
              </div>

              <div className="p-4 space-y-4 text-sm text-[#231612]">
                <p className="leading-relaxed">{item.summaryAnswer}</p>

                {/* Explicit Audio Briefing Player (plays only when user clicks play) */}
                {item.audioBase64 && (
                  <div className="p-3 rounded-lg bg-[#F5F1EC] border border-[#DED6CF] space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#7E2833]">
                      <Volume2 className="w-4 h-4" />
                      <span>ARIA Spoken Briefing (Click play to listen)</span>
                    </div>
                    <audio
                      controls
                      preload="none"
                      src={`data:audio/wav;base64,${item.audioBase64}`}
                      className="w-full h-9"
                    />
                  </div>
                )}

                {item.audioError && (
                  <p className="text-xs text-[#7E2833]">{item.audioError}</p>
                )}

                {item.sourcedFacts.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-[#231612]">
                      Documentary Record &amp; Party Citations
                    </div>
                    <ul className="space-y-1 text-xs text-[#231612]/80 list-disc pl-4">
                      {item.sourcedFacts.map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.missingOrUnverified.length > 0 && (
                  <div className="p-3 rounded-lg bg-[#7E2833]/[0.05] border border-[#7E2833]/25 space-y-1">
                    <div className="text-xs font-semibold text-[#7E2833]">
                      Missing or Unverified Evidence
                    </div>
                    <ul className="space-y-1 text-xs text-[#231612]/80 list-disc pl-4">
                      {item.missingOrUnverified.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-2 border-t border-[#DED6CF] text-xs text-[#231612]/70">
                  <span className="font-semibold text-[#231612]">AI Interpretation (Non-Binding): </span>
                  {item.aiInterpretationNote}
                </div>

                {item.referencedDocIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] text-[#231612]/60">Inspect sources:</span>
                    {item.referencedDocIds.map((docId) => (
                      <button
                        key={docId}
                        type="button"
                        onClick={() => onOpenDocumentById(docId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F5F1EC] hover:bg-[#DED6CF]/60 text-[11px] font-mono font-medium text-[#7E2833] cursor-pointer"
                      >
                        <FileText className="w-3 h-3" />
                        <span>{docId}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
            </>
          )}
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="p-4 bg-[#F5F1EC] border-t border-[#DED6CF] space-y-3"
        >
          <div className="flex items-center justify-between text-xs text-[#231612]/75">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVoice}
                onChange={(e) => setIncludeVoice(e.target.checked)}
                className="accent-[#7E2833]"
              />
              <span>Generate spoken voice briefing (Gemini TTS)</span>
            </label>

            <button
              type="button"
              onClick={handleToggleMic}
              disabled={isTranscribingVoiceQ || !activeCase}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                isRecording
                  ? 'bg-[#7E2833] text-white'
                  : 'bg-white border border-[#DED6CF] text-[#231612] hover:bg-[#DED6CF]/30'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>Stop Mic</span>
                </>
              ) : isTranscribingVoiceQ ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Transcribing...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3 h-3 text-[#7E2833]" />
                  <span>Speak Question</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={question}
              disabled={!activeCase}
              onChange={(e) => {
                setQuestion(e.target.value);
                onUserInteraction('Typing question for ARIA');
              }}
              placeholder={
                activeCase
                  ? 'Ask ARIA about evidence, clauses, or gaps in this case...'
                  : 'Analyse a case first to ask ARIA...'
              }
              className="flex-1 px-3.5 py-2.5 rounded-lg bg-white border border-[#DED6CF] text-sm text-[#231612] placeholder:text-[#231612]/45 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!activeCase || !question.trim() || isLoading}
              aria-label="Send question to ARIA"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#231612] hover:bg-[#38251F] disabled:opacity-40 text-white text-xs font-medium cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Brief</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
