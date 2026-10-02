import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {encodeBeerChunks, createCatalogChunkManifest, writeCatalogChunks} from './catalog-chunks.mjs';
import {createCatalogBootstrap, writeCatalogBootstrap} from './catalog-bootstrap.mjs';
import {classifyBeer} from '../src/beer-taxonomy.mjs';
import {createBeerPhotoIdentityIndex} from '../src/beer-photo-identity.mjs';
import {writeStaticGzipSidecars} from './compressed-assets.mjs';

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

test('map bootstrap keeps every eligible location and full collection totals without borrowing unverified coordinates', () => {
  const catalog = {metadata:{id:'test', partial:true, sourceSnapshots:{largeAudit:'x'.repeat(1000)}}, breweries:[
    {id:'origin', locationVerified:true, lat:0, lng:0},
    {id:'unverified', locationVerified:false, lat:35, lng:10},
    {id:'invalid', locationVerified:true, lat:91, lng:10},
    {id:'null', locationVerified:true, lat:null, lng:null}], beers:[
    {id:'ready', breweryId:'origin', image:'/images/one.png', description:'A real product introduction.', collection:'awards', collections:['awards','representative','awards']},
    {id:'original-intro', breweryId:'origin', image:'/images/two.png', originalDescription:'An original introduction.', collection:'regional'},
    {id:'unknown-place', breweryId:'unverified', image:'/images/three.png', description:'The image does not verify a location.', collection:'local'},
    {id:'outside-earth', breweryId:'invalid', image:'/images/four.png', description:'Invalid coordinates.', collection:'local'},
    {id:'null-place', breweryId:'null', image:'/images/five.png', description:'Coordinates are missing.', collection:'local'},
    {id:'no-intro', breweryId:'origin', image:'/images/six.png', description:'暂无酒款介绍', collection:'local'},
    {id:'no-photo', breweryId:'origin', description:'No photo in the source.', collection:'local'},
    {id:'missing-brewery', breweryId:'missing', image:'/images/seven.png', description:'An unknown brewery.', collection:'local'}]};
  const original = structuredClone(catalog), {catalog:subset} = createCatalogBootstrap(catalog);
  assert.deepEqual(subset.beers.map(beer => beer.id), ['ready','original-intro']);
  assert.deepEqual(subset.breweries.map(brewery => brewery.id), ['origin']);
  assert.deepEqual(subset.metadata.bootstrap, {scope:'map', loadedBeers:2, totalBeers:8, loadedBreweries:1, totalBreweries:4});
  assert.equal(subset.metadata.partial, true);
  assert.deepEqual(subset.metadata.collectionCounts, {all:8,pictured:6,awards:1,representative:1,regional:1,local:6});
  assert.equal(subset.metadata.counts.mapReadyBeers, 2);
  assert.equal(subset.metadata.sourceSnapshots, undefined);
  assert.deepEqual(catalog, original, 'building the bootstrap must never trim the full source');
});

test('bootstrap audit trimming preserves taxonomy, labels, scores, photo hashes and content bounds', () => {
  const photo = {id:'photo', breweryId:'one', name:'Source beer', collection:'beertasting', rating:4.1, ratingsCount:29,
    image:'/images/one.png', imageOriginal:'/images/original.png', imageThumbnail:'/images/thumbnail.webp',
    description:'A real source introduction.', originalDescription:'Dry-hopped with citrus aroma.',
    style:'Unknown', flavors:['柑橘'], flavorEvidence:[{flavor:'柑橘', matches:[{field:'description',excerpt:'Citrus aroma.'}]}],
    sourceRecord:{style:'IPA',style_family:'India Pale Ale',description:'Dry-hopped with citrus aroma.',
      ingredients:{hops:[{name:'Citra',add:'dry hop',amount:{value:2,unit:'grams'}}]},method:{twist:'Oak aged.'},unused:'x'.repeat(3000)},
    imageEvidence:{originalSha256:'a'.repeat(64),isPlaceholder:false,derivative:true,cacheStatus:'cached',rawAudit:'x'.repeat(3000)}, imageCache:{sha256:'b'.repeat(64)},
    locationEvidence:{rawAudit:'x'.repeat(3000)},
    imageContentBounds:{width:100,height:200,bounds:{x:20,y:10,width:60,height:180}},
    sourceUrls:['https://official.example/product'],sourceNote:'Source note stays.',
    awards:[{ratingYear:2025,medal:'gold',rating:4.2,region:'NZ',style:'IPA'}],
    mergedSourceRecords:[{raw:'x'.repeat(3000)}],sourceEvidence:[{large:'x'.repeat(3000)}],
    identityEvidence:{large:'x'.repeat(3000)},descriptionEvidence:{large:'x'.repeat(3000)}};
  const catalog = {metadata:{}, breweries:[{id:'one',name:'Official producer',locationVerified:true,lat:10,lng:20,
    city:'Source city',locationPrecision:'city',coordinateSourceUrl:'https://coordinates.example/city'}],beers:[photo]};
  const {catalog:subset} = createCatalogBootstrap(catalog), mapped = subset.beers[0];
  assert.deepEqual(classifyBeer(mapped), classifyBeer(photo));
  assert.deepEqual(mapped.imageContentBounds, photo.imageContentBounds);
  assert.deepEqual(mapped.awards, photo.awards); assert.equal(mapped.rating, photo.rating);
  assert.equal(mapped.ratingsCount, photo.ratingsCount);
  assert.deepEqual(mapped.sourceUrls, photo.sourceUrls); assert.equal(mapped.sourceNote, photo.sourceNote);
  assert.equal(mapped.sourceRecord.unused, undefined); assert.equal(mapped.mergedSourceRecords, undefined);
  assert.equal(mapped.sourceEvidence, undefined);
  assert.equal(mapped.locationEvidence,undefined);
  assert.equal(mapped.imageEvidence.rawAudit,undefined);
  assert.equal(mapped.imageEvidence.derivative,true);
  assert.equal(mapped.imageEvidence.cacheStatus,'cached');
  assert.equal(mapped.imageEvidence.isPlaceholder,false);
  assert.equal(photo.locationEvidence.rawAudit.length,3000,'the full catalogue still owns its source evidence');
  const fullIndex = createBeerPhotoIdentityIndex(catalog.beers), smallIndex = createBeerPhotoIdentityIndex(subset.beers);
  assert.equal(fullIndex.identityFor(photo), smallIndex.identityFor(mapped));
  assert.equal(fullIndex.isGeneric(photo), smallIndex.isGeneric(mapped));
  assert(Buffer.byteLength(JSON.stringify(subset)) < Buffer.byteLength(JSON.stringify(catalog)) / 2);
});

