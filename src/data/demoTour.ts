import type { AppView } from '../types/arbitration';

/**
 * Guided demo: five manual stages, one objective each.
 * Every stage runs on the prepared FICTIONAL demo case (ABC Contractors v. XYZ Infrastructure).
 * Nothing here calls Gemini, plays audio, or advances automatically.
 */

export type DemoMapMode = 'graph' | 'compare' | 'list';

export interface DemoTourStage {
  stage: number;
  /** Short stage name shown in the progress bar. */
  title: string;
  /** One-line objective (serif headline in the banner). */
  headline: string;
  /** One or two short sentences. Never repeats facts from another stage. */
  instruction: string;
  /** Application view this stage opens. 'review' and 'hearing' are intentionally never used. */
  view: AppView;
  /** Case Workspace sub-tab, when the stage opens the workspace. */
  workspaceSubTab?: 'documents' | 'intelligence';
  /** Dispute Map presentation, when the stage opens the map. */
  mapMode?: DemoMapMode;
  /** Pre-fills (never sends) a suggested ARIA question. */
  ariaSuggestedQuestion?: string;
  /** Label of the single highlighted primary action. */
  primaryLabel: string;
}

export const DEMO_DATA_LABEL = 'Prepared fictional demonstration data';

export const DEMO_ARIA_SAMPLE_QUESTION =
  'What evidence suggests that the contractor was already delayed?';

export const DEMO_TOUR_STAGES: DemoTourStage[] = [
  {
    stage: 1,
    title: 'Understand the Dispute',
    headline: 'Who caused the 45-day delay?',
    instruction:
      'ABC Contractors says XYZ Infrastructure delayed site access. XYZ says ABC was already behind schedule. The documents must decide.',
    view: 'home',
    primaryLabel: 'Examine the case record',
  },
  {
    stage: 2,
    title: 'Examine the Case Record',
    headline: 'Prepared documents, one flagged as missing',
    instruction:
      'Open any document to read its pages. Then see what the analysis extracts: clauses, a timeline, and evidentiary gaps.',
    view: 'workspace',
    workspaceSubTab: 'documents',
    primaryLabel: 'Show extracted intelligence',
  },
  {
    stage: 3,
    title: 'Investigate the Contradiction',
    headline: 'Late site access versus concurrent crane failure',
    instruction:
      'Compare the two positions side by side. Open any citation to see its source passage, and note the dashed card for the missing record.',
    view: 'map',
    mapMode: 'compare',
    primaryLabel: 'Next: Ask ARIA',
  },
  {
    stage: 4,
    title: 'Ask ARIA',
    headline: 'Question the record by voice or text',
    instruction:
      'A case-specific question is pre-filled. Nothing is sent and no audio plays until you choose to.',
    view: 'aria',
    ariaSuggestedQuestion: DEMO_ARIA_SAMPLE_QUESTION,
    primaryLabel: 'Next: Prepare a draft',
  },
  {
    stage: 5,
    title: 'Prepare a Draft',
    headline: 'Reviewed findings, linked to their sources',
    instruction:
      'Insert an accepted finding into a section; its source chip opens the exhibit. The tribunal writes and edits everything.',
    view: 'sage',
    primaryLabel: 'Finish demo',
  },
];

export const DEMO_STAGE_COUNT = DEMO_TOUR_STAGES.length;

export function getDemoStage(stage: number): DemoTourStage {
  const clamped = Math.min(Math.max(Math.round(stage), 1), DEMO_STAGE_COUNT);
  return DEMO_TOUR_STAGES[clamped - 1];
}
