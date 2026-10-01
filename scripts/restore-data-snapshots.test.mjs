import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile, stat} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareDataSnapshots, restoreDataSnapshots, SNAPSHOT_PATHS, SNAPSHOT_MANIFEST} from './restore-data-snapshots.mjs';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'brew-restore-'));
  for (const [index, path] of SNAPSHOT_PATHS.entries()) {
    await mkdir(dirname(join(root, path)), {recursive:true});
    await writeFile(join(root, path), JSON.stringify({metadata:{source:index}, breweries:[{id:'b'}], beers:[{id:`test-${index}`, breweryId:'b', abv:0, extra:null}]}));
  }
  return root;
}

test('gzip preparation is deterministic and restoration only creates missing original JSON', async () => {
  const root = await setup();
  try {
    const first = await prepareDataSnapshots(root), gzip = await readFile(join(root, first.files[0].gzipPath));
    const second = await prepareDataSnapshots(root);
    assert.deepEqual(second, first);
    assert.deepEqual(await readFile(join(root, first.files[0].gzipPath)), gzip);
    assert.equal(gzip.readUInt32LE(4), 0, 'gzip mtime must not vary by preparation time');
    const original = await readFile(join(root, SNAPSHOT_PATHS[0]));
    const retainedTime = (await stat(join(root, SNAPSHOT_PATHS[1]))).mtimeMs;
    await rm(join(root, SNAPSHOT_PATHS[0]));
    const results = await restoreDataSnapshots(root);
    assert.deepEqual(results.map(row => row.restored), [true, false]);
    assert.deepEqual(await readFile(join(root, SNAPSHOT_PATHS[0])), original);
    assert.equal((await stat(join(root, SNAPSHOT_PATHS[1]))).mtimeMs, retainedTime);
  } finally { await rm(root, {recursive:true, force:true}); }
});

test('corrupt compressed content or inconsistent manifest counts cannot create a restored JSON', async () => {
  const root = await setup();
  try {
    const manifest = await prepareDataSnapshots(root), file = manifest.files[0], gzip = await readFile(join(root, file.gzipPath));
    await rm(join(root, file.path));
    await writeFile(join(root, file.gzipPath), Buffer.concat([gzip, Buffer.from('corrupt')]));
    await assert.rejects(restoreDataSnapshots(root), /Compressed snapshot checksum mismatch/);
    await assert.rejects(stat(join(root, file.path)), {code:'ENOENT'});
    await writeFile(join(root, file.gzipPath), gzip);
    manifest.files[0].counts.beers++;
    await writeFile(join(root, SNAPSHOT_MANIFEST), JSON.stringify(manifest));
    await assert.rejects(restoreDataSnapshots(root), /record-count mismatch/);
    await assert.rejects(stat(join(root, file.path)), {code:'ENOENT'});
  } finally { await rm(root, {recursive:true, force:true}); }
});

test('an existing modified JSON is detected and never overwritten', async () => {
  const root = await setup();
  try {
    await prepareDataSnapshots(root);
    const replacement = '{"local_edit":true}';
    await writeFile(join(root, SNAPSHOT_PATHS[0]), replacement);
    await assert.rejects(restoreDataSnapshots(root), /existing JSON is never overwritten/);
    assert.equal(await readFile(join(root, SNAPSHOT_PATHS[0]), 'utf8'), replacement);
  } finally { await rm(root, {recursive:true, force:true}); }
});
