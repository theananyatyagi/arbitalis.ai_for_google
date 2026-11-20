import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  GeminiErrorCategory,
  StructuredApiError,
} from '../src/types/arbitration.ts';

function getAiClient(apiVersion?: 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'MY_GEMINI_API_KEY') {
    const error = new Error('GEMINI_API_KEY is not configured on the server.');
    (error as Error & { category?: GeminiErrorCategory; statusCode?: number }).category = 'AUTH_ERROR';
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function classifyGeminiError(err: unknown): StructuredApiError {
  if (err && typeof err === 'object' && 'category' in err) {
    const typed = err as {
      category: GeminiErrorCategory;
      message: string;
      statusCode?: number;
      detail?: string;
    };
    return {
      category: typed.category,
      message: typed.message,
      detail: typed.detail,
      retryable: typed.category === 'RATE_LIMIT' || typed.category === 'CAPACITY_ERROR',
      statusCode: typed.statusCode || 500,
    };
  }

  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = rawMessage.toLowerCase();
  const status =
    (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return {
      category: 'CAPACITY_ERROR',
      message: 'Analysis timed out while processing documents with Gemini AI. Please retry.',
      detail: rawMessage,
      retryable: true,
      statusCode: 504,
    };
  }

  if (
    lower.includes('abort') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    return {
      category: 'NETWORK_ERROR',
      message: 'Analysis request was cancelled.',
      detail: rawMessage,
      retryable: false,
      statusCode: 499,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthorized')
  ) {
    return {
      category: 'AUTH_ERROR',
      message:
        'Gemini API authentication failed. Please check the server GEMINI_API_KEY configuration in Settings > Secrets.',
      detail: rawMessage,
      retryable: false,
      statusCode: 403,
    };
  }

  if (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('billing') ||
    lower.includes('exceeded your current quota')
  ) {
    return {
      category: 'QUOTA_EXCEEDED',
      message:
        'Gemini API quota exceeded for the current key. Live analysis could not complete; your uploaded documents have been preserved.',
      detail: rawMessage,
      retryable: false,
      statusCode: 429,
    };
  }

  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      category: 'RATE_LIMIT',
      message: 'Gemini API rate limit reached temporarily. Please retry shortly.',
      detail: rawMessage,
      retryable: true,
      statusCode: 429,
    };
  }

  if (
    status === 503 ||
    status === 502 ||
    lower.includes('overloaded') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('capacity')
  ) {
    return {
      category: 'CAPACITY_ERROR',
      message: 'Gemini model is temporarily at high capacity. Please try again in a few moments.',
      detail: rawMessage,
      retryable: true,
      statusCode: 503,
    };
  }

  if (
    status === 400 ||
    lower.includes('invalid_argument') ||
    lower.includes('unable to process input') ||
    lower.includes('corrupt') ||
    lower.includes('unsupported')
  ) {
    return {
      category: 'INVALID_DOCUMENT',
      message:
        'One or more uploaded files could not be parsed by Gemini. Verify the files are valid, unencrypted PDFs or supported audio.',
      detail: rawMessage,
      retryable: false,
      statusCode: 400,
    };
  }

  if (
    lower.includes('fetch') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('network')
  ) {
    return {
      category: 'NETWORK_ERROR',
      message: 'Network interruption while reaching Gemini AI services. Please retry.',
      detail: rawMessage,
      retryable: true,
      statusCode: 502,
    };
  }

  return {
    category: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred while processing with Gemini AI.',
    detail: rawMessage,
    retryable: false,
    statusCode: status || 500,
  };
}

function isModelUnavailableForFallback(err: unknown): boolean {
  const classified = classifyGeminiError(err);
  const raw = err instanceof Error ? err.message.toLowerCase() : String(err ?? '').toLowerCase();
  const status = (err as { status?: number })?.status;
  return (
    classified.category === 'CAPACITY_ERROR' ||
    classified.category === 'RATE_LIMIT' ||
    classified.category === 'QUOTA_EXCEEDED' ||
    classified.category === 'NETWORK_ERROR' ||
    status === 404 ||
    raw.includes('not_found') ||
    raw.includes('not found')
  );
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Request aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('Request aborted'));
      },
      { once: true }
    );
  });
}

