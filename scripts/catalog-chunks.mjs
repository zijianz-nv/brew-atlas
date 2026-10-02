import {mkdir, mkdtemp, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';

export const MAX_CATALOG_FILE_BYTES = 8 * 1024 * 1024;

function validateBudget(maxFileBytes) {
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 2) throw new Error('maxFileBytes must be an integer of at least 2');
}

/** JSON arrays retain input order and every record field, including null and 0. */
export function* encodeBeerChunks(beers, {maxFileBytes = MAX_CATALOG_FILE_BYTES} = {}) {
  validateBudget(maxFileBytes);
  if (!Array.isArray(beers)) throw new Error('Catalog beers must be an array');
  let rows = [], bytes = 2, index = 0;
  const part = () => ({path:`catalog/part-${String(index++).padStart(3, '0')}.json`, count:rows.length,
    text:`[${rows.join(',')}]`, bytes});
  for (const [recordIndex, beer] of beers.entries()) {
    if (!beer || typeof beer !== 'object' || Array.isArray(beer)) throw new Error(`Invalid beer record at ${recordIndex}`);
    const text = JSON.stringify(beer), recordBytes = Buffer.byteLength(text);
    if (recordBytes + 2 > maxFileBytes) throw new Error(`Beer record ${beer.id ?? recordIndex} exceeds ${maxFileBytes} bytes by itself`);
    const extra = recordBytes + Number(rows.length > 0);
    if (bytes + extra > maxFileBytes) {
      yield part();
      rows = []; bytes = 2;
    }
    bytes += recordBytes + Number(rows.length > 0);
    rows.push(text);
  }
  if (rows.length) yield part();
}

export function createCatalogChunkManifest(catalog, chunks, {maxFileBytes = MAX_CATALOG_FILE_BYTES, maxHeaderBytes = maxFileBytes} = {}) {
  validateBudget(maxHeaderBytes);
  validateBudget(maxFileBytes);
  if (!catalog || typeof catalog !== 'object' || !catalog.metadata || !Array.isArray(catalog.breweries) || !Array.isArray(catalog.beers)) {
    throw new Error('Catalog must contain metadata, breweries and beers');
  }
  const {beers, ...header} = catalog;
  const manifest = {format:'brew-atlas-chunks', schemaVersion:1, catalog:header,
    totalBeers:beers.length, chunks:chunks.map(({path, count}) => ({path, count}))};
  if (manifest.chunks.reduce((sum, chunk) => sum + chunk.count, 0) !== beers.length) throw new Error('Chunk counts do not match catalog beer count');
  const text = JSON.stringify(manifest), bytes = Buffer.byteLength(text);
  if (bytes > maxHeaderBytes) throw new Error(`Catalog manifest/header is ${bytes} bytes, exceeding ${maxHeaderBytes}; breweries must not be silently omitted`);
  return {manifest, text, bytes};
}

/** Stage all files first, so a too-large record/header cannot publish a partial manifest. */
export async function writeCatalogChunks(catalog, dataDirectory, options = {}) {
  const {maxFileBytes = MAX_CATALOG_FILE_BYTES, gzip = false} = options;
  // Validate catalog structure and the minimum header size before writing parts.
  createCatalogChunkManifest({...catalog, beers:[]}, [], options);
  if (!Array.isArray(catalog.beers)) throw new Error('Catalog beers must be an array');
  await mkdir(dataDirectory, {recursive:true});
  const staging = await mkdtemp(join(dataDirectory, '.catalog-stage-'));
  const parts = [];
  const writeCompressed = async (path, text) => {
    if (!gzip) return null;
    const compressed = gzipSync(text, {level:9});
    // A sidecar is optional; never break the per-file cap for incompressible input.
    if (compressed.length > maxFileBytes) return null;
    await writeFile(`${path}.gz`, compressed);
    return compressed.length;
  };
  try {
    await mkdir(join(staging, 'catalog'));
    for (const part of encodeBeerChunks(catalog.beers, options)) {
      await writeFile(join(staging, part.path), part.text);
      const gzipBytes = await writeCompressed(join(staging, part.path), part.text);
      parts.push({path:part.path, count:part.count, bytes:part.bytes, ...(gzipBytes === null ? {} : {gzipBytes})});
    }
    const result = createCatalogChunkManifest(catalog, parts, options);
    await writeFile(join(staging, 'catalog.manifest.json'), result.text);
    const manifestGzipBytes = await writeCompressed(join(staging, 'catalog.manifest.json'), result.text);
    await rm(join(dataDirectory, 'catalog'), {recursive:true, force:true});
    await rename(join(staging, 'catalog'), join(dataDirectory, 'catalog'));
    await rename(join(staging, 'catalog.manifest.json'), join(dataDirectory, 'catalog.manifest.json'));
    await rm(join(dataDirectory, 'catalog.manifest.json.gz'), {force:true});
    if (manifestGzipBytes !== null) await rename(join(staging, 'catalog.manifest.json.gz'), join(dataDirectory, 'catalog.manifest.json.gz'));
    // The complete local source stays in public/. Static deployments use chunks only.
    await rm(join(dataDirectory, 'catalog.json'), {force:true});
    await rm(join(dataDirectory, 'catalog.json.gz'), {force:true});
    return {...result, parts, manifestGzipBytes};
  } finally {
    await rm(staging, {recursive:true, force:true});
  }
}
