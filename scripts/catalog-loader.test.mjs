import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import { loadCatalog, loadCatalogBootstrap, validateCatalogManifest, validateChunkPath, rebaseCatalogResources } from '../src/catalog-loader.mjs';
import {createCatalogBootstrap} from './catalog-bootstrap.mjs';
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

test('gzip-only published chunks retain every record with native, legacy and host-decoded responses', async () => {
  const rows = [[{...beer('fruit'), name:'芭乐 / 桃子', image:'/images/fruit.webp'}], [beer('second')]];
  const source = manifest(rows);
  source.chunks.forEach(chunk => {chunk.encoding = 'gzip';});
  for (const mode of ['native','legacy','host-decoded']) {
    const calls = [];
    const output = await loadCatalog({baseUrl:'/brew-atlas/',
      DecompressionStreamImpl:mode === 'legacy' ? null : globalThis.DecompressionStream,
      fetchImpl:async url => {
        calls.push(url);
        if (url.endsWith('catalog.manifest.json')) return response(source);
        const index = Number(url.match(/part-(\d+)\.json\.gz$/)?.[1]);
        assert(Number.isInteger(index), 'only compressed chunk URLs are requested');
        const text = JSON.stringify(rows[index]);
        return new Response(mode === 'host-decoded' ? text : gzipSync(text));
      }});
    assert.deepEqual(output, rebaseCatalogResources({...source.catalog,beers:rows.flat()},'/brew-atlas/'));
    assert.equal(calls.length,3);
  }
});

test('unsupported encodings and damaged compressed chunks cannot publish an incomplete catalog', async () => {
  const source = manifest([[beer('a')]]);
  source.chunks[0].encoding = 'zip';
  assert.throws(() => validateCatalogManifest(source), /编码/);
  source.chunks[0].encoding = 'gzip';
  await assert.rejects(loadCatalog({fetchImpl:async url => url.endsWith('manifest.json')
    ? response(source) : new Response(new Uint8Array([0x1f,0x8b,0,0]))}));
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

test('map-first loading makes exactly one small request; full records are fetched only when explicitly requested', async () => {
  const mapped = {...beer('mapped'),image:'/images/map.png',description:'Source product introduction.'};
  const hidden = beer('searchable-without-image');
  const source = {metadata:{}, breweries:[{...brewery,locationVerified:true,lat:10,lng:20}], beers:[mapped,hidden]};
  const bootstrap = createCatalogBootstrap(source), chunks = manifest([[mapped],[hidden]]);
  chunks.catalog = {metadata:source.metadata,breweries:source.breweries};
  const calls = [], fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith('catalog.bootstrap.json')) return response(bootstrap);
    if (url.endsWith('catalog.manifest.json')) return response(chunks);
    return response(url.endsWith('part-0.json') ? [mapped] : [hidden]);
  };
  const initial = await loadCatalogBootstrap({baseUrl:'/brew-atlas/',fetchImpl});
  assert.equal(initial.complete, false);
  assert.deepEqual(calls, ['/brew-atlas/data/catalog.bootstrap.json']);
  assert.deepEqual(initial.catalog.beers.map(beer => beer.id), ['mapped']);
  assert.equal(initial.catalog.beers[0].image, '/brew-atlas/images/map.png');
  assert.equal(initial.catalog.metadata.counts.beers, 2);
  const full = await loadCatalog({baseUrl:'/brew-atlas/',fetchImpl});
  assert.deepEqual(full.beers.map(beer => beer.id), ['mapped','searchable-without-image']);
  assert.equal(calls.length, 4);
});

test('only bootstrap 404 falls back; errors and malformed subsets never masquerade as a complete catalog', async () => {
  const old = {metadata:{},breweries:[brewery],beers:[beer('old')]}, calls = [];
  const result = await loadCatalogBootstrap({fetchImpl:async url => {
    calls.push(url); return response(url.endsWith('catalog.json') ? old : {}, url.endsWith('catalog.json') ? 200 : 404);
  }});
  assert.equal(result.complete, true); assert.deepEqual(result.catalog, old);
  assert.deepEqual(calls, ['/data/catalog.bootstrap.json','/data/catalog.manifest.json','/data/catalog.json']);
  for (const status of [403,429,503]) {
    let count = 0;
    await assert.rejects(loadCatalogBootstrap({fetchImpl:async () => {count++;return response({},status);}}), new RegExp(String(status)));
    assert.equal(count, 1);
  }
  const valid = createCatalogBootstrap({metadata:{},breweries:[brewery],beers:[]});
  for (const edit of [payload => {payload.schemaVersion=2;},payload => {payload.catalog.metadata.bootstrap.loadedBeers=1;},
    payload => {payload.catalog.metadata.counts.beers=3;},payload => {
      payload.catalog.beers=[beer('orphan')];payload.catalog.metadata.bootstrap.loadedBeers=1;
      payload.catalog.metadata.bootstrap.totalBeers=1;payload.catalog.metadata.counts.beers=1;
    }]) {
    const broken = structuredClone(valid); edit(broken); let count = 0;
    await assert.rejects(loadCatalogBootstrap({fetchImpl:async () => {count++;return response(broken);}}));
    assert.equal(count, 1);
  }
});

test('bootstrap respects cancellation before fetch, while fetching and after JSON parsing', async () => {
  const controller = new AbortController(); controller.abort(); let called = false;
  await assert.rejects(loadCatalogBootstrap({signal:controller.signal,fetchImpl:async()=>{called=true;}}),{name:'AbortError'});
  assert.equal(called,false);
  const inFlight = new AbortController(); let aborted = 0;
  const pending = loadCatalogBootstrap({signal:inFlight.signal,fetchImpl:async(url,{signal})=>{
    await pause(100,signal,()=>aborted++); return response({});
  }});
  inFlight.abort(); await assert.rejects(pending,{name:'AbortError'}); assert.equal(aborted,1);
  const parsing = new AbortController();
  await assert.rejects(loadCatalogBootstrap({signal:parsing.signal,fetchImpl:async()=>({ok:true,status:200,
    json:async()=>{parsing.abort();return {};}})}),{name:'AbortError'});
});
