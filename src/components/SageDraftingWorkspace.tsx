import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Copy, Download, Check, X, Scale } from 'lucide-react';
import type {
  ArbitrationCase,
  CitationReference,
  DisputeNode,
  NodeCategory,
  ReviewDecision,
  VerificationStatus,
} from '../types/arbitration';

/**
 * SAGE Drafting — a human-authored, source-linked working draft.
 * Nothing here calls an AI model or generates award text. The tribunal types the document;
 * reviewed findings and clause extracts can be inserted from the case record, and every
 * inserted finding carries clickable source references back to the underlying exhibits.
 */

const JUDICIAL_NOTICE =
  'SAGE assembles reviewed findings and cited sources solely to support panel deliberation. It does not generate reasoning or an award. The tribunal retains plenary, non-delegable authority and sole responsibility for factual adjudication, contractual interpretation, and any operative decision.';

type SectionId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII';

const SECTIONS: { id: SectionId; title: string; hint: string }[] = [
  { id: 'I', title: 'The Issue for Determination', hint: 'State the question the tribunal must decide.' },
  { id: 'II', title: "Claimant's Position", hint: "Summarise the Claimant's case. Insert reviewed findings from the vault." },
  { id: 'III', title: "Respondent's Position and Defence", hint: "Summarise the Respondent's case. Insert reviewed findings from the vault." },
  { id: 'IV', title: 'Contractual Framework and Relevant Clauses', hint: 'Insert clause extracts from the record, or type them.' },
  { id: 'V', title: 'Summary of Evidence Admitted and Evaluated', hint: 'Record the evidence the tribunal has weighed.' },
  { id: 'VI', title: 'Matters Requiring Tribunal Adjudication', hint: 'Holding section — to be completed by the tribunal. Unresolved gaps and questions are listed here.' },
  { id: 'VII', title: 'Preliminary Reasoning and Dispositive Holding', hint: 'Reserved for the tribunal’s own reasoning. Nothing is pre-filled.' },
];

const DEFAULT_SECTION: Record<NodeCategory, SectionId> = {
  central_issue: 'I',
  claimant_position: 'II',
  respondent_position: 'III',
  contractual_obligation: 'IV',
  supporting_evidence: 'V',
  contradictory_evidence: 'V',
  timeline_event: 'V',
  missing_evidence: 'VI',
  human_question: 'VI',
};

const DECISION_LABEL: Record<ReviewDecision, string> = {
  accepted: 'Accepted',
  pending: 'Pending review',
  rejected: 'Rejected',
  further_evidence: 'Further evidence needed',
};

const DECISION_STYLE: Record<ReviewDecision, string> = {
  accepted: 'bg-[#EBF3ED] text-[#1C542D]',
  pending: 'bg-[#F5EFE6] text-[#7A5826]',
  rejected: 'bg-[#FDECEB] text-[#8C2323]',
  further_evidence: 'bg-[#F8EFEB] text-[#7E2833]',
};

const VERIFY_STYLE: Record<VerificationStatus, string> = {
  verified: 'bg-[#EBF3ED] text-[#1C542D] border-[#C8E4D7]',
  pending: 'bg-[#F5EFE6] text-[#7A5826] border-[#E8DCC6]',
  unverified: 'bg-[#FDECEB] text-[#8C2323] border-[#F4C9C6]',
};

interface SourceChip {
  key: string;
  section: SectionId;
  citation: CitationReference;
}

interface DraftState {
  text: Record<SectionId, string>;
  sources: SourceChip[];
  issueId?: string;
}

const emptyText = (): Record<SectionId, string> => ({ I: '', II: '', III: '', IV: '', V: '', VI: '', VII: '' });

const storageKey = (caseId: string) => `arbitalis.sage.v1.${caseId}`;

function loadDraft(caseId: string): DraftState | null {
  try {
    const raw = window.localStorage.getItem(storageKey(caseId));
    return raw ? (JSON.parse(raw) as DraftState) : null;
  } catch {
    return null;
  }
}

function saveDraft(caseId: string, draft: DraftState) {
  try {
    window.localStorage.setItem(storageKey(caseId), JSON.stringify(draft));
  } catch {
    /* storage unavailable — draft simply stays in memory */
  }
}

const AutoTextarea: React.FC<{
  id: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}> = ({ id, value, placeholder, onChange }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      id={id}
      ref={ref}
      value={value}
      rows={3}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none bg-transparent font-serif-editorial text-[15px] leading-6 text-[#231612] placeholder:italic placeholder:text-[#231612]/40 focus:outline-none"
    />
  );
};

