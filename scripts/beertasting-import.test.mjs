import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const data = read('public/data/beertasting.json');
const pilotSource = read('research/beertasting-pilot-2026-09-18/beers.json').records;
const expansion = read('research/beertasting-geographic-expansion-2026-09-18/beers.json');
const regionalRoot = 'research/beertasting-regions-2026-09-18';
const regions = existsSync(resolve(root, regionalRoot, 'beers.json')) ? read(`${regionalRoot}/beers.json`) : {records: []};
const densityRoot = 'research/beertasting-density-2026-09-18';
const density = existsSync(resolve(root, densityRoot, 'beers.json')) ? read(`${densityRoot}/beers.json`) : {records: []};
const qualityRoot = 'research/beertasting-quality-2026-09-18';
const quality = existsSync(resolve(root, qualityRoot, 'beers.json')) ? read(`${qualityRoot}/beers.json`) : {records: []};
const descriptionFile = 'research/beertasting-descriptions-2026-09-18/descriptions-reviewed.json';
const descriptions = new Map((existsSync(resolve(root, descriptionFile)) ? read(descriptionFile).records : []).map(row => [row.id,row]));
const source = [...pilotSource, ...expansion.records, ...regions.records, ...density.records, ...quality.records];
const expectedBreweries = new Set(source.map(row => row.brewery_id)).size;
const expectedImages = source.filter(row => row.image_class === 'candidate').length;
const original = new Map(source.map(row => [row.id, row]));
const locations = new Map(read('public/data-sources/beertasting/brewery-locations.json').records.map(row => [row.sourceBreweryId, row]));
const world = read('public/data/world.json');
const cache = read('public/data-sources/beertasting/image-cache.json');
const cachedBySource = new Map(cache.records.map(row => [row.sourceUrl, row]));
const validUrl = value => {
  const url = new URL(value);
  assert.ok(['https:', 'http:'].includes(url.protocol));
  assert.equal(url.username, '');
  assert.equal(url.password, '');
};

test('the full reviewed 1000-record pilot survives with separately attributed public HTML expansion', () => {
  assert.equal(pilotSource.length, 1000);
  assert.equal(data.beers.length, source.length);
  assert.equal(data.breweries.length, expectedBreweries);
  assert.equal(new Set(data.beers.map(row => row.id)).size, source.length);
  assert.equal(new Set(data.breweries.map(row => row.id)).size, expectedBreweries);
  assert.deepEqual(data.beers.slice(0, 1000).map(row => row.sourceIds[0]), pilotSource.map(row => row.id));
  assert.deepEqual(data.beers.map(row => row.sourceIds[0]), source.map(row => row.id));
  const breweryIds = new Set(data.breweries.map(row => row.id));
  for (const row of data.beers) {
    const raw = original.get(row.sourceIds[0]);
    assert.equal(row.id, `beertasting-${raw.id}`);
    assert.equal(row.breweryId, `beertasting-brewery-${raw.brewery_id}`);
    assert.ok(breweryIds.has(row.breweryId));
    assert.equal(row.collection, 'beertasting');
    assert.equal(row.sourceRecord.style, raw.style);
    assert.equal(row.sourceRecord.style_family, raw.style_family);
    assert.equal(row.sourceCategory, raw.style_family);
    assert.equal(row.sourceRecord.url, raw.url);
    assert.equal(row.rating, raw.rating);
    assert.equal(row.ratingsCount, raw.ratings_count);
    if (raw.collection_method === 'direct_public_html') {
      assert.equal(row.collectionMethod, 'direct_public_html');
      assert.equal(row.collectionBatch, raw.collection_batch);
      assert.ok(row.sourceRecord.source_page_sha256.match(/^[0-9a-f]{64}$/));
      assert.ok(Object.keys(row.sourceRecord).every(key => !key.startsWith('ids_')));
      assert.equal(row.sourceRecord.listing_brewery_id, raw.brewery_id);
    } else {
      assert.equal(row.collectionMethod, 'genuine_ids_with_public_page_metadata');
      assert.ok(row.sourceRecord.ids_csv_file && row.sourceRecord.ids_exported_at);
    }
  }
});

