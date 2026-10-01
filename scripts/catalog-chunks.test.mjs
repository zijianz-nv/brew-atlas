import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {encodeBeerChunks, createCatalogChunkManifest, writeCatalogChunks} from './catalog-chunks.mjs';

const fixture = () => ({metadata:{id:'test', notes:'Unicode retained 🍺'}, breweries:[{id:'one', lat:null, active:false}],
  futureField:{retained:true}, beers:Array.from({length:7}, (_, i) => ({id:`beer-${i}`, breweryId:'one', abv:0,
    absent:null, description:'啤酒🍺'.repeat(24), extra:{nested:[false, 0, null, {quoted:'"\\\n'}]}}))});

test('UTF-8 byte splitting preserves order, all fields and exact reconstruction', () => {
  const catalog = fixture(), original = structuredClone(catalog);
  const parts = [...encodeBeerChunks(catalog.beers, {maxFileBytes:750})];
  assert(parts.length > 1);
  for (const [index, part] of parts.entries()) {
    assert.equal(part.path, `catalog/part-${String(index).padStart(3, '0')}.json`);
    assert.equal(part.bytes, Buffer.byteLength(part.text));
    assert(part.bytes <= 750);
    assert.equal(part.count, JSON.parse(part.text).length);
  }
  const {manifest, text} = createCatalogChunkManifest(catalog, parts, {maxFileBytes:750});
  assert(Buffer.byteLength(text) <= 750);
  assert.deepEqual({...manifest.catalog, beers:parts.flatMap(part => JSON.parse(part.text))}, catalog);
  assert.deepEqual(catalog, original);
});

test('array brackets and commas count toward the exact boundary', () => {
  const beers = [{id:'a', name:'中文'}, {id:'b', name:'🍺'}];
  const exactly = Buffer.byteLength(JSON.stringify(beers));
  assert.equal([...encodeBeerChunks(beers, {maxFileBytes:exactly})].length, 1);
  assert.equal([...encodeBeerChunks(beers, {maxFileBytes:exactly - 1})].length, 2);
  assert.throws(() => [...encodeBeerChunks([beers[0]], {maxFileBytes:Buffer.byteLength(JSON.stringify([beers[0]])) - 1})], /by itself/);
});

test('oversized brewery header and mismatched record counts fail explicitly', () => {
  const catalog = fixture();
  assert.throws(() => createCatalogChunkManifest(catalog, [], {maxFileBytes:1000}), /counts/);
  const parts = [...encodeBeerChunks(catalog.beers, {maxFileBytes:750})];
  catalog.breweries[0].longHeader = 'x'.repeat(1000);
  assert.throws(() => createCatalogChunkManifest(catalog, parts, {maxFileBytes:750}), /manifest\/header/);
  assert.throws(() => [...encodeBeerChunks([null])], /Invalid beer/);
  assert.throws(() => [...encodeBeerChunks([], {maxFileBytes:NaN})], /maxFileBytes/);
});

test('empty beer catalog is representable without a fake or empty chunk', () => {
  const catalog = {...fixture(), beers:[]};
  const parts = [...encodeBeerChunks(catalog.beers)];
  assert.deepEqual(parts, []);
  assert.equal(createCatalogChunkManifest(catalog, parts).manifest.totalBeers, 0);
});

test('disk packaging removes monolithic/stale files, reconstructs equally, and failed packaging leaves prior manifest intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brew-chunks-'));
  try {
    await writeFile(join(directory, 'catalog.json'), 'old monolith');
    await writeFile(join(directory, 'catalog.json.gz'), 'old gzip');
    const catalog = fixture(), result = await writeCatalogChunks(catalog, directory, {maxFileBytes:750});
    const manifest = JSON.parse(await readFile(join(directory, 'catalog.manifest.json'), 'utf8'));
    const rows = [];
    for (const part of manifest.chunks) rows.push(...JSON.parse(await readFile(join(directory, part.path), 'utf8')));
    assert.deepEqual({...manifest.catalog, beers:rows}, catalog);
    assert.deepEqual((await readdir(directory)).sort(), ['catalog', 'catalog.manifest.json']);
    const before = await readFile(join(directory, 'catalog.manifest.json'), 'utf8');
    const unsafe = {...catalog, beers:[...catalog.beers, {id:'oversized', description:'x'.repeat(1000)}]};
    await assert.rejects(writeCatalogChunks(unsafe, directory, {maxFileBytes:750}), /oversized.*by itself/);
    assert.equal(await readFile(join(directory, 'catalog.manifest.json'), 'utf8'), before);
    assert.equal((await readdir(join(directory, 'catalog'))).length, result.parts.length);
    await writeCatalogChunks({...catalog, beers:catalog.beers.slice(0, 1)}, directory, {maxFileBytes:750});
    assert.deepEqual(await readdir(join(directory, 'catalog')), ['part-000.json']);
  } finally { await rm(directory, {recursive:true, force:true}); }
});

test('optional gzip sidecars decode exactly and are removed when disabled on a later build', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brew-chunks-gzip-'));
  try {
    const catalog = fixture(), result = await writeCatalogChunks(catalog, directory, {maxFileBytes:750, gzip:true});
    for (const path of ['catalog.manifest.json', ...result.parts.map(part => part.path)]) {
      const compressed = await readFile(join(directory, `${path}.gz`));
      assert(compressed.length <= 750);
      assert.deepEqual(gunzipSync(compressed), await readFile(join(directory, path)));
    }
    await writeCatalogChunks(catalog, directory, {maxFileBytes:750});
    await assert.rejects(readFile(join(directory, 'catalog.manifest.json.gz')), {code:'ENOENT'});
    assert((await readdir(join(directory, 'catalog'))).every(name => !name.endsWith('.gz')));
  } finally { await rm(directory, {recursive:true, force:true}); }
});
