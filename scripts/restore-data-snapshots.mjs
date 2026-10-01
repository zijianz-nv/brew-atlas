#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SNAPSHOT_PATHS = Object.freeze([
  'research/local-catalog/imported-snapshots.json',
  'research/local-catalog/imported-additional.json',
]);
export const SNAPSHOT_MANIFEST = 'research/local-catalog/snapshots.manifest.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const maxSnapshotBytes = 512 * 1024 * 1024;

export function snapshotCounts(bytes, label = 'snapshot') {
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); }
  catch (error) { throw new Error(`${label}: invalid JSON (${error.message})`); }
  if (!data?.metadata || !Array.isArray(data.beers) || !Array.isArray(data.breweries)
      || !data.beers.length || !data.breweries.length
      || data.beers.some(beer => !beer || typeof beer.id !== 'string' || !beer.id)
      || data.breweries.some(brewery => !brewery || typeof brewery.id !== 'string' || !brewery.id)) {
    throw new Error(`${label}: expected nonempty beer/brewery arrays with IDs and metadata`);
  }
  return {beers:data.beers.length, breweries:data.breweries.length};
}

/** Explicit preparation; default CLI behavior never regenerates or overwrites data. */
export async function prepareDataSnapshots(root = project) {
  const files = [];
  for (const path of SNAPSHOT_PATHS) {
    const raw = await readFile(resolve(root, path));
    if (raw.length > maxSnapshotBytes) throw new Error(`${path}: exceeds snapshot size budget`);
    const counts = snapshotCounts(raw, path);
    // Node gzip emits zero mtime and no source filename; same input/options produce identical bytes.
    const compressed = gzipSync(raw, {level:9});
    const gzipPath = `${path}.gz`;
    await writeFile(resolve(root, gzipPath), compressed);
    files.push({path, gzipPath, bytes:raw.length, gzipBytes:compressed.length,
      sha256:hash(raw), gzipSha256:hash(compressed), counts});
  }
  const manifest = {format:'brew-atlas-data-snapshots', schemaVersion:1, files};
  await writeFile(resolve(root, SNAPSHOT_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function restoreDataSnapshots(root = project) {
  const manifest = JSON.parse(await readFile(resolve(root, SNAPSHOT_MANIFEST), 'utf8'));
  if (manifest.format !== 'brew-atlas-data-snapshots' || manifest.schemaVersion !== 1
      || !Array.isArray(manifest.files) || manifest.files.length !== SNAPSHOT_PATHS.length) {
    throw new Error('Unrecognized data snapshot manifest');
  }
  const results = [];
  for (const path of SNAPSHOT_PATHS) {
    const file = manifest.files.find(entry => entry.path === path);
    if (!file || file.gzipPath !== `${path}.gz` || !/^[a-f0-9]{64}$/.test(file.sha256 || '')
        || !/^[a-f0-9]{64}$/.test(file.gzipSha256 || '') || !Number.isSafeInteger(file.bytes)
        || file.bytes <= 0 || file.bytes > maxSnapshotBytes || !Number.isSafeInteger(file.gzipBytes) || file.gzipBytes <= 0
        || !Number.isSafeInteger(file.counts?.beers) || file.counts.beers <= 0
        || !Number.isSafeInteger(file.counts?.breweries) || file.counts.breweries <= 0) {
      throw new Error(`Invalid snapshot entry: ${path}`);
    }
    let bytes, restored = false;
    try { bytes = await readFile(resolve(root, path)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const compressed = await readFile(resolve(root, file.gzipPath));
      if (compressed.length !== file.gzipBytes || hash(compressed) !== file.gzipSha256) throw new Error(`Compressed snapshot checksum mismatch: ${file.gzipPath}`);
      bytes = gunzipSync(compressed, {maxOutputLength:file.bytes});
      restored = true;
    }
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`Snapshot checksum mismatch: ${path}; existing JSON is never overwritten`);
    const counts = snapshotCounts(bytes, path);
    if (counts.beers !== file.counts.beers || counts.breweries !== file.counts.breweries) throw new Error(`Snapshot record-count mismatch: ${path}`);
    if (restored) {
      await mkdir(dirname(resolve(root, path)), {recursive:true});
      await writeFile(resolve(root, path), bytes, {flag:'wx'});
    }
    results.push({path, restored, ...counts, bytes:file.bytes});
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.length === 1 && args[0] !== '--prepare') throw new Error('Usage: node scripts/restore-data-snapshots.mjs [--prepare]');
  console.log(JSON.stringify(args[0] === '--prepare' ? await prepareDataSnapshots() : await restoreDataSnapshots(), null, 2));
}
