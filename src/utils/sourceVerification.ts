import * as pdfjsLib from 'pdfjs-dist';
import type {
  ArbitrationCase,
  AttributionType,
  CaseDocument,
  CaseDocumentPage,
  CitationReference,
  DisputeEdge,
  DisputeNode,
  EdgeRelationship,
  NodeCategory,
  VerificationStatus,
} from '../types/arbitration';

// Configure PDF.js worker using Vite asset resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function loadPdfFromObjectUrl(objectUrl: string): Promise<pdfjsLib.PDFDocumentProxy> {
  const response = await fetch(objectUrl);
  if (!response.ok) {
    throw new Error(`Failed to read local PDF blob (HTTP ${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  return loadingTask.promise;
}

export async function extractPdfPages(file: File): Promise<{
  pageCount: number;
  pages: CaseDocumentPage[];
}> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pages: CaseDocumentPage[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    pages.push({
      pageNumber: i,
      text: strings.join(' ').replace(/\s+/g, ' ').trim(),
    });
  }

  return {
    pageCount: pdf.numPages,
    pages,
  };
}

function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyCitationAgainstDocuments(
  citation: {
    docId: string;
    filename: string;
    pageReference: number | null;
    citedExcerpt: string;
  },
  documents: CaseDocument[]
): {
  status: VerificationStatus;
  matchedDocId: string;
  matchedPage: number | null;
  reason: string;
} {
  const doc =
    documents.find((d) => d.id === citation.docId) ||
    documents.find(
      (d) => d.filename.toLowerCase() === citation.filename.toLowerCase()
    );

  if (!doc || doc.isMissingPlaceholder || doc.pages.length === 0) {
    return {
      status: 'unverified',
      matchedDocId: citation.docId,
      matchedPage: citation.pageReference,
      reason: 'Source not verified — human review required. Referenced document is missing or has no extractable text.',
    };
  }

  const normalizedExcerpt = normalizeForMatch(citation.citedExcerpt);
  if (normalizedExcerpt.length < 12) {
    return {
      status: 'unverified',
      matchedDocId: doc.id,
      matchedPage: citation.pageReference,
      reason: 'Source not verified — human review required. Excerpt too brief for automated passage verification.',
    };
  }

  // Check specified page first
  if (citation.pageReference && citation.pageReference >= 1) {
    const targetPage = doc.pages.find((p) => p.pageNumber === citation.pageReference);
    if (targetPage && matchesExcerpt(normalizedExcerpt, normalizeForMatch(targetPage.text))) {
      return {
        status: 'verified',
        matchedDocId: doc.id,
        matchedPage: targetPage.pageNumber,
        reason: `Verified against ${doc.filename} (Page ${targetPage.pageNumber}).`,
      };
    }
  }

  // Fall back to scanning all pages of the matched document
  for (const page of doc.pages) {
    if (matchesExcerpt(normalizedExcerpt, normalizeForMatch(page.text))) {
      return {
        status: 'verified',
        matchedDocId: doc.id,
        matchedPage: page.pageNumber,
        reason: `Verified against ${doc.filename} (Page ${page.pageNumber}).`,
      };
    }
  }

  return {
    status: 'unverified',
    matchedDocId: doc.id,
    matchedPage: citation.pageReference,
    reason:
      'Source not verified — human review required. Cited passage could not be reliably matched in extracted PDF text.',
  };
}

function matchesExcerpt(excerptNorm: string, pageNorm: string): boolean {
  if (!pageNorm) return false;
  if (pageNorm.includes(excerptNorm)) return true;

  // Token-window overlap check (handles minor line-break/OCR spacing differences)
  const excerptWords = excerptNorm.split(' ').filter((w) => w.length > 2);
  if (excerptWords.length < 4) return false;

  // Check consecutive 5-word phrases
  const chunkSize = Math.min(5, excerptWords.length);
  let matchedChunks = 0;
  const totalChunks = Math.max(1, excerptWords.length - chunkSize + 1);
  for (let i = 0; i <= excerptWords.length - chunkSize; i += 1) {
    const phrase = excerptWords.slice(i, i + chunkSize).join(' ');
    if (pageNorm.includes(phrase)) {
      matchedChunks += 1;
    }
  }
  return matchedChunks / totalChunks >= 0.45;
}

const VALID_CATEGORIES: Set<NodeCategory> = new Set([
  'central_issue',
  'claimant_position',
  'respondent_position',
  'contractual_obligation',
  'supporting_evidence',
  'contradictory_evidence',
  'timeline_event',
  'missing_evidence',
  'human_question',
]);

const VALID_RELATIONSHIPS: Set<EdgeRelationship> = new Set([
  'Supports',
  'Contradicts',
  'Relates to',
  'Depends on',
  'Requires Verification',
]);

export function buildVerifiedLiveCase(
  rawAnalysis: {
    title?: string;
    claimant?: string;
    respondent?: string;
    seatAndRules?: string;
    overview?: string;
    issues?: {
      id: string;
      title: string;
      question: string;
      summary: string;
      centralNodeId: string;
    }[];
    nodes?: {
      id: string;
      issueId: string;
      parentId?: string;
      category: string;
      label: string;
      summary: string;
      explanation: string;
      partyAttribution?: string;
      attributionType: string;
      dateLabel?: string;
      citations: {
        propositionId: string;
        docId: string;
        filename: string;
        pageReference?: number | null;
        citedExcerpt: string;
        relationship: string;
        attributionType: string;
      }[];
    }[];
    edges?: {
      id: string;
      issueId: string;
      source: string;
      target: string;
      relationship: string;
      rationale?: string;
    }[];
    timeline?: {
      id: string;
      date: string;
      title: string;
      description: string;
      significance: string;
      docId?: string;
      filename?: string;
      pageReference?: number | null;
      citedExcerpt?: string;
      attributionType: string;
    }[];
    obligations?: {
      id: string;
      clause: string;
      party: string;
      obligation: string;
      docId?: string;
      filename?: string;
      pageReference?: number | null;
      citedExcerpt?: string;
    }[];
    gaps?: {
      id: string;
      title: string;
      description: string;
      impact: string;
      requestedAction: string;
      issueId: string;
    }[];
  },
  documents: CaseDocument[],
  modelName: string
): ArbitrationCase {
  const issues = (rawAnalysis.issues || []).length
    ? rawAnalysis.issues!
    : [
        {
          id: 'issue-1',
          title: 'Primary Disputed Issue',
          question: rawAnalysis.title || 'Primary Dispute in Uploaded Record',
          summary: rawAnalysis.overview || 'Extracted from uploaded documents.',
          centralNodeId: 'node-central-1',
        },
      ];

  const nodes: DisputeNode[] = (rawAnalysis.nodes || []).map((n) => {
    const category = VALID_CATEGORIES.has(n.category as NodeCategory)
      ? (n.category as NodeCategory)
      : 'supporting_evidence';

    const verifiedCitations: CitationReference[] = (n.citations || []).map((c) => {
      const check = verifyCitationAgainstDocuments(
        {
          docId: c.docId,
          filename: c.filename,
          pageReference: c.pageReference ?? null,
          citedExcerpt: c.citedExcerpt || '',
        },
        documents
      );

      const rel = VALID_RELATIONSHIPS.has(c.relationship as EdgeRelationship)
        ? (c.relationship as EdgeRelationship)
        : 'Relates to';

      const attrType =
        c.attributionType === 'party_statement' ||
        c.attributionType === 'documentary_statement' ||
        c.attributionType === 'ai_interpretation'
          ? c.attributionType
          : 'ai_interpretation';

      return {
        propositionId: c.propositionId,
        docId: check.matchedDocId,
        filename: c.filename,
        pageReference: check.matchedPage,
        citedExcerpt: c.citedExcerpt,
        relationship: rel,
        verificationStatus: check.status,
        verificationReason: check.reason,
        attributionType: attrType,
      };
    });

    const attrType =
      n.attributionType === 'party_statement' ||
      n.attributionType === 'documentary_statement' ||
      n.attributionType === 'ai_interpretation'
        ? n.attributionType
        : 'ai_interpretation';

    return {
      id: n.id,
      issueId: n.issueId || issues[0].id,
      parentId: n.parentId,
      category,
      label: n.label,
      summary: n.summary,
      explanation: n.explanation,
      partyAttribution: n.partyAttribution,
      attributionType: attrType,
      dateLabel: n.dateLabel,
      citations: verifiedCitations,
      reviewDecision: 'pending',
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: DisputeEdge[] = (rawAnalysis.edges || [])
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      issueId: e.issueId || issues[0].id,
      source: e.source,
      target: e.target,
      relationship: VALID_RELATIONSHIPS.has(e.relationship as EdgeRelationship)
        ? (e.relationship as EdgeRelationship)
        : 'Relates to',
      rationale: e.rationale,
    }));

  const timeline = (rawAnalysis.timeline || []).map((t) => {
    const check =
      t.docId && t.citedExcerpt
        ? verifyCitationAgainstDocuments(
            {
              docId: t.docId,
              filename: t.filename || '',
              pageReference: t.pageReference ?? null,
              citedExcerpt: t.citedExcerpt,
            },
            documents
          )
        : { status: 'unverified' as VerificationStatus, matchedDocId: t.docId || '', matchedPage: null, reason: '' };

    const timelineAttr: AttributionType =
      t.attributionType === 'party_statement' ||
      t.attributionType === 'documentary_statement'
        ? t.attributionType
        : 'ai_interpretation';

    return {
      ...t,
      docId: check.matchedDocId || t.docId,
      pageReference: check.matchedPage ?? t.pageReference ?? null,
      verificationStatus: check.status,
      attributionType: timelineAttr,
    };
  });

  const obligations = (rawAnalysis.obligations || []).map((o) => {
    const check =
      o.docId && o.citedExcerpt
        ? verifyCitationAgainstDocuments(
            {
              docId: o.docId,
              filename: o.filename || '',
              pageReference: o.pageReference ?? null,
              citedExcerpt: o.citedExcerpt,
            },
            documents
          )
        : { status: 'unverified' as VerificationStatus, matchedDocId: o.docId || '', matchedPage: null, reason: '' };

    return {
      ...o,
      docId: check.matchedDocId || o.docId,
      pageReference: check.matchedPage ?? o.pageReference ?? null,
      verificationStatus: check.status,
    };
  });

  return {
    id: `live-case-${Date.now()}`,
    title: rawAnalysis.title || 'Uploaded Arbitration Case',
    caseNumber: `LIVE-${new Date().toISOString().slice(0, 10)}`,
    origin: 'live',
    claimant: rawAnalysis.claimant || 'Claimant (from uploaded record)',
    respondent: rawAnalysis.respondent || 'Respondent (from uploaded record)',
    seatAndRules: rawAnalysis.seatAndRules || 'Uploaded Case Documents',
    overview: rawAnalysis.overview || 'Structured intelligence extracted from uploaded PDF records.',
    documents,
    issues,
    nodes,
    edges,
    timeline,
    obligations,
    gaps: rawAnalysis.gaps || [],
    transcripts: [],
    analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    analysisModel: modelName,
  };
}

export function serializeCaseContextForAria(activeCase: ArbitrationCase): string {
  const docs = activeCase.documents
    .map((d) => `- ${d.id}: ${d.filename} (${d.category}, ${d.isMissingPlaceholder ? 'MISSING FROM RECORD' : `${d.pageCount} pages`})`)
    .join('\n');

  const nodes = activeCase.nodes
    .map((n) => {
      const cites = n.citations
        .map(
          (c) =>
            `[${c.docId} "${c.filename}" p.${c.pageReference ?? '?'} | ${c.verificationStatus}]: "${c.citedExcerpt}"`
        )
        .join('; ');
      return `- [${n.category}] ${n.label} (Attribution: ${n.attributionType}; Review: ${n.reviewDecision})\n  Summary: ${n.summary}\n  Citations: ${cites || 'None'}`;
    })
    .join('\n');

  const gaps = activeCase.gaps
    .map((g) => `- GAP: ${g.title} — ${g.description} (Impact: ${g.impact})`)
    .join('\n');

  return `CASE TITLE: ${activeCase.title}
PARTIES: ${activeCase.claimant} vs ${activeCase.respondent}
OVERVIEW: ${activeCase.overview}

DOCUMENTS:
${docs}

DISPUTE NODES & CITATIONS:
${nodes}

EVIDENTIARY GAPS:
${gaps || 'None explicitly flagged.'}`;
}
