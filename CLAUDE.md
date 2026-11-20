# Arbitalis.AI — Architecture & Development Handoff

> **Project context:** Google Startup Buildathon India 2026 prototype.  
> Built and exported from Google AI Studio. Non-technical founder; handle all code changes carefully.

---

## 1. What This Application Does

Arbitalis.AI is an **AI-powered arbitration intelligence workspace**. It helps arbitration professionals (lawyers, arbitrators) organise, analyse, and reason over conflicting legal evidence.

A user uploads PDF case documents (contracts, correspondence, site records, etc.). The app sends them to **Google Gemini** for structured analysis and builds:

- A **Dispute Reasoning Map** — a visual graph of competing positions, evidence nodes, and contradictions.
- A **Findings Review Board** — a structured checklist where the arbitrator approves, rejects, or flags each AI finding.
- An **ARIA voice briefing assistant** — a conversational AI that answers specific questions about the case, grounded only in the uploaded documents.
- A **Hearing Transcription** tool — uploads audio recordings of hearings and transcribes them via Gemini.
- A **Guided Demo Tour** — a 6-stage auto-advancing walkthrough of a prepared fictional case (no API key needed).

**The core design principle:** AI organises the evidence; human judgment determines the dispute. The app never makes a binding legal conclusion.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React icons, Motion (Framer) |
| Backend | Node.js, Express 4, `tsx` (runs TypeScript directly) |
| AI SDK | `@google/genai` v3.6+ (official Google Gemini SDK) |
| PDF rendering | `pdfjs-dist` v6 (renders uploaded PDFs in the browser) |
| File uploads | `multer` (memory storage; max 5 PDFs × 15 MB, 1 audio × 20 MB) |
| Dev server | Vite dev server proxied through Express (`middlewareMode: true`) |
| Package manager | npm (uses `package-lock.json`; also has `bun.lock` from original export) |

---

## 3. File Structure

```
arbitalis.ai/
├── server.ts               # Express server + API routes (entry point)
├── server/
│   └── gemini.ts           # All Gemini API calls, model fallback, error classification
├── src/
│   ├── App.tsx             # Root React component; all application state lives here
│   ├── main.tsx            # React entry point
│   ├── index.css           # Global styles (Tailwind v4)
│   ├── types/
│   │   └── arbitration.ts  # All TypeScript interfaces and types (source of truth)
│   ├── data/
│   │   └── demoCase.ts     # Prepared fictional demo case dataset (725 lines)
│   ├── components/
│   │   ├── TopNav.tsx              # Navigation bar + ARIA/Transcription buttons
│   │   ├── WelcomeScreen.tsx       # Homepage / landing screen
│   │   ├── DemoTourController.tsx  # Guided demo stage controller (6 stages)
│   │   ├── CaseWorkspace.tsx       # Document upload, PDF viewer, analysis trigger
│   │   ├── DisputeReasoningMap.tsx # Visual evidence graph (the main feature)
│   │   ├── FindingsReviewBoard.tsx # Arbitrator review checklist
│   │   ├── AriaBriefingDrawer.tsx  # ARIA Q&A side drawer
│   │   ├── HearingTranscriptionModal.tsx # Audio upload & transcription
│   │   ├── SourceViewerModal.tsx   # In-app PDF viewer with excerpt highlighting
│   │   └── BrandLogo.tsx           # Logo component
│   └── utils/
│       ├── apiClient.ts        # Frontend HTTP helpers (fetch, error parsing)
│       └── sourceVerification.ts # Citation verification logic
├── public/
│   └── assets/aistudio/    # Static images (logo, screenshots)
├── dist/                   # Production build output (pre-built, do not edit)
├── tests/
│   └── acceptance.test.ts  # Acceptance/smoke tests
├── index.html              # Vite HTML template
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies and scripts
├── .env.example            # Template for environment variables
└── metadata.json           # Google AI Studio export metadata
```

---

## 4. How to Run Locally