test('candidate provenance survives while only complete local caches become display images', () => {
  assert.equal(data.beers.filter(row => row.imageDownloadUrl).length, expectedImages);
  assert.equal(data.beers.filter(row => row.image).length, data.metadata.counts.cachedImages);
  assert.equal(data.beers.filter(row => !row.imageDownloadUrl).length, source.length - expectedImages);
  assert.equal(data.beers.slice(0, 1000).filter(row => row.image).length, 635);
  for (const row of data.beers) {
    const raw = original.get(row.sourceIds[0]);
    assert.equal(row.imageDownloadUrl, raw.image_class === 'candidate' ? raw.image_url : null);
    if (row.image) {
      const cached = cachedBySource.get(raw.image_url);
      assert.equal(cached.status, 'cached');
      assert.equal(row.imageCacheStatus, 'cached');
      assert.equal(row.image, cached.card.path);
      assert.equal(row.imageThumbnail, cached.map.path);
      assert.equal(row.imageOriginal, cached.original.path);
      assert.equal(row.imageSource, raw.url);
      for (const [field, name] of [['image', 'card'], ['imageThumbnail', 'map'], ['imageOriginal', 'original']]) {
        assert.ok(row[field].startsWith(`/images/beertasting/${name}/`));
        const blob = readFileSync(resolve(root, 'public', row[field].slice(1)));
        assert.equal(blob.length, cached[name].bytes);
        assert.equal(createHash('sha256').update(blob).digest('hex'), cached[name].sha256);
      }
    } else {
      assert.equal(row.imageThumbnail, null);
      assert.equal(row.imageOriginal, null);
    }
    assert.equal(row.imageEvidence.downloadedForDemo, Boolean(row.image));
    assert.equal(row.imageEvidence.individuallyVerified, false);
    assert.equal(row.imageLicenseUrl, null);
    assert.equal(row.imageEvidence.reuseRightsVerified, false);
  }
});

