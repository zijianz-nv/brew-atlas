import { APP_BASE_URL, normalizeBasePath, withBasePath } from './base-path.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const abortCheck = signal => { if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError'); };
const localLinkField = key => /(?:urls?|href|path|directory)$/i.test(key)
  || ['image', 'imageOriginal', 'imageThumbnail', 'imageSource'].includes(key);

/** Rebase known resource fields without touching names, descriptions or HTTP sources. */
export function rebaseCatalogResources(catalog, baseUrl = APP_BASE_URL) {
  const base = normalizeBasePath(baseUrl);
  if (base === '/') return catalog;
  const visit = (value, key = '') => {
    if (typeof value === 'string') return localLinkField(key) ? withBasePath(value, base) : value;
    if (Array.isArray(value)) {
      let changed = false;
      const items = value.map(item => { const mapped = visit(item, key); changed ||= mapped !== item; return mapped; });
      return changed ? items : value;
    }
    if (object(value)) {
      let mapped;
      for (const [name, item] of Object.entries(value)) {
        const next = visit(item, name);
        if (next !== item) { mapped ||= { ...value }; mapped[name] = next; }
      }
      return mapped || value;
    }
    return value;
  };
  return visit(catalog);
}

export function validateChunkPath(path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9._/-]+\.json$/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('目录分片路径无效');
  }
  return path;
}

export function validateCatalogManifest(manifest) {
  if (!object(manifest) || manifest.format !== 'brew-atlas-chunks' || manifest.schemaVersion !== 1
    || !object(manifest.catalog) || !object(manifest.catalog.metadata)
    || !Array.isArray(manifest.catalog.breweries) || 'beers' in manifest.catalog
    || !integer(manifest.totalBeers) || !Array.isArray(manifest.chunks)) throw new Error('目录清单格式无效');
  const paths = new Set(); let count = 0;
  for (const chunk of manifest.chunks) {
    if (!object(chunk) || !integer(chunk.count)) throw new Error('目录分片计数无效');
    const path = validateChunkPath(chunk.path);
    if (paths.has(path)) throw new Error('目录分片路径重复');
    paths.add(path); count += chunk.count;
    if (!integer(count)) throw new Error('目录分片计数无效');
  }
  if (count !== manifest.totalBeers) throw new Error('目录清单总数与分片计数不一致');
  return manifest;
}

function validateCatalog(catalog) {
  if (!object(catalog) || !object(catalog.metadata) || !Array.isArray(catalog.beers)
    || !Array.isArray(catalog.breweries)) throw new Error('目录格式无效');
  for (const [name, records] of [['酒款', catalog.beers], ['酒厂', catalog.breweries]]) {
    const ids = new Set();
    for (const record of records) {
      if (!object(record) || typeof record.id !== 'string' || !record.id.trim() || ids.has(record.id))
        throw new Error(`${name}记录 ID 缺失或重复`);
      ids.add(record.id);
    }
  }
  return catalog;
}

/** Load all chunks with at most four requests; publish only a complete catalogue. */
export async function loadCatalog({ baseUrl = APP_BASE_URL, fetchImpl = globalThis.fetch,
  signal, concurrency = 4 } = {}) {
  const base = normalizeBasePath(baseUrl);
  if (typeof fetchImpl !== 'function' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
    throw new TypeError('Invalid catalog loader options');
  abortCheck(signal);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const activeSignal = controller.signal;
  const request = async url => {
    abortCheck(activeSignal);
    const response = await fetchImpl(url, { signal: activeSignal });
    abortCheck(activeSignal);
    return response;
  };
  const read = async (response, url) => {
    if (!response.ok) throw new Error(`目录载入失败 (${response.status}): ${url}`);
    const data = await response.json();
    abortCheck(activeSignal);
    return data;
  };
  try {
    const manifestUrl = `${base}data/catalog.manifest.json`;
    const response = await request(manifestUrl);
    if (response.status === 404) {
      const url = `${base}data/catalog.json`;
      return rebaseCatalogResources(validateCatalog(await read(await request(url), url)), base);
    }
    const manifest = validateCatalogManifest(await read(response, manifestUrl));
    const chunks = new Array(manifest.chunks.length); let next = 0;
    const worker = async () => {
      while (next < manifest.chunks.length) {
        abortCheck(activeSignal);
        const index = next++, descriptor = manifest.chunks[index], url = `${base}data/${descriptor.path}`;
        const records = await read(await request(url), url);
        if (!Array.isArray(records) || records.length !== descriptor.count)
          throw new Error(`目录分片记录数不一致: ${descriptor.path}`);
        chunks[index] = records;
      }
    };
    const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, worker);
    try { await Promise.all(workers); }
    catch (error) { controller.abort(); await Promise.allSettled(workers); throw error; }
    abortCheck(activeSignal);
    const beers = new Array(manifest.totalBeers); let offset = 0;
    for (const chunk of chunks) for (const record of chunk) beers[offset++] = record;
    if (offset !== manifest.totalBeers) throw new Error('目录总记录数不一致');
    return rebaseCatalogResources(validateCatalog({ ...manifest.catalog, beers }), base);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
