import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { contentImageStyle } from '../src/photo-content-layout.mjs';

const epsilon = 1e-10;
const close = (a, b) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const percent = value => parseFloat(value) / 100;

function verifyFit(metadata, aspect) {
  const style = contentImageStyle({ imageContentBounds: metadata }, aspect);
  assert.ok(style);
  const renderedWidth = percent(style.width) * aspect;
  const renderedHeight = percent(style.height);
  const left = percent(style.left) * aspect;
  const top = percent(style.top);
  const scaleX = renderedWidth / metadata.width;
  const scaleY = renderedHeight / metadata.height;
  close(scaleX, scaleY);
  const { x, y, width, height } = metadata.bounds;
  const content = {
    left: left + x * scaleX,
    right: left + (x + width) * scaleX,
    top: top + y * scaleY,
    bottom: top + (y + height) * scaleY,
  };
  assert.ok(content.left >= -epsilon && content.right <= aspect + epsilon);
  assert.ok(content.top >= -epsilon && content.bottom <= 1 + epsilon);
  close(content.left, aspect - content.right);
  close(content.top, 1 - content.bottom);
  assert.ok(Math.abs(content.right - content.left - aspect) < epsilon || Math.abs(content.bottom - content.top - 1) < epsilon);
  assert.equal(style.position, 'absolute');
  assert.equal(style.maxWidth, 'none');
  assert.equal(style.maxHeight, 'none');
  return { style, content };
}

test('transparent margins fit content, not the square image canvas', () => {
  const metadata = { width: 600, height: 600, bounds: { x: 233, y: 62, width: 133, height: 476 } };
  const { content, style } = verifyFit(metadata, 0.52);
  close(content.bottom - content.top, 1);
  close(percent(style.height), 600 / 476);
  assert.ok(percent(style.left) < 0);
  assert.deepEqual(metadata.bounds, { x: 233, y: 62, width: 133, height: 476 });
});

test('wide and narrow frames preserve all content and pixel aspect ratio', () => {
  for (const aspect of [0.2, 0.52, 1, 2, 5]) {
    for (const metadata of [
      { width: 400, height: 200, bounds: { x: 0, y: 0, width: 400, height: 200 } },
      { width: 1000, height: 1000, bounds: { x: 100, y: 390, width: 800, height: 80 } },
      { width: 1000, height: 1000, bounds: { x: 990, y: 1, width: 1, height: 998 } },
    ]) verifyFit(metadata, aspect);
  }
});

test('missing, malformed, empty or out-of-image bounds use the normal image fallback', () => {
  const valid = { width: 600, height: 600, bounds: { x: 10, y: 20, width: 100, height: 400 } };
  assert.equal(contentImageStyle(null, 1), null);
  assert.equal(contentImageStyle({}, 1), null);
  for (const aspect of [undefined, null, 0, -1, NaN, Infinity, '1']) {
    assert.equal(contentImageStyle({ imageContentBounds: valid }, aspect), null);
  }
  for (const bounds of [null, {}, { x: -1, y: 0, width: 2, height: 2 }, { x: 0, y: 0, width: 601, height: 20 }, { x: 0, y: 590, width: 10, height: 20 }, { x: 0, y: 0, width: 0, height: 20 }, { x: NaN, y: 0, width: 10, height: 20 }]) {
    assert.equal(contentImageStyle({ imageContentBounds: { ...valid, bounds } }, 1), null);
  }
});

test('six official asset bounds match raw bytes and fit mobile/map/card frames', () => {
  const manifest = JSON.parse(readFileSync(new URL('../research/curated-catalog/image-display-bounds.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(manifest.images).length, 6);
  for (const [path, metadata] of Object.entries(manifest.images)) {
    assert.match(path, /^\/images\/curated\/[^/]+\.(png|avif)$/);
    const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.originalSha256);
    for (const aspect of [0.52, 1, 1.5]) verifyFit(metadata, aspect);
  }
});
