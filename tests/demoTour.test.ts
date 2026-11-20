import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_ARIA_SAMPLE_QUESTION,
  DEMO_DATA_LABEL,
  DEMO_STAGE_COUNT,
  DEMO_TOUR_STAGES,
  getDemoStage,
} from '../src/data/demoTour.ts';
import { DEMO_CASE } from '../src/data/demoCase.ts';

test('guided demo has exactly five stages with the agreed objectives, in order', () => {
  assert.equal(DEMO_STAGE_COUNT, 5);
  assert.deepEqual(
    DEMO_TOUR_STAGES.map((s) => s.title),
    [
      'Understand the Dispute',
      'Examine the Case Record',
      'Investigate the Contradiction',
      'Ask ARIA',
      'Prepare a Draft',
    ]
  );
  assert.deepEqual(DEMO_TOUR_STAGES.map((s) => s.stage), [1, 2, 3, 4, 5]);
});

test('stages open the right screens; Findings Review and Hearing are not part of the tour', () => {
  assert.deepEqual(DEMO_TOUR_STAGES.map((s) => s.view), ['home', 'workspace', 'map', 'aria', 'sage']);
  assert.ok(!DEMO_TOUR_STAGES.some((s) => s.view === 'review' || s.view === 'hearing'));
  assert.equal(getDemoStage(2).workspaceSubTab, 'documents');
  assert.equal(getDemoStage(3).mapMode, 'compare');
});

test('every stage has one highlighted primary action and short instructional text', () => {
  for (const s of DEMO_TOUR_STAGES) {
    assert.ok(s.primaryLabel.length > 0, `stage ${s.stage} needs a primary action`);
    assert.ok(s.instruction.length <= 200, `stage ${s.stage} instruction too long`);
  }
});

test('ARIA stage pre-fills a case-specific question but never sends it', () => {
  assert.equal(getDemoStage(4).ariaSuggestedQuestion, DEMO_ARIA_SAMPLE_QUESTION);
  // The sample question is one of the demo case's own suggested questions area (about the contractor's delay).
  assert.match(DEMO_ARIA_SAMPLE_QUESTION, /contractor was already delayed/);
});

test('getDemoStage clamps out-of-range stages', () => {
  assert.equal(getDemoStage(0).stage, 1);
  assert.equal(getDemoStage(99).stage, 5);
});

test('demo data is labelled fictional and stays the isolated demo case', () => {
  assert.match(DEMO_DATA_LABEL, /fictional/i);
  assert.equal(DEMO_CASE.origin, 'demo');
  assert.match(DEMO_CASE.caseNumber, /Prepared Fictional Demo/);
});

test('tour banner and App are manual-only: no autoplay timers or play/pause remain', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const banner = readFileSync(new URL('../src/components/DemoTourController.tsx', import.meta.url), 'utf8');
  assert.ok(!/setTimeout|setInterval/.test(app), 'App must not auto-advance the tour');
  assert.ok(!/isDemoPlaying|autoPausedReason|demoRevealCount/.test(app));
  assert.ok(!/onPlay|onPause|Play|Pause/.test(banner));
  for (const label of ['Previous', 'Replay', 'Exit']) {
    assert.ok(banner.includes(label), `banner must offer ${label}`);
  }
});
