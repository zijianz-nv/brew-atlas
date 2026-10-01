import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, validateCatalogManifest, validateChunkPath, rebaseCatalogResources } from '../src/catalog-loader.mjs';
import { normalizeBasePath, withBasePath, withoutBasePath } from '../src/base-path.mjs';

const brewery = { id: 'brewery', name: 'Source producer', lat: null, lng: null };
const beer = id => ({ id, name: id, breweryId: brewery.id, abv: null, nested: { untouched: [1, null, 'text'] } });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const manifest = chunks => ({ format: 'brew-atlas-chunks', schemaVersion: 1,
  catalog: { metadata: { note: 'preserve', nested: { missing: null } }, breweries: [brewery], extra: ['retained'] },
  totalBeers: chunks.reduce((sum, rows) => sum + rows.length, 0),
  chunks: chunks.map((rows, index) => ({ path: `catalog/part-${index}.json`, count: rows.length })) });
const pause = (ms, signal, onAbort = () => {}) => new Promise((resolve, reject) => {
  let timer;
  const abort = () => { clearTimeout(timer); onAbort(); reject(signal.reason); };
  signal.addEventListener('abort', abort, { once: true });
  timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
});

test('root and repository base paths preserve external sources and slash-shaped beer names', () => {
  assert.equal(normalizeBasePath('brew-atlas'), '/brew-atlas/');
  assert.equal(normalizeBasePath('/'), '/');
  for (const value of ['https://other.test/x', '//cdn.test/x', '../x', '/%2e%2e/', '/x\\y/', '/x?y'])
    assert.throws(() => normalizeBasePath(value));
  assert.equal(withBasePath('/images/a.png', '/'), '/images/a.png');
  assert.equal(withBasePath('/images/a.png', '/brew-atlas/'), '/brew-atlas/images/a.png');
  assert.equal(withBasePath('/brew-atlas/images/a.png', '/brew-atlas/'), '/brew-atlas/images/a.png');
  assert.equal(withoutBasePath('/brew-atlas/images/a.png', '/brew-atlas/'), '/images/a.png');
  const input = { metadata: { sourceNoticeUrl: '/data-sources/NOTICE.md' }, breweries: [brewery], beers: [{ ...beer('a'),
    name: '/Juice/', description: '// Literal source prose', image: '/images/a.png', imageOriginal: '/images/a.jpg',
    imageThumbnail: '/images/a.webp', imageSource: '/images/a.jpg', imageDownloadUrl: 'https://cdn.example/a.jpg',
    imageLicenseUrl: '/data-sources/LICENSE.txt', sourceUrls: ['https://source.example/a', '//source.example/b', '/data-sources/NOTICE.md'],
    sourceEvidence: [{ url: '/data-sources/evidence.json' }] }] };
  assert.equal(rebaseCatalogResources(input, '/'), input);
  const output = rebaseCatalogResources(input, '/brew-atlas/');
  assert.equal(output.beers[0].image, '/brew-atlas/images/a.png');
  assert.equal(output.beers[0].imageOriginal, '/brew-atlas/images/a.jpg');
  assert.equal(output.beers[0].imageThumbnail, '/brew-atlas/images/a.webp');
  assert.equal(output.beers[0].imageLicenseUrl, '/brew-atlas/data-sources/LICENSE.txt');
  assert.equal(output.metadata.sourceNoticeUrl, '/brew-atlas/data-sources/NOTICE.md');
  assert.equal(output.beers[0].sourceEvidence[0].url, '/brew-atlas/data-sources/evidence.json');
  assert.equal(output.beers[0].imageDownloadUrl, input.beers[0].imageDownloadUrl);
  assert.deepEqual(output.beers[0].sourceUrls.slice(0, 2), input.beers[0].sourceUrls.slice(0, 2));
  assert.equal(output.beers[0].name, '/Juice/'); assert.equal(output.beers[0].description, '// Literal source prose');
  assert.equal(input.beers[0].image, '/images/a.png', 'rebasing never mutates source data');
  assert.deepEqual(rebaseCatalogResources(output, '/brew-atlas/'), output);
});

test('out-of-order chunks assemble every field in manifest order with at most four concurrent requests', async () => {
  const rows = Array.from({ length: 9 }, (_, index) => [beer(`beer-${index}-a`), beer(`beer-${index}-b`)]);
  const source = manifest(rows), calls = []; let active = 0, peak = 0;
  const output = await loadCatalog({ baseUrl: '/brew-atlas/', fetchImpl: async (url, { signal }) => {
    calls.push(url);
    if (url.endsWith('catalog.manifest.json')) return response(source);
    const index = Number(url.match(/part-(\d+)\.json$/)[1]);
    active++; peak = Math.max(peak, active);
    try { await pause((9 - index) * 2, signal); return response(rows[index]); } finally { active--; }
  } });
  assert.equal(peak, 4); assert.equal(active, 0); assert.equal(calls.length, 10);
  assert(calls.every(url => url.startsWith('/brew-atlas/data/')));
  assert.deepEqual(output, { ...source.catalog, beers: rows.flat() });
});