test('bootstrap is a standalone compressed file and never overwrites the complete chunks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brew-bootstrap-'));
  try {
    const catalog = fixture(), chunks = await writeCatalogChunks(catalog, directory, {maxFileBytes:750, gzip:true});
    const manifestBefore = await readFile(join(directory, 'catalog.manifest.json'));
    const result = await writeCatalogBootstrap(catalog, directory, {gzip:true});
    const json = await readFile(join(directory, 'catalog.bootstrap.json'));
    assert.deepEqual(gunzipSync(await readFile(join(directory, 'catalog.bootstrap.json.gz'))), json);
    assert.equal(result.bytes, json.length); assert.equal(result.bootstrap.catalog.beers.length, 0);
    assert.deepEqual(await readFile(join(directory, 'catalog.manifest.json')), manifestBefore);
    const records = (await Promise.all(chunks.parts.map(part => readFile(join(directory, part.path), 'utf8')))).flatMap(text => JSON.parse(text));
    assert.deepEqual(records, catalog.beers, 'all non-map records remain available in the full catalog');
    await writeCatalogBootstrap(catalog, directory);
    await assert.rejects(readFile(join(directory, 'catalog.bootstrap.json.gz')), {code:'ENOENT'});
  } finally { await rm(directory, {recursive:true, force:true}); }
});

test('static map and code gzip sidecars decode to unchanged originals without processing images or other sidecars', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'brew-static-gzip-'));
  try {
    await mkdir(join(directory,'nested'));
    const files = {'map.geojson':'{"type":"FeatureCollection","features":[]}',
      'nested/app.js':'const unicode = "中文 🍺";'.repeat(100),
      'app.css':'body { color: green; }'.repeat(100),
      'image.png':'not an image fixture: ignored by extension'};
    for (const [name,text] of Object.entries(files)) await writeFile(join(directory,name),text);
    const first = await writeStaticGzipSidecars(directory,['.geojson','.js','.css']);
    assert.equal(first.length,3);
    for (const {path,bytes,gzipBytes} of first) {
      const original = await readFile(path), compressed = await readFile(`${path}.gz`);
      assert.equal(original.length,bytes); assert.equal(compressed.length,gzipBytes);
      assert.deepEqual(gunzipSync(compressed),original);
    }
    const before = await readFile(join(directory,'map.geojson.gz'));
    assert.equal((await writeStaticGzipSidecars(directory,['.geojson','.js','.css'])).length,3);
    assert.deepEqual(await readFile(join(directory,'map.geojson.gz')),before);
    for (const [name,text] of Object.entries(files)) assert.equal(await readFile(join(directory,name),'utf8'),text);
    await assert.rejects(readFile(join(directory,'image.png.gz')),{code:'ENOENT'});
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('a separate explicit header budget retains all breweries without enlarging beer chunks',()=>{
 const catalog={metadata:{},breweries:[{id:'large',description:'x'.repeat(1200)}],beers:[{id:'one'},{id:'two'}]};
 const parts=[...encodeBeerChunks(catalog.beers,{maxFileBytes:100})];
 assert.throws(()=>createCatalogChunkManifest(catalog,parts,{maxFileBytes:100}),/manifest\/header/);
 const {manifest}=createCatalogChunkManifest(catalog,parts,{maxFileBytes:100,maxHeaderBytes:2000});
 assert.deepEqual(manifest.catalog.breweries,catalog.breweries);assert(parts.every(p=>p.bytes<=100));
});