interface SageDraftingWorkspaceProps {
  activeCase: ArbitrationCase | null;
  selectedIssueId: string;
  onSelectIssue: (issueId: string) => void;
  onOpenCitation: (citation: CitationReference) => void;
  onUserInteraction: (reason: string) => void;
  onGoToWorkspace: () => void;
}

export const SageDraftingWorkspace: React.FC<SageDraftingWorkspaceProps> = ({
  activeCase,
  selectedIssueId,
  onSelectIssue,
  onOpenCitation,
  onUserInteraction,
  onGoToWorkspace,
}) => {
  const caseId = activeCase?.id ?? '';
  const [draft, setDraft] = useState<DraftState>({ text: emptyText(), sources: [] });
  const [loadedFor, setLoadedFor] = useState<string>('');
  const [showUnreviewed, setShowUnreviewed] = useState(false);
  const [copied, setCopied] = useState(false);

  const issue = activeCase?.issues.find((i) => i.id === selectedIssueId) ?? activeCase?.issues[0];

  // Load the saved draft whenever the active case changes (keeps demo and live drafts isolated).
  useEffect(() => {
    if (!activeCase) return;
    const saved = loadDraft(activeCase.id);
    if (saved) {
      setDraft({ text: { ...emptyText(), ...saved.text }, sources: saved.sources ?? [] });
    } else {
      setDraft({ text: emptyText(), sources: [] });
    }
    setLoadedFor(activeCase.id);
  }, [activeCase?.id]);

  useEffect(() => {
    if (caseId && loadedFor === caseId) saveDraft(caseId, draft);
  }, [draft, caseId, loadedFor]);

  const issueNodes = useMemo(
    () => (activeCase && issue ? activeCase.nodes.filter((n) => n.issueId === issue.id) : []),
    [activeCase, issue]
  );
  const vaultNodes = issueNodes.filter(
    (n) => n.category !== 'central_issue' && n.reviewDecision !== 'rejected' && (showUnreviewed || n.reviewDecision === 'accepted')
  );
  const hiddenCount = issueNodes.filter(
    (n) => n.category !== 'central_issue' && n.reviewDecision !== 'rejected' && n.reviewDecision !== 'accepted'
  ).length;
  const gaps = activeCase?.gaps.filter((g) => !issue || g.issueId === issue.id) ?? [];
  const obligations = activeCase?.obligations ?? [];

  if (!activeCase || !issue) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-16 text-center">
        <Scale className="w-8 h-8 text-[#7E2833] mx-auto mb-4" aria-hidden="true" />
        <h1 className="text-headline-lg text-[#231612]">No case to draft from yet</h1>
        <p className="mt-3 text-body-md text-[#231612]/70">
          SAGE Drafting works from an analysed case and your reviewed findings. Upload and analyse case documents, or open the
          prepared fictional demo case.
        </p>
        <button
          type="button"
          onClick={onGoToWorkspace}
          className="mt-6 inline-flex items-center gap-2 px-[18px] py-2.5 rounded-md bg-[#231612] text-[#FAF8F5] text-sm font-medium hover:bg-[#381F1A] cursor-pointer"
        >
          Go to Case Workspace <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const setSection = (id: SectionId, value: string) => {
    setDraft((d) => ({ ...d, text: { ...d.text, [id]: value } }));
  };

  const appendToSection = (id: SectionId, paragraph: string) => {
    onUserInteraction('Inserted into SAGE draft');
    setDraft((d) => {
      const current = d.text[id].trimEnd();
      return { ...d, text: { ...d.text, [id]: current ? `${current}\n\n${paragraph}` : paragraph } };
    });
  };

  const insertNode = (node: DisputeNode) => {
    const section = DEFAULT_SECTION[node.category];
    const tag = node.reviewDecision === 'accepted' ? '' : '[Unreviewed AI finding — verify before relying on it] ';
    appendToSection(section, `${tag}${node.label}. ${node.summary}`);
    setDraft((d) => {
      const existing = new Set(d.sources.map((s) => s.key));
      const added = node.citations
        .map((c, i) => ({ key: `${section}|${node.id}|${i}`, section, citation: c }))
        .filter((s) => !existing.has(s.key));
      return { ...d, sources: [...d.sources, ...added] };
    });
  };

  const insertClause = (idx: number) => {
    const o = obligations[idx];
    const text = `${o.clause} (${o.party}): ${o.obligation}${o.citedExcerpt ? `\n“${o.citedExcerpt}”` : ''}`;
    appendToSection('IV', text);
    if (o.docId) {
      const citation: CitationReference = {
        propositionId: o.id,
        docId: o.docId,
        filename: o.filename ?? o.docId,
        pageReference: o.pageReference ?? null,
        citedExcerpt: o.citedExcerpt ?? '',
        relationship: 'Relates to',
        verificationStatus: o.verificationStatus,
        attributionType: 'documentary_statement',
      };
      setDraft((d) => ({ ...d, sources: [...d.sources, { key: `IV|${o.id}|${d.sources.length}`, section: 'IV', citation }] }));
    }
  };

  const insertGap = (idx: number) => {
    const g = gaps[idx];
    appendToSection('VI', `Evidentiary gap — ${g.title}: ${g.description} Requested action: ${g.requestedAction}`);
  };

  const buildPlainText = () => {
    const parts = [
      `WORKING DRAFT — NOT AN AWARD`,
      `${activeCase.title}`,
      `${activeCase.claimant} (Claimant) v. ${activeCase.respondent} (Respondent)`,
      '',
      `Judicial Notice: ${JUDICIAL_NOTICE}`,
      '',
    ];
    for (const s of SECTIONS) {
      parts.push(`${s.id}. ${s.title.toUpperCase()}`);
      parts.push(draft.text[s.id].trim() || '[To be completed by the tribunal]');
      const src = draft.sources.filter((x) => x.section === s.id);
      if (src.length) {
        parts.push(
          'Sources: ' +
            src.map((x) => `${x.citation.docId}${x.citation.pageReference ? ` p.${x.citation.pageReference}` : ''} (${x.citation.verificationStatus})`).join('; ')
        );
      }
      parts.push('');
    }
    return parts.join('\n');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleDownload = () => {
    const blob = new Blob([buildPlainText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `working-draft-${activeCase.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const prefillIssue = () => setSection('I', issue.question);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="text-label-upper text-[#7E2833]">SAGE Drafting · Human-authored working draft</div>
          <h1 className="text-headline-lg text-[#231612] mt-1">Tribunal Working Draft</h1>
          <p className="text-body-sm text-[#554243] mt-1">
            {activeCase.title} · {activeCase.origin === 'demo' ? 'Prepared fictional demo case' : 'Uploaded case record'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-white border border-[#E4DED8] text-sm text-[#231612] hover:bg-[#F5F1EC] cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-[#1C542D]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy text'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#231612] text-[#FAF8F5] text-sm hover:bg-[#381F1A] cursor-pointer"
          >
            <Download className="w-4 h-4" /> Download .txt
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-[#F5EFE6] border border-[#E8DCC6] px-4 py-3 text-body-sm text-[#7A5826]">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          <strong>Working draft — not an award.</strong> {JUDICIAL_NOTICE}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
        {/* Evidence vault */}
        <aside aria-label="Reviewed findings and sources" className="space-y-4 order-2 lg:order-1 lg:sticky lg:top-24">
          <div className="bg-white border border-[#E4DED8] rounded-xl p-4">
            <label htmlFor="sage-issue" className="text-label-upper text-[#554243]">
              Disputed issue
            </label>
            <select
              id="sage-issue"
              value={issue.id}
              onChange={(e) => onSelectIssue(e.target.value)}
              className="mt-2 w-full rounded-md border border-[#E4DED8] bg-[#FAF8F5] px-3 py-2 text-sm text-[#231612]"
            >
              {activeCase.issues.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={prefillIssue}
              className="mt-3 text-citation text-[#7E2833] hover:underline cursor-pointer"
            >
              Insert issue question into Section I →
            </button>
          </div>

          <div className="bg-white border border-[#E4DED8] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-headline-sm text-[#231612]">Reviewed findings</h2>
              <label className="flex items-center gap-1.5 text-[11px] text-[#554243] cursor-pointer">
                <input type="checkbox" checked={showUnreviewed} onChange={(e) => setShowUnreviewed(e.target.checked)} />
                Show unreviewed
              </label>
            </div>
            {vaultNodes.length === 0 && (
              <p className="text-body-sm text-[#554243]">
                No accepted findings for this issue yet. Accept findings on the Dispute Map
                {hiddenCount > 0 ? `, or show the ${hiddenCount} unreviewed finding${hiddenCount === 1 ? '' : 's'}.` : '.'}
              </p>
            )}
            {vaultNodes.map((n) => (
              <div key={n.id} className="rounded-lg bg-[#FAF8F5] border border-[#E4DED8] p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C6A53]">
                    {n.category.replace(/_/g, ' ')}
                  </span>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${DECISION_STYLE[n.reviewDecision]}`}>
                    {DECISION_LABEL[n.reviewDecision]}
                  </span>
                </div>
                <p className="text-sm font-medium text-[#231612]">{n.label}</p>
                <p className="text-body-sm text-[#554243] mt-1 line-clamp-3">{n.summary}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {n.citations.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onOpenCitation(c)}
                      className={`text-[11px] font-mono px-1.5 py-0.5 rounded border cursor-pointer ${VERIFY_STYLE[c.verificationStatus]}`}
                      title={`Open source — ${c.verificationStatus}`}
                    >
                      {c.docId}
                      {c.pageReference ? ` p.${c.pageReference}` : ''}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => insertNode(n)}
                  className="mt-2 text-citation text-[#7E2833] hover:underline cursor-pointer"
                >
                  Insert into Section {DEFAULT_SECTION[n.category]} →
                </button>
              </div>
            ))}
          </div>

          {gaps.length > 0 && (
            <div className="rounded-xl border-[1.5px] border-dashed border-[#C0392B] bg-[#FAF6F5] p-4 space-y-3">
              <h2 className="text-headline-sm text-[#661D1D]">Evidentiary gaps</h2>
              {gaps.map((g, i) => (
                <div key={g.id}>
                  <p className="text-sm font-medium text-[#661D1D]">{g.title}</p>
                  <p className="text-body-sm text-[#554243] mt-0.5">{g.description}</p>
                  <button
                    type="button"
                    onClick={() => insertGap(i)}
                    className="mt-1 text-citation text-[#7E2833] hover:underline cursor-pointer"
                  >
                    Insert into Section VI →
                  </button>
                </div>
              ))}
            </div>
          )}

          {obligations.length > 0 && (
            <div className="bg-white border border-[#E4DED8] rounded-xl p-4 space-y-3">
              <h2 className="text-headline-sm text-[#231612]">Governing clauses</h2>
              {obligations.map((o, i) => (
                <div key={o.id} className="text-body-sm">
                  <p className="font-mono text-[12px] text-[#7E2833]">{o.clause}</p>
                  <p className="text-[#554243]">{o.obligation}</p>
                  <button
                    type="button"
                    onClick={() => insertClause(i)}
                    className="mt-0.5 text-citation text-[#7E2833] hover:underline cursor-pointer"
                  >
                    Insert extract into Section IV →
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Draft document */}
        <article
          aria-label="Working draft"
          className="order-1 lg:order-2 bg-white border border-[#E4DED8] rounded-xl px-5 sm:px-10 py-8"
        >
          <header className="text-center border-b border-[#E4DED8] pb-6">
            <p className="text-label-upper text-[#554243]">Working draft · For tribunal deliberation only</p>
            <h2 className="font-serif-editorial text-2xl text-[#231612] mt-3">{activeCase.claimant}</h2>
            <p className="text-[11px] font-mono uppercase tracking-widest text-[#8C6A53] my-1">— versus —</p>
            <h2 className="font-serif-editorial text-2xl text-[#231612]">{activeCase.respondent}</h2>
            <p className="text-citation text-[#554243] mt-3">{activeCase.caseNumber}</p>
          </header>

          <div className="mt-6 space-y-8">
            {SECTIONS.map((s) => {
              const chips = draft.sources.filter((x) => x.section === s.id);
              const isHolding = s.id === 'VI' || s.id === 'VII';
              return (
                <section
                  key={s.id}
                  aria-labelledby={`sage-h-${s.id}`}
                  className={isHolding ? 'rounded-lg bg-[#FAF8F5] border border-[#E4DED8] p-4 -mx-1' : ''}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id={`sage-h-${s.id}`} className="font-serif-editorial text-lg font-semibold uppercase text-[#7E2833]">
                      {s.id}. {s.title}
                    </h3>
                    {isHolding && (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#7E2833] text-white shrink-0">
                        Tribunal to complete
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <AutoTextarea
                      id={`sage-t-${s.id}`}
                      value={draft.text[s.id]}
                      placeholder={s.hint}
                      onChange={(v) => setSection(s.id, v)}
                    />
                  </div>
                  {chips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label={`Sources cited in section ${s.id}`}>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C6A53]">Sources</span>
                      {chips.map((x) => (
                        <span
                          key={x.key}
                          className={`inline-flex items-center gap-1 text-[11px] font-mono pl-1.5 pr-0.5 py-0.5 rounded border ${VERIFY_STYLE[x.citation.verificationStatus]}`}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenCitation(x.citation)}
                            className="hover:underline cursor-pointer"
                            title={`Open source — ${x.citation.verificationStatus}`}
                          >
                            {x.citation.docId}
                            {x.citation.pageReference ? ` p.${x.citation.pageReference}` : ''}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove source ${x.citation.docId}`}
                            onClick={() => setDraft((d) => ({ ...d, sources: d.sources.filter((y) => y.key !== x.key) }))}
                            className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <footer className="mt-10 pt-4 border-t border-[#E4DED8] text-center text-citation text-[#887272]">
            Saved in this browser only · Edit freely · Every citation chip opens the source document
          </footer>
        </article>
      </div>
    </div>
  );
};
