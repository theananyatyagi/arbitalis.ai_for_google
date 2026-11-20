export type CaseOrigin = 'demo' | 'live';

export type DocumentCategory =
  | 'Contract'
  | 'Pleadings'
  | 'Correspondence'
  | 'Technical Record'
  | 'Evidence / Exhibit'
  | 'Hearing Transcript';

export type VerificationStatus = 'verified' | 'unverified' | 'pending';

export type AttributionType =
  | 'party_statement'
  | 'documentary_statement'
  | 'ai_interpretation'
  | 'human_finding';

export type NodeCategory =
  | 'central_issue'
  | 'claimant_position'
  | 'respondent_position'
  | 'contractual_obligation'
  | 'supporting_evidence'
  | 'contradictory_evidence'
  | 'timeline_event'
  | 'missing_evidence'
  | 'human_question';

export type EdgeRelationship =
  | 'Supports'
  | 'Contradicts'
  | 'Relates to'
  | 'Depends on'
  | 'Requires Verification';

export type ReviewDecision = 'pending' | 'accepted' | 'rejected' | 'further_evidence';

export interface CaseDocumentPage {
  pageNumber: number;
  text: string;
}

export interface CaseDocument {
  id: string;
  filename: string;
  title: string;
  category: DocumentCategory;
  origin: CaseOrigin;
  sizeBytes?: number;
  pageCount: number;
  pages: CaseDocumentPage[];
  objectUrl?: string;
  uploadedAt?: string;
  isMissingPlaceholder?: boolean;
}

export interface CitationReference {
  propositionId: string;
  docId: string;
  filename: string;
  pageReference: number | null;
  citedExcerpt: string;
  relationship: EdgeRelationship;
  verificationStatus: VerificationStatus;
  verificationReason?: string;
  attributionType: AttributionType;
}

export interface DisputeNode {
  id: string;
  issueId: string;
  category: NodeCategory;
  label: string;
  summary: string;
  explanation: string;
  partyAttribution?: string;
  attributionType: AttributionType;
  dateLabel?: string;
  citations: CitationReference[];
  reviewDecision: ReviewDecision;
  reviewNote?: string;
  reviewedAt?: string;
  isDemoReview?: boolean;
  parentId?: string;
}

export interface DisputeEdge {
  id: string;
  issueId: string;
  source: string;
  target: string;
  relationship: EdgeRelationship;
  rationale?: string;
}

export interface DisputedIssue {
  id: string;
  title: string;
  question: string;
  summary: string;
  centralNodeId: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  significance: string;
  docId?: string;
  filename?: string;
  pageReference?: number | null;
  citedExcerpt?: string;
  verificationStatus: VerificationStatus;
  attributionType: AttributionType;
}

export interface ContractualObligation {
  id: string;
  clause: string;
  party: string;
  obligation: string;
  docId?: string;
  filename?: string;
  pageReference?: number | null;
  citedExcerpt?: string;
  verificationStatus: VerificationStatus;
}

export interface EvidentiaryGap {
  id: string;
  title: string;
  description: string;
  impact: string;
  requestedAction: string;
  issueId: string;
}

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
  linkedNodeId?: string;
  verificationNote?: string;
}

export interface HearingTranscriptRecord {
  id: string;
  title: string;
  filename: string;
  origin: CaseOrigin;
  recordedAt?: string;
  segments: TranscriptSegment[];
  savedAsCaseArtifact: boolean;
}

export interface ArbitrationCase {
  id: string;
  title: string;
  caseNumber: string;
  origin: CaseOrigin;
  claimant: string;
  respondent: string;
  seatAndRules: string;
  overview: string;
  documents: CaseDocument[];
  issues: DisputedIssue[];
  nodes: DisputeNode[];
  edges: DisputeEdge[];
  timeline: TimelineEvent[];
  obligations: ContractualObligation[];
  gaps: EvidentiaryGap[];
  transcripts: HearingTranscriptRecord[];
  analyzedAt?: string;
  analysisModel?: string;
}

export type AppView = 'home' | 'workspace' | 'map' | 'review';

export type GeminiErrorCategory =
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMIT'
  | 'CAPACITY_ERROR'
  | 'AUTH_ERROR'
  | 'INVALID_DOCUMENT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface StructuredApiError {
  category: GeminiErrorCategory;
  message: string;
  detail?: string;
  retryable: boolean;
  statusCode?: number;
}
