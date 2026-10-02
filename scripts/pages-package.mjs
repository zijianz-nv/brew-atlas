import {readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gunzipSync, gzipSync} from 'node:zlib';

export const MAX_PAGES_BYTES = 1_000_000_000;

/** Keep every catalog byte while avoiding duplicate raw chunks in the Pages site. */
export async function packageGzipCatalogChunks(dataDirectory) {
  const manifestPath = join(dataDirectory, 'catalog.manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'brew-atlas-chunks' || manifest.schemaVersion !== 1
    || !Array.isArray(manifest.chunks)) throw new Error('Unrecognized catalog manifest');
  let removedBytes = 0, gzipBytes = 0, records = 0;
  const paths = new Set();
  // Verify every gzip before changing the manifest or removing any raw chunk.
  for (const chunk of manifest.chunks) {
    if (!/^catalog\/part-\d+\.json$/.test(chunk.path) || paths.has(chunk.path)
      || !Number.isSafeInteger(chunk.count) || chunk.count < 0)
      throw new Error('Invalid catalog chunk descriptor');
    paths.add(chunk.path);
    const path = join(dataDirectory, chunk.path);
    const [raw, compressed] = await Promise.all([readFile(path), readFile(`${path}.gz`)]);
    const restored = gunzipSync(compressed, {maxOutputLength:raw.length});
    if (!restored.equals(raw)) throw new Error(`Catalog gzip differs from original: ${chunk.path}`);
    const rows = JSON.parse(restored);
    if (!Array.isArray(rows) || rows.length !== chunk.count)
      throw new Error(`Catalog chunk count mismatch: ${chunk.path}`);
    records += rows.length;
    removedBytes += raw.length;
    gzipBytes += compressed.length;
  }
  if (records !== manifest.totalBeers) throw new Error('Catalog total count mismatch');
  const output = {...manifest, chunks:manifest.chunks.map(chunk => ({...chunk, encoding:'gzip'}))};
  const text = JSON.stringify(output), staging = `${manifestPath}.stage-${process.pid}`;
  try {
    await writeFile(staging, text);
    await writeFile(`${staging}.gz`, gzipSync(text, {level:9}));
    await rename(staging, manifestPath);
    await rename(`${staging}.gz`, `${manifestPath}.gz`);
    for (const path of paths) await rm(join(dataDirectory, path));
  } finally {
    await rm(staging, {force:true});
    await rm(`${staging}.gz`, {force:true});
  }
  return {records, chunks:paths.size, removedBytes, gzipBytes};
}

/** Check logical file bytes, independent of filesystem compression or sparse allocation. */
export async function verifyPagesPackage(directory, {maxBytes = MAX_PAGES_BYTES} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Invalid Pages size budget');
  let bytes = 0, files = 0;
  const visit = async folder => {
    for (const entry of await readdir(folder, {withFileTypes:true})) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {bytes += (await stat(path)).size; files++;}
      else throw new Error(`Unsupported Pages artifact entry: ${path}`);
    }
  };
  await visit(directory);
  if (bytes > maxBytes) throw new Error(`Pages package is ${bytes} bytes, exceeding ${maxBytes}`);
  return {bytes, files, maxBytes};
}
