import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CASE } from '../src/data/demoCase.ts';
import { classifyGeminiError } from '../server/gemini.ts';
import { parseApiResponse } from '../src/utils/apiClient.ts';

test('Demo case preserves ABC Contractors v. XYZ Infrastructure structure and 8 semantic categories', () => {
  assert.equal(DEMO_CASE.origin, 'demo');
  assert.match(DEMO_CASE.title, /ABC Contractors v\. XYZ Infrastructure/);
  assert.equal(DEMO_CASE.issues.length, 2);

  const categories = new Set(DEMO_CASE.nodes.map((n) => n.category));
  for (const required of [
    'central_issue',
    'claimant_position',
    'respondent_position',
    'contractual_obligation',
    'supporting_evidence',
    'contradictory_evidence',
    'timeline_event',
    'missing_evidence',
    'human_question',
  ]) {
    assert.ok(categories.has(required as never), `Missing category: ${required}`);
  }

  const missingDoc = DEMO_CASE.documents.find((d) => d.id === 'EX-GAP');
  assert.ok(missingDoc?.isMissingPlaceholder, 'Missing Baseline Programme must be explicitly flagged');
});

test('Demo edges reference valid node IDs and explicit relationships', () => {
  const nodeIds = new Set(DEMO_CASE.nodes.map((n) => n.id));
  for (const edge of DEMO_CASE.edges) {
    assert.ok(nodeIds.has(edge.source), `Missing edge source ${edge.source}`);
    assert.ok(nodeIds.has(edge.target), `Missing edge target ${edge.target}`);
  }
});

test('Gemini error classifier separates quota, rate limit, capacity, auth, and invalid document failures', () => {
  const quota = classifyGeminiError(new Error('RESOURCE_EXHAUSTED: quota exceeded'));
  assert.equal(quota.category, 'QUOTA_EXCEEDED');
  assert.equal(quota.retryable, false);

  const rate = classifyGeminiError(Object.assign(new Error('Too many requests'), { status: 429 }));
  assert.equal(rate.category, 'RATE_LIMIT');
  assert.equal(rate.retryable, true);

  const capacity = classifyGeminiError(Object.assign(new Error('Service unavailable'), { status: 503 }));
  assert.equal(capacity.category, 'CAPACITY_ERROR');
  assert.equal(capacity.retryable, true);

  const auth = classifyGeminiError(Object.assign(new Error('API_KEY_INVALID'), { status: 403 }));
  assert.equal(auth.category, 'AUTH_ERROR');
  assert.equal(auth.retryable, false);

  const badDoc = classifyGeminiError(Object.assign(new Error('INVALID_ARGUMENT: unable to process PDF'), { status: 400 }));
  assert.equal(badDoc.category, 'INVALID_DOCUMENT');
  assert.equal(badDoc.retryable, false);

  const timeoutErr = classifyGeminiError(new Error('gemini-3.1-flash-lite timed out after 18000ms'));
  assert.equal(timeoutErr.category, 'CAPACITY_ERROR');
  assert.equal(timeoutErr.statusCode, 504);
  assert.equal(timeoutErr.retryable, true);
});

test('parseApiResponse detects Starting Server HTML interstitials without exposing raw HTML', async () => {
  const htmlResponse = new Response(
    '<!doctype html><html lang="en"><head><title>Starting Server...</title></head><body>Starting</body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
  const parsed = await parseApiResponse(htmlResponse);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.isWarmingUp, true);
  assert.equal(parsed.error?.retryable, true);
  assert.doesNotMatch(parsed.error?.message || '', /<!doctype/i);
});