async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
  maxRetries = 0
): Promise<T> {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      throw new Error('Request aborted');
    }
    try {
      return await operation();
    } catch (err) {
      const classified = classifyGeminiError(err);
      if (!classified.retryable || attempt >= maxRetries || signal?.aborted) {
        throw err;
      }
      const backoffMs = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      attempt += 1;
      await sleep(backoffMs, signal);
    }
  }
}

const modelCooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 10_000;

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutLabel: string,
  attemptController: AbortController
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const timeoutError = Object.assign(
        new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`),
        { category: 'CAPACITY_ERROR' as GeminiErrorCategory, statusCode: 504 }
      );
      attemptController.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runWithModelFallback<T>(
  candidates: { model: string; apiVersion?: 'v1beta'; timeoutMs?: number; retries?: number }[],
  fn: (model: string, ai: GoogleGenAI, attemptSignal: AbortSignal) => Promise<T>,
  signal?: AbortSignal
): Promise<{ result: T; modelUsed: string }> {
  const now = Date.now();
  const filtered = candidates.filter((c, idx) => {
    if (idx === candidates.length - 1) return true;
    const until = modelCooldownUntil.get(c.model) || 0;
    return now >= until;
  });
  const activeCandidates = filtered.length > 0 ? filtered : candidates;

  let firstMeaningfulErr: unknown;
  let lastErr: unknown;
  const attemptNotes: string[] = [];

  for (let i = 0; i < activeCandidates.length; i += 1) {
    const candidate = activeCandidates[i];
    if (signal?.aborted) throw new Error('Request aborted');

    const ai = getAiClient(candidate.apiVersion);
    const isLast = i === activeCandidates.length - 1;
    const attemptController = new AbortController();
    const onParentAbort = () => attemptController.abort(signal?.reason);
    signal?.addEventListener('abort', onParentAbort, { once: true });

    const timeoutMs = candidate.timeoutMs ?? (isLast ? 24_000 : 16_000);
    const retries = candidate.retries ?? (i === 0 ? 2 : 0);
    const t0 = Date.now();

    try {
      const result = await runWithTimeout(
        withGeminiRetry(
          () => fn(candidate.model, ai, attemptController.signal),
          attemptController.signal,
          retries
        ),
        timeoutMs,
        candidate.model,
        attemptController
      );
      console.log(`[Gemini] ok model=${candidate.model} ms=${Date.now() - t0}`);
      return { result, modelUsed: candidate.model };
    } catch (err) {
      const elapsed = Date.now() - t0;
      const parentAborted = Boolean(signal?.aborted);
      if (parentAborted) {
        throw err;
      }

      const timedOutLocally = attemptController.signal.aborted && !parentAborted;
      const effectiveErr = timedOutLocally
        ? Object.assign(
            new Error('Analysis timed out while processing documents with Gemini AI. Please retry.'),
            {
              category: 'CAPACITY_ERROR' as GeminiErrorCategory,
              statusCode: 504,
              detail: `${candidate.model} timed out after ${timeoutMs}ms`,
            }
          )
        : err;

      if (!firstMeaningfulErr) firstMeaningfulErr = effectiveErr;
      lastErr = effectiveErr;
      const rawDetail =
        (effectiveErr as { detail?: string })?.detail ||
        (effectiveErr instanceof Error ? effectiveErr.message : String(effectiveErr));
      attemptNotes.push(`${candidate.model} (${elapsed}ms): ${rawDetail.slice(0, 120)}`);
      console.warn(`[Gemini] fail model=${candidate.model} ms=${elapsed} err=${rawDetail.slice(0, 160)}`);

      if (timedOutLocally || isModelUnavailableForFallback(effectiveErr)) {
        if (!isLast) {
          const isDailyQuota =
            rawDetail.toLowerCase().includes('requestsperday') ||
            rawDetail.toLowerCase().includes('daily');
          modelCooldownUntil.set(
            candidate.model,
            Date.now() + (isDailyQuota ? 300_000 : COOLDOWN_MS)
          );
          continue;
        }
        break;
      }
      throw effectiveErr;
    } finally {
      signal?.removeEventListener('abort', onParentAbort);
    }
  }

  const primaryClassified = classifyGeminiError(firstMeaningfulErr);
  const lastClassified = classifyGeminiError(lastErr);
  const errorToThrow =
    lastClassified.category === 'QUOTA_EXCEEDED' && primaryClassified.category === 'CAPACITY_ERROR'
      ? firstMeaningfulErr
      : lastErr;

  if (errorToThrow && typeof errorToThrow === 'object' && attemptNotes.length > 0) {
    (errorToThrow as { detail?: string }).detail = attemptNotes.join(' | ');
  }
  throw errorToThrow;
}

export interface UploadedPdfInput {
  docId: string;
  filename: string;
  category: string;
  base64Pdf?: string;
  extractedPages?: { pageNumber: number; text: string }[];
}

export async function analyzeArbitrationDocuments(
  docs: UploadedPdfInput[],
  signal?: AbortSignal
) {
  const docParts: Array<
    | { inlineData: { mimeType: string; data: string } }
    | { text: string }
  > = [];

  for (const doc of docs) {
    if (doc.base64Pdf) {
      docParts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: doc.base64Pdf,
        },
      });
    } else if (doc.extractedPages && doc.extractedPages.length > 0) {
      const formattedPages = doc.extractedPages
        .map((p) => `[${doc.docId} | ${doc.filename} | Page ${p.pageNumber}]\n${p.text}`)
        .join('\n\n');
      docParts.push({
        text: `Document Content for ${doc.docId} (${doc.filename}, Category: ${doc.category}):\n${formattedPages}`,
      });
    }
  }

  const docManifestText = docs
    .map((d, idx) => `${idx + 1}. docId="${d.docId}" | filename="${d.filename}" | category="${d.category}"`)
    .join('\n');

  const prompt = `You are an arbitration intelligence analyst assisting a human arbitrator.
Analyze ONLY the attached PDF documents and document pages listed below. Do NOT invent facts, parties, dates, clauses, page numbers, or quotes that do not appear in these documents.

Attached Document Manifest:
${docManifestText}

Instructions:
1. Identify the dispute title, Claimant, Respondent, seat/rules (if stated, else "Uploaded Case Record"), and a concise neutral case overview.
2. Identify 1 to 3 core disputed issues (issues array). Each issue needs a centralNodeId matching a node with category="central_issue".
3. Build a structured Dispute Reasoning Map (nodes and edges):
   - Every central issue must be a node with category="central_issue".
   - Connect competing Claimant Positions (category="claimant_position"), Respondent Positions (category="respondent_position"), Contractual Obligations (category="contractual_obligation"), Supporting Evidence (category="supporting_evidence"), Contradictory Evidence (category="contradictory_evidence"), Timeline Events (category="timeline_event"), Missing Evidence / Evidentiary Gaps (category="missing_evidence"), and Questions for Human Determination (category="human_question").
   - Every node that cites a document MUST provide exact verbatim substrings in citedExcerpt, accurate docId and filename from the manifest, and 1-indexed pageReference (or null if uncertain — never guess a page number).
   - Distinguish party_statement, documentary_statement, and ai_interpretation accurately in attributionType.
   - Connect nodes with meaningful edges using ONLY relationships: "Supports", "Contradicts", "Relates to", "Depends on", "Requires Verification".
4. Extract chronological timeline events, contractual obligations, and explicit evidentiary gaps (what is referenced or needed to resolve an issue but missing from the uploaded batch).
5. NEVER determine liability or adjudicate which party wins.`;

  const { result: response, modelUsed } = await runWithModelFallback(
    [
      { model: 'gemini-3.1-flash-lite', timeoutMs: 65_000, retries: 1 },
      { model: 'gemini-4-hydrogen', timeoutMs: 45_000, retries: 0 },
    ],
    (model, ai, attemptSignal) =>
      ai.models.generateContent({
        model,
        contents: {
          parts: [...docParts, { text: prompt }],
        },
        config: {
          abortSignal: attemptSignal,
          thinkingConfig: {
            thinkingLevel:
              model === 'gemini-3.1-flash-lite'
                ? ThinkingLevel.MINIMAL
                : ThinkingLevel.LOW,
          },
          systemInstruction:
            'You are Arbitalis.AI structured evidence extraction engine. Return strictly valid JSON conforming to the schema. Quote verbatim passages accurately and never fabricate page numbers or missing documents.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              claimant: { type: Type.STRING },
              respondent: { type: Type.STRING },
              seatAndRules: { type: Type.STRING },
              overview: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    question: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    centralNodeId: { type: Type.STRING },
                  },
                  required: ['id', 'title', 'question', 'summary', 'centralNodeId'],
                },
              },
              nodes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    issueId: { type: Type.STRING },
                    parentId: { type: Type.STRING },
                    category: { type: Type.STRING },
                    label: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    partyAttribution: { type: Type.STRING },
                    attributionType: { type: Type.STRING },
                    dateLabel: { type: Type.STRING },
                    citations: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          propositionId: { type: Type.STRING },
                          docId: { type: Type.STRING },
                          filename: { type: Type.STRING },
                          pageReference: { type: Type.INTEGER, nullable: true },
                          citedExcerpt: { type: Type.STRING },
                          relationship: { type: Type.STRING },
                          attributionType: { type: Type.STRING },
                        },
                        required: [
                          'propositionId',
                          'docId',
                          'filename',
                          'citedExcerpt',
                          'relationship',
                          'attributionType',
                        ],
                      },
                    },
                  },
                  required: [
                    'id',
                    'issueId',
                    'category',
                    'label',
                    'summary',
                    'explanation',
                    'attributionType',
                    'citations',
                  ],
                },
              },
              edges: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    issueId: { type: Type.STRING },
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                    relationship: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: ['id', 'issueId', 'source', 'target', 'relationship'],
                },
              },
              timeline: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    date: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    significance: { type: Type.STRING },
                    docId: { type: Type.STRING },
                    filename: { type: Type.STRING },
                    pageReference: { type: Type.INTEGER, nullable: true },
                    citedExcerpt: { type: Type.STRING },
                    attributionType: { type: Type.STRING },
                  },
                  required: ['id', 'date', 'title', 'description', 'significance', 'attributionType'],
                },
              },
              obligations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    clause: { type: Type.STRING },
                    party: { type: Type.STRING },
                    obligation: { type: Type.STRING },
                    docId: { type: Type.STRING },
                    filename: { type: Type.STRING },
                    pageReference: { type: Type.INTEGER, nullable: true },
                    citedExcerpt: { type: Type.STRING },
                  },
                  required: ['id', 'clause', 'party', 'obligation'],
                },
              },
              gaps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    impact: { type: Type.STRING },
                    requestedAction: { type: Type.STRING },
                    issueId: { type: Type.STRING },
                  },
                  required: ['id', 'title', 'description', 'impact', 'requestedAction', 'issueId'],
                },
              },
            },
            required: [
              'title',
              'claimant',
              'respondent',
              'overview',
              'issues',
              'nodes',
              'edges',
              'timeline',
              'obligations',
              'gaps',
            ],
          },
        },
      }),
    signal
  );

  const text = (response.text ?? '{}').trim();
  return {
    analysis: JSON.parse(text),
    modelUsed,
  };
}

export async function askAriaBriefing(
  params: {
    question: string;
    caseContext: string;
    caseTitle: string;
    caseOrigin: string;
    generateAudio: boolean;
  },
  signal?: AbortSignal
) {
  const { result: textResponse } = await runWithModelFallback(
    [
      { model: 'gemini-3.1-flash-lite', timeoutMs: 18_000, retries: 2 },
      { model: 'gemini-4-hydrogen', timeoutMs: 10_000, retries: 0 },
    ],
    (model, ai, attemptSignal) =>
      ai.models.generateContent({
        model,
        contents: `Active Case: ${params.caseTitle} (${params.caseOrigin === 'demo' ? 'Prepared Fictional Demo' : 'User Uploaded Case'})

Case Context (Use ONLY this information):
${params.caseContext}

Arbitrator Question:
${params.question}`,
        config: {
          abortSignal: attemptSignal,
          thinkingConfig: {
            thinkingLevel:
              model === 'gemini-3.1-flash-lite'
                ? ThinkingLevel.MINIMAL
                : ThinkingLevel.LOW,
          },
          systemInstruction: `You are ARIA, the Arbitalis.AI Arbitration Intelligence Briefing Assistant.
Strict rules:
1. Ground every statement in the provided Active Case Context. Never import facts from other cases.
2. Explicitly separate:
   - What the documentary exhibits state (cite exhibit ID, filename, and page number if available)
   - What a party alleges (state which party)
   - What remains missing or unverified in the record
   - Brief analytical framing (explicitly labeled as AI interpretation)
3. Never issue a binding legal conclusion or declare a winner. Remind the user where human determination is required.
4. Return structured JSON with concise prose suitable for both reading and spoken briefing.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryAnswer: {
                type: Type.STRING,
                description: 'Clear 2-4 sentence direct briefing answer suitable for voice readout.',
              },
              sourcedFacts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Facts grounded in specific exhibits or pleadings with exhibit/page citation.',
              },
              missingOrUnverified: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Evidentiary gaps or unverified points needing human review.',
              },
              aiInterpretationNote: {
                type: Type.STRING,
                description: 'Analytical synthesis framed non-bindingly for the arbitrator.',
              },
              referencedDocIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'summaryAnswer',
              'sourcedFacts',
              'missingOrUnverified',
              'aiInterpretationNote',
              'referencedDocIds',
            ],
          },
        },
      }),
    signal
  );

  const parsed = JSON.parse((textResponse.text ?? '{}').trim()) as {
    summaryAnswer: string;
    sourcedFacts: string[];
    missingOrUnverified: string[];
    aiInterpretationNote: string;
    referencedDocIds: string[];
  };

  let audioBase64: string | undefined;
  let audioError: string | undefined;

  if (params.generateAudio && parsed.summaryAnswer) {
    try {
      const spokenScript = [
        parsed.summaryAnswer,
        parsed.missingOrUnverified.length > 0
          ? `Note on missing evidence: ${parsed.missingOrUnverified[0]}`
          : '',
      ]
        .filter(Boolean)
        .join(' ');

      const { result: ttsResponse } = await runWithModelFallback(
        [
          { model: 'gemini-3.8-flash-lite-tts', apiVersion: 'v1beta', timeoutMs: 20_000, retries: 1 },
          { model: 'gemini-3.8-flash-tts', apiVersion: 'v1beta', timeoutMs: 30_000, retries: 0 },
        ],
        (ttsModel, ttsClient, attemptSignal) =>
          ttsClient.models.generateContent({
            model: ttsModel,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: spokenScript,
                    speechMetadata: {
                      style: 'Calm, authoritative, measured legal briefing voice',
                    },
                  },
                ],
              },
            ],
            config: {
              abortSignal: attemptSignal,
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
              },
            },
          }),
        signal
      );

      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (ttsErr) {
      if (signal?.aborted) throw ttsErr;
      const classified = classifyGeminiError(ttsErr);
      audioError = `Voice synthesis unavailable (${classified.message}). Text briefing is shown above.`;
    }
  }

  return {
    ...parsed,
    audioBase64,
    audioError,
  };
}