function webpSize(blob) {
  assert.equal(blob.toString('ascii', 0, 4), 'RIFF');
  assert.equal(blob.toString('ascii', 8, 12), 'WEBP');
  const kind = blob.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [blob.readUIntLE(24, 3) + 1, blob.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [blob.readUInt16LE(26) & 0x3fff, blob.readUInt16LE(28) & 0x3fff];
  assert.equal(kind, 'VP8L');
  const bits = blob.readUInt32LE(21);
  return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
}

test('WebP variants match encoded dimensions and preserve aspect ratio without enlargement', () => {
  for (const row of data.beers.filter(row => row.image)) {
    const cached = cachedBySource.get(row.imageDownloadUrl);
    for (const name of ['map', 'card']) {
      const entry = cached[name];
      const blob = readFileSync(resolve(root, 'public', entry.path.slice(1)));
      assert.deepEqual(webpSize(blob), [entry.width, entry.height]);
      const max = name === 'map' ? [320, 160] : [800, 400];
      assert.ok(entry.width <= max[0] && entry.height <= max[1]);
      assert.ok(entry.width <= entry.sourceDisplayWidth && entry.height <= entry.sourceDisplayHeight);
      const error = Math.abs(entry.width * entry.sourceDisplayHeight - entry.height * entry.sourceDisplayWidth);
      assert.ok(error <= Math.max(entry.sourceDisplayWidth, entry.sourceDisplayHeight), `${row.id}: changed aspect ratio`);
    }
    assert.equal(cached.imageIdentityVerified, false);
  }
});

test('uncertain IBU zero stays in the source while product IBU is unknown', () => {
  let zeros = 0;
  for (const row of data.beers) {
    const raw = original.get(row.sourceIds[0]);
    assert.equal(row.abv, raw.abv_percent);
    assert.ok(row.abv === null || (Number.isFinite(row.abv) && row.abv >= 0 && row.abv <= 100));
    assert.equal(row.sourceRecord.ibu_raw, raw.ibu_raw);
    assert.equal(row.ibu, raw.ibu_raw > 0 ? raw.ibu_raw : null);
    if (raw.ibu_raw === 0) {
      zeros++;
      assert.ok(row.dataQualityFlags.includes('ibu_zero_treated_as_unknown'));
    }
  }
  assert.equal(pilotSource.filter(row => row.ibu_raw === 0).length, 240);
  assert.equal(zeros, source.filter(row => row.ibu_raw === 0).length);
  assert.equal(data.beers.filter(row => row.ibu !== null).length, source.filter(row => row.ibu_raw > 0).length);
});

test('the import supplies no unprovided flavor, ingredient, recipe, or production facts', () => {
  for (const row of data.beers) {
    for (const key of ['flavors', 'flavorEvidence', 'hops', 'malts', 'foodPairings']) assert.deepEqual(row[key], []);
    for (const key of ['yeast', 'fermentation', 'srm', 'firstBrewed']) assert.equal(row[key], null);
    const introduction = descriptions.get(row.sourceIds[0]);
    assert.equal(row.originalDescription, introduction?.description || '');
    if (!introduction) assert.equal(row.description, '');
    else assert(row.description.trim() && row.descriptionEvidence);
    assert.equal(row.craftStatus, 'unknown');
    assert.equal(row.locationEvidence.productionLocationVerified, false);
    assert.equal(row.dataLicense, null);
  }
  assert.equal(pilotSource.filter(row => row.style === null).length, 7);
  assert.equal(data.beers.filter(row => row.sourceRecord.style === null).length, source.filter(row => row.style === null).length);
});

test('all map references have explicit locality evidence and correct country/hemisphere bounds', () => {
  const bounds = { AT: [46, 49, 9, 18], DK: [54, 58, 7, 16], BE: [49, 52, 2, 7], EE: [57, 60, 21, 29],
    ES: [27, 44, -19, 5], US: [24, 50, -125, -66], CO: [-5, 14, -82, -66], CA: [41, 84, -142, -52],
    BR: [-34, 6, -74, -34], JP: [24, 46, 122, 146], HK: [22, 23, 113, 115], ZA: [-35, -22, 16, 33],
    NZ: [-48, -33, 165, 180], AU: [-44, -10, 112, 154], MX: [14, 33, -119, -86],
    CL: [-56, -17, -76, -66], IS: [63, 67, -25, -13], MU: [-21, -19, 57, 58],
    VN: [8, 24, 102, 110], KR: [33, 39, 124, 130], IN: [6, 37, 68, 98],
    SG: [1, 2, 103, 105], TW: [21, 26, 119, 123], NO: [57, 72, 4, 32],
    GR: [34, 42, 19, 30], KE: [-5, 6, 33, 42], PR: [17, 19, -68, -65],
    TH: [5, 21, 97, 106], SE: [55, 70, 10, 25], AR: [-56, -21, -74, -53], CN: [18, 54, 73, 135],
    GE: [41, 44, 39, 47], BW: [-27, -17, 19, 30], TZ: [-12, 0, 29, 41], NA: [-29, -16, 11, 26],
    UG: [-2, 5, 29, 36], GH: [4, 12, -4, 2], MA: [20, 37, -18, 0],
    GB: [49, 61, -9, 3], IE: [51, 56, -11, -5], FR: [41, 52, -6, 10], IT: [35, 48, 6, 19],
    CZ: [48, 52, 12, 19], PL: [49, 55, 14, 25], FI: [59, 71, 19, 32], TR: [35, 43, 25, 45],
    LV: [55, 59, 20, 29], RO: [43, 49, 20, 30], ID: [-12, 7, 94, 142], NP: [26, 31, 80, 89],
    RU: [41, 82, 19, 180], DE: [47, 56, 5, 16], UA: [44, 53, 22, 41], HU: [45, 49, 16, 23],
    SK: [47, 50, 16, 23], PH: [4, 22, 116, 127], PE: [-19, 1, -82, -68], EC: [-6, 2, -82, -75],
    ZW: [-23, -15, 25, 34], ZM: [-19, -8, 21, 34], ET: [3, 15, 32, 49] };
  for (const row of data.breweries) {
    const ref = locations.get(row.sourceIds[0]);
    assert.ok(ref);
    assert.equal(row.locationPrecision, 'city');
    assert.equal(row.locationRole, 'brewery_city_reference');
    assert.equal(ref.productionLocationVerified, false);
    assert.deepEqual([row.lat, row.lng], [ref.lat, ref.lng]);
    const box = bounds[row.countryCode];
    assert.ok(box && row.lat >= box[0] && row.lat <= box[1] && row.lng >= box[2] && row.lng <= box[3], row.name);
    assert.ok(ref.coordinateSourceUrl && ref.identitySourceUrl && ref.verifiedAt);
    [...row.sourceUrls, ref.coordinateSourceUrl, ref.identitySourceUrl].forEach(validUrl);
    if (ref.existingCollection === 'world') {
      const old = world.breweries.find(br => br.id === ref.existingBreweryId);
      assert.ok(old);
      assert.deepEqual([row.lat, row.lng], [old.lat, old.lng]);
      assert.equal(old.locationPrecision, 'city');
    }
  }
  assert.equal(data.breweries.filter(row => row.locationEvidence.existingCollection === 'world').length, 2);
});

test('geographic expansion adds reviewed distinct map points and retains its original page audit', () => {
  const refs = read('research/beertasting-geographic-expansion-2026-09-18/brewery-locations.json').records;
  const audit = read('research/beertasting-geographic-expansion-2026-09-18/page-audit.json');
  const coordinatePages = new Map(['coordinate-response.json', 'coordinate-supplement-response.json'].flatMap(file =>
    Object.values(read(`research/beertasting-geographic-expansion-2026-09-18/${file}`).response.query.pages).map(page => [page.title, page])));
  assert.ok(refs.length >= 20);
  assert.ok(new Set(refs.map(row => `${row.lat},${row.lng}`)).size >= 20);
  assert.ok(expansion.records.length >= 400);
  for (const ref of refs) {
    const page = coordinatePages.get(ref.coordinatePlaceTitle);
    assert.ok(page, ref.coordinatePlaceTitle);
    assert.equal(ref.coordinateSourcePageId, page.pageid);
    if (page.coordinates?.length) assert.deepEqual([ref.lat, ref.lng], [page.coordinates[0].lat, page.coordinates[0].lon]);
    else {
      assert.equal(ref.coordinatePlaceTitle, 'Kikuyu, Kenya');
      assert.deepEqual([ref.lat, ref.lng], [-1.25, 36.667]);
      assert.ok(ref.coordinateQueryUrl.includes('oldid=1364460595'));
    }
  }
  const pages = new Map(audit.pages.map(page => [page.url, page]));
  for (const row of expansion.records) {
    const page = pages.get(row.source_url);
    assert.ok(page);
    assert.equal(page.http_status, 200);
    assert.equal(page.source_sha256, row.source_page_sha256);
    assert.ok(page.meta.current_page <= 2);
  }
});

test('requested regions preserve prior records and bind every new location and beer to saved source evidence', () => {
  if (!regions.records.length) return;
  assert.deepEqual(data.beers.slice(0, 1432).map(row => row.sourceIds[0]), [...pilotSource, ...expansion.records].map(row => row.id));
  const parts = ['georgia-nz', 'china-india', 'africa'];
  const byMaker = new Map(data.breweries.map(row => [row.sourceIds[0], row]));
  const byBeer = new Map(data.beers.map(row => [row.sourceIds[0], row]));
  const newCountries = new Set();
  for (const part of parts) {
    const refs = read(`${regionalRoot}/${part}/brewery-locations.json`).records;
    const records = read(`${regionalRoot}/${part}/beers.json`).records;
    const pages = new Map(read(`${regionalRoot}/${part}/page-audit.json`).pages.map(row => [row.url, row]));
    for (const ref of refs) {
      newCountries.add(ref.countryCode);
      assert(ref.coordinateEvidenceFile.startsWith(`${regionalRoot}/${part}/`));
      const evidence = read(ref.coordinateEvidenceFile);
      const page = Object.values(evidence.response.query.pages).find(row => row.pageid === ref.coordinateSourcePageId);
      assert(page?.coordinates?.length, ref.breweryName);
      assert.deepEqual([ref.lat, ref.lng], [page.coordinates[0].lat, page.coordinates[0].lon], ref.breweryName);
      assert.equal(page.title, ref.coordinatePlaceTitle);
      const brewery = byMaker.get(ref.sourceBreweryId);
      assert(brewery);
      assert.equal(brewery.countryCode, ref.countryCode);
      assert.equal(brewery.sourceRecord.city, ref.city, 'Source city must not be silently overwritten');
      assert.equal(brewery.city, ref.verifiedCity || ref.reviewedCity || ref.city.trim() || ref.resolvedLocality || ref.coordinatePlaceTitle);
      assert.equal(brewery.description, ref.verificationNote);
    }
    for (const raw of records) {
      const page = pages.get(raw.source_url), beer = byBeer.get(raw.id);
      assert(page && beer);
      assert.equal(page.http_status, 200);
      assert.equal(raw.source_page_sha256, page.source_sha256);
      assert.equal(beer.rating, raw.rating);
      assert.equal(beer.ratingsCount, raw.ratings_count);
      if (raw.catalog_role) assert.equal(beer.catalogRole, raw.catalog_role);
      if (raw.catalog_role === 'industrial_reference') assert(beer.sourceNote.includes('大型酒厂地区风格参照'));
    }
  }
  for (const code of ['GE', 'NZ', 'CN', 'IN', 'BW', 'TZ', 'NA', 'UG', 'GH', 'MA']) assert(newCountries.has(code), `Requested region missing: ${code}`);
});

test('density expansion adds distinct reviewed cities with saved page and coordinate evidence', () => {
  if (!density.records.length) return;
  const prior = [...pilotSource, ...expansion.records, ...regions.records];
  assert.deepEqual(data.beers.slice(0, prior.length).map(row => row.sourceIds[0]), prior.map(row => row.id));
  const oldMakers = new Set(prior.map(row => row.brewery_id));
  const oldPoints = new Set([...locations.values()].filter(row => oldMakers.has(row.sourceBreweryId)).map(row => `${row.lat.toFixed(4)},${row.lng.toFixed(4)}`));
  const refs = read(`${densityRoot}/brewery-locations.json`).records;
  assert(refs.length >= 40);
  assert(refs.filter(row => !oldPoints.has(`${row.lat.toFixed(4)},${row.lng.toFixed(4)}`)).length >= 40);
  const byMaker = new Map(data.breweries.map(row => [row.sourceIds[0], row]));
  const byBeer = new Map(data.beers.map(row => [row.sourceIds[0], row]));
  for (const part of ['americas-africa', 'eurasia-oceania']) {
    const pages = new Map(read(`${densityRoot}/${part}/page-audit.json`).pages.map(row => [row.url, row]));
    for (const ref of read(`${densityRoot}/${part}/brewery-locations.json`).records) {
      assert(!oldMakers.has(ref.sourceBreweryId));
      assert(ref.coordinateEvidenceFile.startsWith(`${densityRoot}/${part}/`));
      const evidence = read(ref.coordinateEvidenceFile);
      if (ref.coordinateProvider === 'openstreetmap') {
        const node = evidence.response.elements.find(row => row.type === 'node' && row.id === ref.coordinateSourceNodeId);
        assert(node);
        assert.equal(node.version, ref.coordinateSourceVersion);
        assert.equal(node.tags.name, ref.coordinatePlaceTitle);
        assert.deepEqual([ref.lat, ref.lng], [node.lat, node.lon]);
      } else {
        const page = Object.values(evidence.response.query.pages).find(row => row.pageid === ref.coordinateSourcePageId);
        assert(page?.coordinates?.length, ref.breweryName);
        assert.equal(page.title, ref.coordinatePlaceTitle);
        assert.deepEqual([ref.lat, ref.lng], [page.coordinates[0].lat, page.coordinates[0].lon]);
      }
      const maker = byMaker.get(ref.sourceBreweryId);
      assert(maker);
      assert.equal(maker.sourceRecord.city, ref.city);
      assert.equal(maker.description, ref.verificationNote);
    }
    for (const raw of read(`${densityRoot}/${part}/beers.json`).records) {
      const page = pages.get(raw.source_url), beer = byBeer.get(raw.id);
      assert(page && beer);
      assert.equal(page.http_status, 200);
      assert.equal(page.meta.current_page, 1);
      assert.equal(raw.source_page_sha256, page.source_sha256);
      assert.equal(beer.rating, raw.rating);
      assert.equal(beer.ratingsCount, raw.ratings_count);
      if (raw.catalog_role) assert.equal(beer.catalogRole, raw.catalog_role);
    }
  }
});

test('beer introductions are exact source beer fields, not brewery text, reviews, or invented flavor copy', () => {
  const archives = new Map();
  for (const beer of data.beers.filter(row => row.description)) {
    const introduction = descriptions.get(beer.sourceIds[0]), evidence = beer.descriptionEvidence;
    assert(introduction && evidence);
    assert.equal(introduction.brewery_id, beer.sourceRecord.brewery_id);
    assert.equal(introduction.productUrl, beer.sourceRecord.url);
    assert.equal(beer.originalDescription, introduction.description);
    assert.equal(evidence.sourceUrl, introduction.sourceUrl);
    assert(!evidence.sourceFile.startsWith('/'));
    if (!archives.has(evidence.sourceFile)) {
      const raw = readFileSync(resolve(root, evidence.sourceFile));
      assert.equal(createHash('sha256').update(raw).digest('hex'), evidence.sourceSha256);
      const match = raw.toString().match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      assert(match);
      archives.set(evidence.sourceFile, JSON.parse(match[1]));
    }
    const nodes = archives.get(evidence.sourceFile);
    const at = evidence.sourceFieldPath.match(/__NUXT_DATA__\[(\d+)\]\.description$/);
    assert(at, evidence.sourceFieldPath);
    const node = nodes[Number(at[1])];
    assert.equal(nodes[node.id], beer.sourceIds[0]);
    assert.equal(nodes[node.description], beer.originalDescription);
    assert(beer.sourceUrls.includes(evidence.sourceUrl));
  }
  assert.equal(data.metadata.counts.descriptions, data.beers.filter(row => row.description).length);
});

test('quality additions retain their original locality and one-page collection evidence', () => {
  if (!quality.records.length) return;
  const prior = [...pilotSource,...expansion.records,...regions.records,...density.records];
  assert.deepEqual(data.beers.slice(0,prior.length).map(row => row.sourceIds[0]), prior.map(row=>row.id));
  const refs = read(`${qualityRoot}/additions/brewery-locations.json`).records;
  const pages = new Map(read(`${qualityRoot}/additions/page-audit.json`).pages.map(row=>[row.url,row]));
  for (const ref of refs) {
    const evidence = read(ref.coordinateEvidenceFile);
    const page = Object.values(evidence.response.query.pages).find(row=>row.pageid===ref.coordinateSourcePageId);
    assert(page?.coordinates?.length, ref.breweryName);
    assert.deepEqual([ref.lat,ref.lng], [page.coordinates[0].lat,page.coordinates[0].lon]);
  }
  for (const beer of quality.records) {
    const page = pages.get(beer.source_url);
    assert(page);
    assert.equal(page.http_status,200);
    assert.equal(beer.source_page_sha256,page.source_sha256);
  }
});

test('offline re-import is byte-for-byte reproducible and public provenance has no workstation paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beertasting-import-test-'));
  try {
    const output = join(dir, 'beertasting.json');
    const manifest = join(dir, 'cache.json');
    writeFileSync(manifest, JSON.stringify(cache));
    const run = spawnSync('python3', ['scripts/import-beertasting.py', '--image-cache', manifest, '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(readFileSync(output, 'utf8'), readFileSync(resolve(root, 'public/data/beertasting.json'), 'utf8'));
    for (const filename of ['public/data/beertasting.json', 'public/data-sources/beertasting/source-records.json']) {
      assert.doesNotMatch(readFileSync(resolve(root, filename), 'utf8'), /\/Users\/|\/var\/folders\//);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an absent or failed cache never falls back to the remote candidate URL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beertasting-missing-cache-'));
  try {
    const manifest = join(dir, 'cache.json');
    const output = join(dir, 'beertasting.json');
    writeFileSync(manifest, JSON.stringify({records: [{sourceUrl: source[0].image_url, sourceBeerId: source[0].id, status: 'failed', httpStatus: 403}]}));
    const run = spawnSync('python3', ['scripts/import-beertasting.py', '--image-cache', manifest, '--output', output], { cwd: root, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const rebuilt = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(rebuilt.beers.length, source.length);
    assert.equal(rebuilt.beers.filter(row => row.imageDownloadUrl).length, expectedImages);
    assert.ok(rebuilt.beers.every(row => row.image === null && row.imageThumbnail === null && row.imageOriginal === null));
    assert.equal(rebuilt.beers[0].imageCacheStatus, 'failed');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
