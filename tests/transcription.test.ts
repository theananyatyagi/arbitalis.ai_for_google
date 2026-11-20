import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_SPEECH_TEXT,
  normalizeSpeaker,
  normalizeTimestamp,
  normalizeTranscriptSegments,
  parsePlainTextTranscript,
} from '../server/gemini.ts';

test('plain-text transcript with no labels or times never gets invented timestamps or speakers', () => {
  const segs = parsePlainTextTranscript(
    'The Employer wrote on twelve January.\nWe did not receive the register.\nThat is not correct.'
  );
  assert.equal(segs.length, 3);
  for (const s of segs) {
    assert.equal(s.timestamp, null, 'timestamp must stay null, never index-based');
    assert.equal(s.speaker, null, 'speaker must stay null, never "Speaker N"');
  }
  assert.equal(segs[0].text, 'The Employer wrote on twelve January.');
});

test('genuine timestamps and speaker labels returned in the text are preserved', () => {
  const segs = parsePlainTextTranscript(
    '[00:12] Claimant Counsel: Access was blocked until 1 March.\n01:04 Respondent Counsel: The crane failed on 18 January.'
  );
  assert.deepEqual(segs[0], {
    timestamp: '00:12',
    speaker: 'Claimant Counsel',
    text: 'Access was blocked until 1 March.',
  });
  assert.equal(segs[1].timestamp, '01:04');
  assert.equal(segs[1].speaker, 'Respondent Counsel');
});

test('a labelled line does not leak its speaker or time onto unlabelled neighbours', () => {
  const segs = parsePlainTextTranscript('[00:30] Witness: I was on site.\nThen the crane stopped.');
  assert.equal(segs[0].speaker, 'Witness');
  assert.equal(segs[1].speaker, null);
  assert.equal(segs[1].timestamp, null);
});

test('empty or silent output yields one null/null no-speech segment, not a fake "00:00" / "Transcript"', () => {
  for (const segs of [parsePlainTextTranscript(''), normalizeTranscriptSegments([])]) {
    assert.equal(segs.length, 1);
    assert.deepEqual(segs[0], { timestamp: null, speaker: null, text: NO_SPEECH_TEXT });
  }
  // Legacy sentinel returned by a model is also normalised to null/null.
  const legacy = normalizeTranscriptSegments([
    { timestamp: '00:00', speaker: 'Transcript', text: NO_SPEECH_TEXT },
  ]);
  assert.deepEqual(legacy[0], { timestamp: null, speaker: null, text: NO_SPEECH_TEXT });
});

test('model JSON: unknown / malformed timestamps and speakers become null, genuine ones are kept', () => {
  const segs = normalizeTranscriptSegments([
    { timestamp: '00:42', speaker: 'Presiding Arbitrator', text: 'Please continue.' },
    { timestamp: '', speaker: 'Unknown', text: 'Inaudible remark.' },
    { timestamp: 'around a minute in', speaker: null, text: 'Second remark.' },
    { timestamp: '[01:10]', speaker: 'N/A', text: 'Third remark.' },
  ]);
  assert.deepEqual(segs[0], { timestamp: '00:42', speaker: 'Presiding Arbitrator', text: 'Please continue.' });
  assert.deepEqual(segs[1], { timestamp: null, speaker: null, text: 'Inaudible remark.' });
  assert.deepEqual(segs[2], { timestamp: null, speaker: null, text: 'Second remark.' });
  assert.deepEqual(segs[3], { timestamp: '01:10', speaker: null, text: 'Third remark.' });
});

test('normalizers reject non-string input', () => {
  assert.equal(normalizeTimestamp(undefined), null);
  assert.equal(normalizeTimestamp(12), null);
  assert.equal(normalizeSpeaker(undefined), null);
  assert.equal(normalizeSpeaker({}), null);
});