### Prerequisites
- Node.js ≥ 18 and npm installed
- A Gemini API key (free tier works; get one at https://aistudio.google.com)

### Environment Setup
Create a `.env` file in the project root (never commit this):
```
GEMINI_API_KEY=your_actual_key_here
```

### Commands
```bash
# Install dependencies (only needed once)
npm install

# Start development server (frontend + backend together)
npm run dev
# → Opens at http://localhost:3000

# TypeScript type-check only (no compile output)
npm run lint

# Production build
npm run build

# Serve production build
npm start
```

> **Important:** `npm run dev` uses `tsx server.ts` which starts Express + Vite together on port 3000.  
> There is NO separate `npm run frontend` or `npm run backend` command.

---

## 5. API Routes (Backend — `server.ts`)

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check; returns `{ status: "ok", hasApiKey: boolean }` |
| `POST` | `/api/analyze` | Upload 1–5 PDFs → Gemini document analysis → returns structured `ArbitrationCase` JSON |
| `POST` | `/api/aria/briefing` | Ask ARIA a question about the active case → returns structured briefing JSON (+ optional audio) |
| `POST` | `/api/transcribe` | Upload audio file → Gemini transcription → returns transcript segments |
| `ALL` | `/api/*` | 404 for unknown API endpoints |

**Rate limiting:** 30 AI requests per IP per 60-second sliding window (server-side, in-memory).

---

## 6. Gemini Integration (Backend — `server/gemini.ts`)

### 6.1 Three Gemini Features

#### A. Document Analysis (`analyzeArbitrationDocuments`)
- Called when a user uploads PDFs and clicks "Analyse"
- Sends PDFs as inline base64 data to Gemini with a detailed structured prompt
- Returns a fully structured `ArbitrationCase` JSON (nodes, edges, issues, timeline, obligations, gaps)
- **Model fallback chain:** `gemini-3.1-flash-lite` (65s timeout, 1 retry) → `gemini-4-hydrogen` (45s timeout, 0 retries)
- Uses `responseMimeType: 'application/json'` and a strict `responseSchema` to enforce output shape
- **Prompt instruction:** Gemini must NEVER invent facts, page numbers, or excerpts not in the actual documents

#### B. ARIA Briefing (`askAriaBriefing`)
- Called from `AriaBriefingDrawer` when user submits a question
- Receives: the question + a text summary of the current case as context
- Returns: `summaryAnswer`, `sourcedFacts[]`, `missingOrUnverified[]`, `aiInterpretationNote`, `referencedDocIds[]`
- Optionally calls the TTS model chain to synthesise audio (`gemini-3.8-flash-lite-tts` → `gemini-3.8-flash-tts`)
- **Model fallback chain:** `gemini-3.1-flash-lite` (18s, 2 retries) → `gemini-4-hydrogen` (10s, 0 retries)

#### C. Hearing Transcription (`transcribeHearingAudio`)
- Called from `HearingTranscriptionModal` when user uploads an audio file
- Sends audio as inline base64 with MIME type
- Returns structured transcript segments with speaker labels and timestamps
- **Model fallback chain:** `gemini-3.5-transcribe` (6.5s, v1beta, 0 retries) → `gemini-3.1-flash-lite` (14s, 1 retry) → `gemini-4-hydrogen` (7s, 0 retries)

### 6.2 Error Handling & Classification (`classifyGeminiError`)

All Gemini errors are classified into typed categories before returning to the frontend:

| Category | Meaning | Retryable? |
|---|---|---|
| `QUOTA_EXCEEDED` | API quota/billing exhausted | No |
| `RATE_LIMIT` | Too many requests (429) | Yes |
| `CAPACITY_ERROR` | Model overloaded, timeout (503/504) | Yes |
| `AUTH_ERROR` | Invalid/missing API key (401/403) | No |
| `INVALID_DOCUMENT` | Bad PDF or unsupported file (400) | No |
| `NETWORK_ERROR` | Network interruption, abort | Conditional |
| `UNKNOWN_ERROR` | Anything else | No |

### 6.3 Model Fallback System (`runWithModelFallback`)

The app uses a **candidate chain** pattern:
1. Try the primary model with its timeout
2. If it fails (capacity/rate-limit/timeout/not-found), apply a 10-second cooldown to that model and try the next candidate
3. If all candidates fail, throw the most informative error

A `runWithTimeout` wrapper races the actual API call against a `setTimeout` and aborts cleanly on timeout.

---

## 7. Frontend State Architecture (`src/App.tsx`)

All application state lives in the root `App` component and is passed down as props:

```
App
├── activeView: 'home' | 'workspace' | 'map' | 'review'
├── activeOrigin: 'demo' | 'live'   ← strict isolation between demo and live case
├── demoCase: ArbitrationCase        ← always populated from demoCase.ts
├── liveCase: ArbitrationCase | null ← null until user uploads and analyses PDFs
├── stagedUploads: StagedPdfUpload[] ← files staged in UI before analysis starts
├── isDemoTourActive / isDemoPlaying / demoStage (1–6) ← guided tour state
├── selectedIssueId / selectedNodeId / focusedReviewNodeId ← map/review selection
├── sourceViewer / ariaOpen / transcriptionOpen ← modal/drawer state
└── handlers: handleOpenDocument, handleUpdateNodeReview, handleSaveTranscript, etc.
```

**Demo vs Live isolation:** `demoCase` and `liveCase` are completely separate state slices. Switching between them never contaminates data.

---

## 8. The Demo Case (`src/data/demoCase.ts`)

The demo case is **entirely fictional, pre-authored data** — no API call is made to run it.

**Case:** *ABC Contractors v. XYZ Infrastructure* (construction arbitration)  
**Core dispute:** Was the 45-day site access delay purely the employer's fault, or was the contractor already delayed due to crane failure and staffing shortages?

The demo dataset contains:
- 5 fictional PDF documents (with full text content embedded as strings)
- 3 disputed issues with node graphs, edges, citations, timeline events, obligations, and evidentiary gaps
- Pre-authored node review decisions (accepted/rejected/pending) marked `isDemoReview: true`
- A fictional hearing transcript

**Label:** All demo content is marked with `origin: 'demo'` and `caseNumber` contains `"(Prepared Fictional Demo)"`.

---

## 9. The Guided Demo Tour (`src/components/DemoTourController.tsx`)

6 sequential stages, auto-advancing every 10.5 seconds when "Play" is active:

| Stage | View | What it shows |
|---|---|---|
| 1 | Workspace → Documents | Document list with uploaded case files |
| 2 | Workspace → Documents | Document detail / preview state |
| 3 | Workspace → Intelligence | AI analysis summary panel |
| 4 | Map | Dispute Reasoning Map animating in node-by-node |
| 5 | Map | Specific evidence node highlighted (crane log) |
| 6 | Review | Findings Review Board focused on a missing evidence node |

Auto-advance pauses if the user opens a modal (source viewer, ARIA, etc.). The user can navigate manually with Previous/Next/stage selector.

---

## 10. Key Data Types (`src/types/arbitration.ts`)

The most important interfaces:

- **`ArbitrationCase`** — the full case record (documents, issues, nodes, edges, timeline, obligations, gaps, transcripts)
- **`DisputeNode`** — a node in the reasoning map (has category, citations, review decision)
- **`NodeCategory`** — `central_issue | claimant_position | respondent_position | contractual_obligation | supporting_evidence | contradictory_evidence | timeline_event | missing_evidence | human_question`
- **`CitationReference`** — a link from a node to a specific document, page, and verbatim excerpt
- **`VerificationStatus`** — `verified | unverified | pending` (computed by `sourceVerification.ts`)
- **`ReviewDecision`** — `pending | accepted | rejected | further_evidence` (set by arbitrator in FindingsReviewBoard)
- **`StructuredApiError`** — the typed error envelope all API calls return on failure

---

## 11. Citation Verification (`src/utils/sourceVerification.ts`)

When the analysis result arrives, citations are verified client-side:
- Checks if the cited `docId` exists in the case's document list
- Checks if the cited `pageReference` is within the document's `pageCount`
- Checks if the `citedExcerpt` text appears (fuzzy) in the page text
- Sets `verificationStatus` to `verified`, `unverified`, or `pending` accordingly
- Adds a human-readable `verificationReason` for transparency

This prevents fabricated citations from appearing as verified without being checked.

---

## 12. What Works (Confirmed Functional)

| Feature | Status |
|---|---|
| Guided Demo Tour (6 stages, auto-advance, manual nav) | ✅ Fully functional, no API key needed |
| Dispute Reasoning Map (demo case) | ✅ Fully functional |
| Findings Review Board (accept/reject/flag nodes) | ✅ Functional for both demo and live cases |
| Source Viewer Modal (PDF page viewer + excerpt highlight) | ✅ Functional |
| ARIA Briefing Drawer (Q&A, needs API key) | ✅ Functional with valid Gemini API key |
| PDF Document Upload + Analysis (needs API key) | ✅ Functional with valid Gemini API key |
| Hearing Audio Transcription (needs API key) | ✅ Functional with valid Gemini API key |
| ARIA Voice Output / TTS (needs API key) | ✅ Functional with valid Gemini API key |
| TypeScript type-check (`npm run lint`) | ✅ Passes |
| Production build (`npm run build`) | ✅ Builds successfully |
| Health check endpoint (`/api/health`) | ✅ Functional |

---

## 13. Known Limitations & What to Watch Out For

1. **Model names in `server/gemini.ts`** — The fallback model names (`gemini-3.1-flash-lite`, `gemini-4-hydrogen`, `gemini-3.5-transcribe`, `gemini-3.8-flash-lite-tts`, `gemini-3.8-flash-tts`) were confirmed available via the project's Google AI SDK at the time of the last fix. **Do not change these without verifying availability through the official SDK or AI Studio.**

2. **No database** — All case data lives in React component state. Refreshing the browser resets the live case. The demo case always reloads from `demoCase.ts`.

3. **No authentication** — This is a prototype. Any user on the same network can access the API endpoints.

4. **API key is server-side only** — The key is never sent to the browser. It is loaded from `.env` via `dotenv` in `server.ts`. Do not add it to any frontend file.

5. **PDF text extraction** — The backend sends PDFs as base64 binary to Gemini (Gemini reads them natively). The frontend also does client-side text extraction via `pdfjs-dist` for the `extractedPages` fallback path (used if binary upload fails).

6. **Audio for TTS** — The `v1beta` API version is required for TTS models. The `getAiClient()` function accepts an optional `apiVersion` param for this.

7. **Rate limiting** — The in-memory rate limiter resets on server restart. It is per-IP and per-minute (30 requests/min).

---

## 14. Changes Made During Buildathon Session

### Session 1 — Diagnostic & Document Analysis Fix
- **`server/gemini.ts`** — Increased primary document analysis timeout from 24s → 65s. Fixed error classification so local timeouts correctly report as `CAPACITY_ERROR` (timeout), not as "high demand". Added proper model fallback chain with cooldown tracking. Improved `classifyGeminiError` to correctly distinguish timeout vs quota vs rate-limit errors.

### Session 2 — UI/UX Improvements (Phase 1–E)
Improvements were applied across multiple component files to strengthen:
- End-to-end issue exploration in the Dispute Reasoning Map
- Citation verification clarity (verified vs unverified vs pending badges)
- Human review experience with clear status indicators
- Upload, processing, and error state display

> **Git checkpoint was created before Session 1 edits.** Check `git log` for the checkpoint commit.

---

## 15. Development Rules (Non-Negotiable for Handoff)

1. **Do not change Gemini model names** without verifying availability in the official SDK.
2. **Do not add new npm dependencies** without founder approval.
3. **Do not deploy** or enable billing.
4. **Do not modify the demo case data** in `demoCase.ts` without clearly labelling it as fictional.
5. **Do not fabricate citations, evidence, or analysis results** in any code path.
6. **Always create a git checkpoint** before making code changes.
7. **Run `npm run lint` and `npm run build`** after every set of changes and confirm both pass.
8. **Keep the demo tour working** — it is the primary Buildathon demonstration path.
9. **Preserve the ARIA, transcription, and document viewer features** — they are judged features.
10. **Keep the application accessible and responsive** — judges may view it on various devices.

---

## 16. Judging Criteria Mapping

| Criterion | Weight | How the App Addresses It |
|---|---|---|
| Functional Product & Implementation | 30% | End-to-end document upload → Gemini analysis → reasoning map → human review |
| Technical Architecture & Engineering Quality | 20% | Typed TypeScript, structured error handling, model fallback, schema-enforced AI output |
| Google AI Integration & Implementation Depth | 20% | Gemini text analysis, Gemini TTS (voice ARIA), Gemini audio transcription, structured JSON schema output |
| Problem–Solution Alignment | 15% | Real arbitration workflow: evidence organisation + human judgment (not automated decision-making) |
| UX, Usability & Accessibility | 10% | Guided demo tour, responsive layout, clear error states, citation verification badges |
| Innovation & Differentiation | 5% | Dispute Reasoning Map as a visual legal graph; ARIA as a grounded, source-cited Q&A assistant |

---

*This file was generated to assist agent handoff. Last updated: November 2026.*
