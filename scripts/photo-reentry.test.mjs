import test from 'node:test';
import assert from 'node:assert/strict';
import { photoReentryIds } from '../src/photo-reentry.mjs';

test('a visible brewery representative does not prevent its hidden siblings from refilling safe space', () => {
  const photos = [
    { id: 'visible', sourceId: 'same-brewery', visible: true, hiddenSince: null },
    { id: 'hidden-long', sourceId: 'same-brewery', visible: false, hiddenSince: 100 },
    { id: 'hidden-recent', sourceId: 'same-brewery', visible: false, hiddenSince: 750 },
  ];
  assert.deepEqual([...photoReentryIds(photos, 1000)], ['hidden-long']);
  assert.deepEqual([...photoReentryIds(photos, 1450)], ['hidden-long', 'hidden-recent']);
});

test('reentry cannot relocate a visible photo or one without a complete hidden interval', () => {
  assert.deepEqual([...photoReentryIds([
    { id: 'visible-old-timestamp', visible: true, hiddenSince: 0 },
    { id: 'unknown', visible: false, hiddenSince: null },
    { id: 'future', visible: false, hiddenSince: 1100 },
    { id: 'boundary', visible: false, hiddenSince: 300 },
  ], 1000)], ['boundary']);
});