test('only an actual manifest 404 falls back to a complete legacy catalog', async () => {
  const calls = [], old = { metadata: {}, breweries: [brewery], beers: [{ ...beer('old'), image: '/images/old.png' }] };
  const output = await loadCatalog({ baseUrl: '/brew-atlas/', fetchImpl: async url => {
    calls.push(url); return url.endsWith('.manifest.json') ? response({}, 404) : response(old);
  } });
  assert.deepEqual(calls, ['/brew-atlas/data/catalog.manifest.json', '/brew-atlas/data/catalog.json']);
  assert.equal(output.beers[0].image, '/brew-atlas/images/old.png');
  for (const status of [403, 429, 500]) {
    let count = 0;
    await assert.rejects(loadCatalog({ fetchImpl: async () => { count++; return response({}, status); } }), new RegExp(String(status)));
    assert.equal(count, 1);
  }
  let count = 0;
  await assert.rejects(loadCatalog({ fetchImpl: async () => { count++; return new Response('invalid JSON'); } }));
  assert.equal(count, 1);
});

test('schema, total count and safe relative paths are checked before any chunk request', async () => {
  for (const path of ['/absolute.json', '//evil.test/x.json', 'https://evil.test/x.json', '../x.json',
    'catalog/../x.json', 'catalog/%2e%2e/x.json', 'catalog/a.json?extra', 'catalog/a.json#fragment', 'catalog\\a.json', 'catalog//a.json']) {
    assert.throws(() => validateChunkPath(path));
  }
  assert.equal(validateChunkPath('catalog/part-000.json'), 'catalog/part-000.json');
  const original = manifest([[beer('a')]]);
  for (const broken of [{ ...original, schemaVersion: 2 }, { ...original, totalBeers: 2 },
    { ...original, chunks: [{ path: '../x.json', count: 1 }] },
    { ...original, totalBeers: 2, chunks: [...original.chunks, ...original.chunks] }]) {
    assert.throws(() => validateCatalogManifest(broken)); let calls = 0;
    await assert.rejects(loadCatalog({ fetchImpl: async () => { calls++; return response(broken); } }));
    assert.equal(calls, 1);
  }
});

test('missing, malformed or duplicate chunk records reject instead of returning a truncated catalog', async () => {
  for (const payload of [[], {}, [null], [{ name: 'missing ID' }]]) {
    await assert.rejects(loadCatalog({ fetchImpl: async url => response(url.endsWith('manifest.json')
      ? manifest([[beer('a')]]) : payload) }));
  }
  await assert.rejects(loadCatalog({ fetchImpl: async url => response(url.endsWith('manifest.json')
    ? manifest([[beer('same')], [beer('same')]]) : [beer('same')]) }), /重复/);
});

test('a failing chunk aborts other pending requests and never returns partial success', async () => {
  const source = manifest(Array.from({ length: 9 }, (_, i) => [beer(String(i))])); let aborted = 0, started = 0;
  await assert.rejects(loadCatalog({ fetchImpl: async (url, { signal }) => {
    if (url.endsWith('manifest.json')) return response(source);
    started++;
    if (url.endsWith('part-0.json')) { await pause(1, signal); return response({}, 503); }
    await pause(100, signal, () => aborted++); return response([beer(url)]);
  } }), /503/);
  assert.equal(started, 4); assert.equal(aborted, 3);
});

test('caller abort cancels active chunks, and pre-aborted signals make no request', async () => {
  const controller = new AbortController(); let started = 0, aborted = 0;
  const promise = loadCatalog({ signal: controller.signal, fetchImpl: async (url, { signal }) => {
    if (url.endsWith('manifest.json')) return response(manifest(Array.from({ length: 7 }, (_, i) => [beer(String(i))])));
    started++; await pause(200, signal, () => aborted++); return response([beer(url)]);
  } });
  const timer = setTimeout(() => controller.abort(), 10);
  await assert.rejects(promise, { name: 'AbortError' }); clearTimeout(timer);
  assert.equal(started, 4); assert.equal(aborted, 4);
  let called = false;
  await assert.rejects(loadCatalog({ signal: controller.signal, fetchImpl: async () => { called = true; } }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('an empty, valid catalog completes without issuing phantom chunk requests', async () => {
  let calls = 0;
  const output = await loadCatalog({ fetchImpl: async () => { calls++; return response(manifest([])); } });
  assert.equal(calls, 1); assert.deepEqual(output.beers, []);
});