/**
 * Transcript segments as returned by /api/transcribe.
 * `timestamp` and `speaker` are null when the model did not genuinely provide them —
 * they are never synthesised by the server.
 */
export interface TranscriptSegmentOut {
  timestamp: string | null;
  speaker: string | null;
  text: string;
}

export const NO_SPEECH_TEXT = '[No clear speech detected]';

const TIMESTAMP_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const UNKNOWN_SPEAKER_TOKENS = new Set([
  '',
  'unknown',
  'n/a',
  'na',
  'null',
  'none',
  'unspecified',
  'unidentified',
  'not available',
]);

export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().replace(/^\[|\]$/g, '').trim();
  return TIMESTAMP_RE.test(t) ? t : null;
}

export function normalizeSpeaker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return UNKNOWN_SPEAKER_TOKENS.has(t.toLowerCase()) ? null : t;
}

function noSpeechSegment(): TranscriptSegmentOut {
  return { timestamp: null, speaker: null, text: NO_SPEECH_TEXT };
}

/** Cleans model-returned segments: keeps genuine values, turns anything unknown into null. */
export function normalizeTranscriptSegments(raw: unknown): TranscriptSegmentOut[] {
  const list = Array.isArray(raw) ? raw : [];
  const segments = list
    .map((s): TranscriptSegmentOut => {
      const item = (s ?? {}) as { timestamp?: unknown; speaker?: unknown; text?: unknown };
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (text === NO_SPEECH_TEXT) return noSpeechSegment();
      return {
        timestamp: normalizeTimestamp(item.timestamp),
        speaker: normalizeSpeaker(item.speaker),
        text,
      };
    })
    .filter((s) => s.text.length > 0);
  return segments.length > 0 ? segments : [noSpeechSegment()];
}

