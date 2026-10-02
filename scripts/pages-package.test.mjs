import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync, gzipSync} from 'node:zlib';
import {writeCatalogChunks} from './catalog-chunks.mjs';
import {packageGzipCatalogChunks, verifyPagesPackage} from './pages-package.mjs';

const catalog = {metadata:{id:'local-all-v1'}, breweries:[{id:'brewery', lat:null}],
  beers:Array.from({length:4}, (_, i) => ({id:`beer-${i}`, breweryId:'brewery',
    description:'Original source text', sourceEvidence:{url:'https://example.test/product', unknown:null},
    image:'/images/card.webp', imageOriginal:'/images/original.png', abv:0}))};

test('Pages gzip packaging preserves every catalog field and referenced image path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brew-pages-'));
  try {
    await writeCatalogChunks(catalog, dir, {gzip:true, maxFileBytes:500, maxHeaderBytes:2000});
    const result = await packageGzipCatalogChunks(dir);
    const manifestBytes = await readFile(join(dir, 'catalog.manifest.json'));
    assert.deepEqual(gunzipSync(await readFile(join(dir, 'catalog.manifest.json.gz'))), manifestBytes);
    const manifest = JSON.parse(manifestBytes), beers = [];
    for (const chunk of manifest.chunks) {
      assert.equal(chunk.encoding, 'gzip');
      assert.match(chunk.path, /\.json$/);
      await assert.rejects(readFile(join(dir, chunk.path)), {code:'ENOENT'});
      const rows = JSON.parse(gunzipSync(await readFile(join(dir, `${chunk.path}.gz`))));
      assert.equal(rows.length, chunk.count);
      beers.push(...rows);
    }
    assert.deepEqual({...manifest.catalog, beers}, catalog);
    assert.equal(result.records, catalog.beers.length);
    assert.equal(result.chunks, 2);
    assert(result.removedBytes > result.gzipBytes);
  } finally {await rm(dir, {recursive:true, force:true});}
});

test('a corrupt or mismatching compressed chunk leaves all raw chunks and manifest intact', async () => {
  for (const payload of [Buffer.from('broken gzip'), gzipSync('[{"id":"replaced"}]')]) {
    const dir = await mkdtemp(join(tmpdir(), 'brew-pages-corrupt-'));
    try {
      const source = await writeCatalogChunks(catalog, dir, {gzip:true, maxFileBytes:500, maxHeaderBytes:2000});
      const before = await readFile(join(dir, 'catalog.manifest.json'));
      await writeFile(join(dir, `${source.parts.at(-1).path}.gz`), payload);
      await assert.rejects(packageGzipCatalogChunks(dir));
      assert.deepEqual(await readFile(join(dir, 'catalog.manifest.json')), before);
      for (const part of source.parts) assert.equal((await readFile(join(dir, part.path))).length, part.bytes);
    } finally {await rm(dir, {recursive:true, force:true});}
  }
});

test('Pages size check counts logical bytes across subdirectories and rejects an oversized site', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brew-pages-size-'));
  try {
    await mkdir(join(dir, 'images'));
    await writeFile(join(dir, 'index.html'), '1234');
    await writeFile(join(dir, 'images', 'photo.webp'), '12345');
    assert.deepEqual(await verifyPagesPackage(dir, {maxBytes:9}), {bytes:9, files:2, maxBytes:9});
    await assert.rejects(verifyPagesPackage(dir, {maxBytes:8}), /9 bytes, exceeding 8/);
  } finally {await rm(dir, {recursive:true, force:true});}
});
