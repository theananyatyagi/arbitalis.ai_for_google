import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Mic,
  Square,
  Save,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  RotateCw,
} from 'lucide-react';
import type {
  ArbitrationCase,
  HearingTranscriptRecord,
  StructuredApiError,
  TranscriptSegment,
} from '../types/arbitration';
import { fetchApiJson } from '../utils/apiClient';

interface HearingTranscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCase: ArbitrationCase | null;
  activeOrigin: 'demo' | 'live';
  onSaveTranscript: (record: HearingTranscriptRecord) => void;
  onUserInteraction: (reason: string) => void;
  /** 'modal' = overlay (default); 'page' = dedicated Hearing Intelligence workspace. */
  variant?: 'modal' | 'page';
}

const NO_TIMESTAMP = 'Not timestamped';
const UNATTRIBUTED_SPEAKER = 'Unattributed speaker';

export const HearingTranscriptionModal: React.FC<HearingTranscriptionModalProps> = ({
  isOpen,
  onClose,
  activeCase,
  activeOrigin,
  onSaveTranscript,
  onUserInteraction,
  variant = 'modal',
}) => {
  const [title, setTitle] = useState('Preliminary Hearing Recording');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<StructuredApiError | null>(null);
  const [draftFilename, setDraftFilename] = useState('');
  const [draftSegments, setDraftSegments] = useState<TranscriptSegment[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastAudioRef = useRef<{ blob: Blob; filename: string } | null>(null);

  const isPage = variant === 'page';
  if (!isOpen && !isPage) return null;

  const transcribeBlobOrFile = async (blob: Blob, filename: string) => {
    lastAudioRef.current = { blob, filename };
    setError(null);
    setSavedNotice(false);
    setIsTranscribing(true);
    setDraftFilename(filename);

    try {
      const formData = new FormData();
      formData.append('audio', blob, filename);
      formData.append('title', title || filename);

      const parsed = await fetchApiJson<{
        segments?: { timestamp: string; speaker: string; text: string }[];
        model?: string;
      }>('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      if (!parsed.ok || !parsed.data) {
        setError(
          parsed.error || {
            category: 'UNKNOWN_ERROR',
            message: 'Transcription endpoint did not return valid data.',
            retryable: true,
          }
        );
        return;
      }

      // The plain-text transcription model returns no timing or speaker data; the server
      // fills those fields with placeholders (index-based times, "Speaker N"). Never present
      // placeholders as recorded facts.
      const plainTextModel = parsed.data.model === 'gemini-3.5-transcribe';
      const segments: TranscriptSegment[] = (parsed.data.segments || []).map(
        (s, idx) => ({
          id: `seg-${Date.now()}-${idx}`,
          timestamp: plainTextModel || !s.timestamp ? NO_TIMESTAMP : s.timestamp,
          speaker:
            !s.speaker || (plainTextModel && /^Speaker \d+$/.test(s.speaker))
              ? UNATTRIBUTED_SPEAKER
              : s.speaker,
          text: s.text || '',
          verificationNote: 'Recorded statement — requires verification before treating as established fact.',
        })
      );
      setDraftSegments(segments);
    } catch {
      setError({
        category: 'NETWORK_ERROR',
        message: 'Failed to reach transcription endpoint. Please retry.',
        retryable: true,
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onUserInteraction('Uploading hearing audio for transcription');
    const file = files[0];
    if (file.size > 20 * 1024 * 1024) {
      setError({
        category: 'INVALID_DOCUMENT',
        message: 'Audio file exceeds 20 MB maximum size.',
        retryable: false,
      });
      return;
    }
    transcribeBlobOrFile(file, file.name);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleToggleRecording = async () => {
    onUserInteraction('Recording hearing audio');
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
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const recordedMime = (recorder.mimeType || 'audio/webm').split(';')[0].trim();
        const ext = recordedMime.includes('mp4')
          ? 'm4a'
          : recordedMime.includes('ogg')
          ? 'ogg'
          : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: recordedMime });
        if (blob.size > 0) {
          transcribeBlobOrFile(
            blob,
            `Hearing_Capture_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`
          );
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError({
        category: 'AUTH_ERROR',
        message: 'Microphone permission was denied or is unavailable.',
        retryable: false,
      });
    }
  };

  const handleUpdateSegment = (
    segId: string,
    field: 'speaker' | 'text' | 'linkedNodeId',
    value: string
  ) => {
    setDraftSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, [field]: value } : s))
    );
  };

  const handleSaveArtifact = () => {
    if (draftSegments.length === 0) return;
    const record: HearingTranscriptRecord = {
      id: `tr-${Date.now()}`,
      title: title.trim() || draftFilename || 'Hearing Transcript',
      filename: draftFilename || 'Hearing_Audio',
      origin: activeCase?.origin || activeOrigin,
      recordedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      segments: draftSegments,
      savedAsCaseArtifact: true,
    };
    onSaveTranscript(record);
    setSavedNotice(true);
  };

  return (
    <div
      className={
        isPage
          ? 'max-w-5xl mx-auto w-full px-4 sm:px-8 py-6'
          : 'fixed inset-0 z-50 bg-[#231612]/60 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6'
      }
      {...(isPage ? { role: 'region' } : { role: 'dialog', 'aria-modal': true })}
      aria-labelledby="transcription-modal-title"
    >
      <div
        className={
          isPage
            ? 'bg-white border border-[#E4DED8] rounded-2xl w-full flex flex-col overflow-hidden'
            : 'bg-white border border-[#DED6CF] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl'
        }
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#F5F1EC] border-b border-[#DED6CF] flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-[#7E2833]">
              Hearing Intelligence · Gemini Transcription
            </div>
            <h2
              id="transcription-modal-title"
              className="font-serif text-2xl font-semibold text-[#231612]"
            >
              Hearing Transcription &amp; Verification
            </h2>
            <p className="text-xs text-[#231612]/70 mt-0.5">
              Recorded statements are attributed to speakers and marked for verification — never treated automatically as established facts.
            </p>
          </div>
          {!isPage && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close hearing transcription"
              className="p-2 rounded-lg text-[#231612]/70 hover:text-[#231612] hover:bg-[#DED6CF]/40 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={`flex-1 p-6 space-y-6 ${isPage ? '' : 'overflow-y-auto'}`}>
          {/* Upload / Record Controls */}
          <div className="p-5 rounded-xl bg-[#F5F1EC] border border-[#DED6CF] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="block text-xs font-medium text-[#231612]">
                  Hearing Recording Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#DED6CF] text-xs text-[#231612]"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileChange(e.target.files)}
                className="hidden"
              />

              <button
                type="button"
                disabled={isTranscribing || isRecording}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#231612] hover:bg-[#38251F] disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Audio</span>
              </button>

              <button
                type="button"
                disabled={isTranscribing}
                onClick={handleToggleRecording}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                  isRecording
                    ? 'bg-[#7E2833] text-white'
                    : 'bg-white border border-[#DED6CF] text-[#231612] hover:border-[#7E2833]'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Recording</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5 text-[#7E2833]" />
                    <span>Record Clip</span>
                  </>
                )}
              </button>
            </div>

            {isTranscribing && (
              <div className="flex items-center gap-2 text-xs text-[#231612]">
                <Loader2 className="w-4 h-4 animate-spin text-[#7E2833]" />
                <span>Transcribing "{draftFilename}" with Gemini Audio Transcription...</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-[#7E2833]/10 border border-[#7E2833]/30 text-xs text-[#7E2833] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error.message}</span>
                </div>
                {lastAudioRef.current && (
                  <button
                    type="button"
                    onClick={() => {
                      if (lastAudioRef.current) {
                        transcribeBlobOrFile(
                          lastAudioRef.current.blob,
                          lastAudioRef.current.filename
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#231612] text-white text-[11px] font-medium hover:bg-[#38251F] cursor-pointer shrink-0"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Editable Draft Transcript */}
          {draftSegments.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-serif text-xl font-semibold text-[#231612]">
                  Review &amp; Edit Transcript ({draftSegments.length} segments)
                </h3>
                <button
                  type="button"
                  onClick={handleSaveArtifact}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7E2833] hover:bg-[#93303D] text-white text-xs font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save as Case Artifact</span>
                </button>
              </div>

              {savedNotice && (
                <div className="p-3 rounded-lg bg-[#2D5A3F]/10 border border-[#2D5A3F]/30 text-xs text-[#2D5A3F] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Saved transcript to &ldquo;{activeCase?.title || 'Live Case Session'}&rdquo; case artifacts.</span>
                </div>
              )}

              <div className="space-y-3">
                {draftSegments.map((seg) => (
                  <div
                    key={seg.id}
                    className="p-4 rounded-xl border border-[#DED6CF] bg-white space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono tabular-nums text-[#7E2833]">
                        {seg.timestamp}
                      </span>
                      <input
                        type="text"
                        value={seg.speaker}
                        onChange={(e) =>
                          handleUpdateSegment(seg.id, 'speaker', e.target.value)
                        }
                        aria-label="Speaker name"
                        className="px-2 py-1 rounded border border-[#DED6CF] bg-[#F5F1EC] text-xs font-semibold text-[#231612]"
                      />
                      <select
                        aria-label="Link transcript segment to dispute map node"
                        value={seg.linkedNodeId || ''}
                        onChange={(e) =>
                          handleUpdateSegment(seg.id, 'linkedNodeId', e.target.value)
                        }
                        className="ml-auto px-2 py-1 rounded border border-[#DED6CF] bg-white text-[11px] text-[#231612]"
                      >
                        <option value="">Link to Dispute Map Node (Optional)</option>
                        {(activeCase?.nodes || []).map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={seg.text}
                      onChange={(e) =>
                        handleUpdateSegment(seg.id, 'text', e.target.value)
                      }
                      className="w-full p-2.5 rounded-lg border border-[#DED6CF] text-xs text-[#231612] leading-relaxed"
                    />
                    <div className="text-[11px] text-[#8A5A19]">
                      Traceability: Transcript statement requires documentary verification.
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Existing Saved Transcripts on Active Case */}
          <section className="space-y-3">
            <h3 className="font-serif text-lg font-semibold text-[#231612]">
              Saved Case Transcript Artifacts ({activeCase?.transcripts.length || 0})
            </h3>
            {!activeCase || activeCase.transcripts.length === 0 ? (
              <p className="text-xs text-[#231612]/65">
                No hearing transcripts saved for this case yet.
              </p>
            ) : (
              <div className="space-y-3">
                {activeCase.transcripts.map((tr) => (
                  <div
                    key={tr.id}
                    className="p-4 rounded-xl border border-[#DED6CF] bg-[#F5F1EC]/50 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-[#231612]">{tr.title}</div>
                      <div className="text-[11px] font-mono text-[#231612]/60">
                        {tr.origin === 'demo' ? 'Prepared Demo Transcript' : tr.recordedAt}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {tr.segments.map((seg) => (
                        <div key={seg.id} className="text-xs text-[#231612]/85 leading-relaxed">
                          <span className="font-mono text-[#7E2833] mr-2">[{seg.timestamp}]</span>
                          <strong className="text-[#231612] mr-1.5">{seg.speaker}:</strong>
                          <span>{seg.text}</span>
                          {seg.verificationNote && (
                            <div className="text-[11px] text-[#8A5A19] mt-0.5">
                              {seg.verificationNote}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