/**
 * Parses plain-text transcription output. A leading "[MM:SS]" timestamp or a "Name:" label is kept
 * only when it is literally present in the model's text; otherwise the field stays null.
 */
export function parsePlainTextTranscript(rawText: string): TranscriptSegmentOut[] {
  const lines = (rawText ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [noSpeechSegment()];
  const LINE_RE =
    /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-\u2013\u2014]?\s*)?(?:([A-Za-z][A-Za-z0-9 ._()'-]{1,40}):\s+)?(.+)$/;
  return normalizeTranscriptSegments(
    lines.map((line) => {
      const m = line.match(LINE_RE);
      return m
        ? { timestamp: m[1] ?? null, speaker: m[2] ?? null, text: m[3] }
        : { timestamp: null, speaker: null, text: line };
    })
  );
}

export async function transcribeHearingAudio(
  params: {
    base64Audio: string;
    mimeType: string;
    title: string;
  },
  signal?: AbortSignal
) {
  const audioPart = {
    inlineData: {
      mimeType: params.mimeType,
      data: params.base64Audio,
    },
  };

  const { result: segments, modelUsed } = await runWithModelFallback(
    [
      { model: 'gemini-3.5-transcribe', apiVersion: 'v1beta', timeoutMs: 25_000, retries: 0 },
      { model: 'gemini-3.1-flash-lite', timeoutMs: 60_000, retries: 1 },
      { model: 'gemini-4-hydrogen', timeoutMs: 7_000, retries: 0 },
    ],
    async (model, ai, attemptSignal) => {
      if (model === 'gemini-3.5-transcribe') {
        // gemini-3.5-transcribe outputs plain text only (JSON mode is not supported on this model)
        const r = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              audioPart,
              {
                text: `Transcribe only clearly audible speech in this arbitration hearing audio ("${params.title}"). Do not invent words if silent. Add a speaker label or [MM:SS] timestamp to a line only if you can genuinely determine it; never guess.`,
              },
            ],
          },
          config: {
            abortSignal: attemptSignal,
          },
        });
        return parsePlainTextTranscript((r.text ?? '').trim());
      }

      const r = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            audioPart,
            {
              text: `Transcribe this arbitration hearing audio ("${params.title}") accurately. Where speakers are genuinely distinguishable, label them; where timing is genuinely known, give timestamps as MM:SS. If a speaker or timestamp cannot be determined, return null for that field — NEVER guess or invent one. CRITICAL: Transcribe ONLY actual spoken words clearly audible in the recording. If the audio is silent, contains only tones or background noise, or has no clear speech, DO NOT invent or guess dialogue — return exactly one segment with timestamp null, speaker null, and text "[No clear speech detected]".`,
            },
          ],
        },
        config: {
          abortSignal: attemptSignal,
          thinkingConfig: {
            thinkingLevel:
              model === 'gemini-3.1-flash-lite'
                ? ThinkingLevel.MINIMAL
                : ThinkingLevel.LOW,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              segments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    timestamp: { type: Type.STRING, nullable: true },
                    speaker: { type: Type.STRING, nullable: true },
                    text: { type: Type.STRING },
                  },
                  required: ['text'],
                },
              },
            },
            required: ['segments'],
          },
        },
      });

      const parsed = JSON.parse((r.text ?? '{"segments":[]}').trim()) as {
        segments?: unknown;
      };
      return normalizeTranscriptSegments(parsed.segments);
    },
    signal
  );

  return {
    segments,
    modelUsed,
  };
}
