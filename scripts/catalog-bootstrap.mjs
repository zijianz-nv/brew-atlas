import {mkdir, rename, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';

const hasLocation = brewery => brewery?.locationVerified === true
  && Number.isFinite(brewery.lat) && Math.abs(brewery.lat) <= 90
  && Number.isFinite(brewery.lng) && Math.abs(brewery.lng) <= 180;
const auditFields = new Set(['sourceEvidence', 'fieldEvidence', 'identityEvidence',
  'descriptionEvidence', 'locationEvidence', 'mergedSourceRecords', 'sourceSnapshots', 'imageBeforeCutout', 'imageDerivation']);
// These source fields affect taxonomy. Audit copies of the rest remain in the
// complete catalog chunks; displayed descriptions, credits and URLs stay here.
const taxonomySourceFields = ['style', 'style_family', 'description', 'ingredients', 'method'];
function mapRecord(record) {
  const output = Object.fromEntries(Object.entries(record).filter(([key]) => !auditFields.has(key) && key !== 'sourceRecord'));
  if(record.imageEvidence&&typeof record.imageEvidence==='object') {
    // Keep every field used by image identity, recommendation eligibility and
    // detail resolution; the rest is offline provenance in the full catalogue.
    const keys=['originalSha256','sha256','isPlaceholder','kind','photoType','cacheStatus','downloadStatus','derivative'];
    output.imageEvidence=Object.fromEntries(keys.filter(key=>key in record.imageEvidence).map(key=>[key,record.imageEvidence[key]]));
  }
  if (record.sourceRecord && typeof record.sourceRecord === 'object') {
    const source = Object.fromEntries(taxonomySourceFields.filter(key => key in record.sourceRecord)
      .map(key => [key, record.sourceRecord[key]]));
    if (Object.keys(source).length) output.sourceRecord = source;
  }
  return output;
}

/** Only the records already eligible for the map; no full-catalog rows are deleted. */
export function createCatalogBootstrap(catalog) {
  if (!catalog?.metadata || !Array.isArray(catalog.beers) || !Array.isArray(catalog.breweries))
    throw new Error('Catalog must contain metadata, breweries and beers');
  const breweryMap = new Map(catalog.breweries.map(brewery => [brewery.id, brewery]));
  const collectionCounts = {all:catalog.beers.length, pictured:0};
  const records = [];
  for (const beer of catalog.beers) {
    const pictured = hasDescribedPhoto(beer);
    if (pictured) collectionCounts.pictured++;
    for (const id of new Set([...(beer.collections || []), beer.collection].filter(id => id && !['all', 'pictured'].includes(id))))
      collectionCounts[id] = (collectionCounts[id] || 0) + 1;
    if (pictured && hasLocation(breweryMap.get(beer.breweryId))) records.push(beer);
  }
  const breweryIds = new Set(records.map(beer => beer.breweryId));
  const breweries = catalog.breweries.filter(brewery => breweryIds.has(brewery.id)).map(mapRecord);
  const {sourceSnapshots, bootstrap, ...metadata} = catalog.metadata;
  const subset = {metadata:{...metadata,
    counts:{...metadata.counts, beers:catalog.beers.length, breweries:catalog.breweries.length,
      picturedBeers:collectionCounts.pictured, mapReadyBeers:records.length},
    collectionCounts,
    bootstrap:{scope:'map', loadedBeers:records.length, totalBeers:catalog.beers.length,
      loadedBreweries:breweries.length, totalBreweries:catalog.breweries.length}},
  breweries, beers:records.map(mapRecord)};
  return {format:'brew-atlas-bootstrap', schemaVersion:1, catalog:subset};
}

/** Separate from the large manifest so the first request never needs all breweries. */
export async function writeCatalogBootstrap(catalog, dataDirectory, {gzip = false} = {}) {
  const bootstrap = createCatalogBootstrap(catalog), text = JSON.stringify(bootstrap);
  const path = join(dataDirectory, 'catalog.bootstrap.json');
  const staging = `${path}.stage-${process.pid}`;
  const compressed = gzip ? gzipSync(text, {level:9}) : null;
  await mkdir(dataDirectory, {recursive:true});
  try {
    await writeFile(staging, text);
    if (compressed) await writeFile(`${staging}.gz`, compressed);
    await rename(staging, path);
    if (compressed) await rename(`${staging}.gz`, `${path}.gz`);
    else await rm(`${path}.gz`, {force:true});
  } finally {
    await rm(staging, {force:true});
    await rm(`${staging}.gz`, {force:true});
  }
  return {bootstrap, bytes:Buffer.byteLength(text), gzipBytes:compressed?.length ?? null};
}
