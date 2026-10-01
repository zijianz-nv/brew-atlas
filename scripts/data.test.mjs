import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = realpathSync(resolve(root, 'public'));
const collections = Object.fromEntries(['world', 'archive'].map(name => [name, JSON.parse(readFileSync(resolve(publicRoot, `data/${name}.json`), 'utf8'))]));
const breweries = Object.values(collections).flatMap(value => value.breweries);
const beers = Object.values(collections).flatMap(value => value.beers);
const breweryFields = ['id','name','nameZh','country','countryZh','city','lat','lng','locationPrecision','year','website','description','sourceUrls'];
const beerFields = ['id','name','breweryId','style','styleZh','abv','ibu','srm','description','originalDescription','flavors','hops','malts','yeast','foodPairings','firstBrewed','image','imageCredit','imageSource','sourceUrls','sourceNote','collection'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const httpUrl = value => {
  assert.ok(nonempty(value), 'Source URL must be nonempty');
  const url = new URL(value);
  assert.ok(['http:', 'https:'].includes(url.protocol), `Expected HTTP(S): ${value}`);
  assert.ok(url.hostname.includes('.'), `Public hostname required: ${value}`);
  assert.equal(url.username, '', 'No embedded credentials');
  assert.equal(url.password, '', 'No embedded credentials');
};
function dimensions(data, ext) {
  if (ext === '.png') {
    assert.deepEqual(data.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(data.toString('ascii',12,16), 'IHDR');
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  assert.ok(['.jpg','.jpeg'].includes(ext));
  assert.equal(data.readUInt16BE(0),0xffd8,'Missing JPEG signature');
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while (offset < data.length-8) {
    if (data[offset]!==0xff) {offset++;continue;}
    while(data[offset]===0xff) offset++;
    const marker=data[offset++];
    if(marker===0xd8||marker===0xd9||(marker>=0xd0&&marker<=0xd7)) continue;
    const length=data.readUInt16BE(offset);
    assert.ok(length>=2&&offset+length<=data.length,'Invalid JPEG segment');
    if(sof.has(marker)) return [data.readUInt16BE(offset+5),data.readUInt16BE(offset+3)];
    offset+=length;
  }
  throw new Error('JPEG dimensions not found');
}

test('required record shapes and unique IDs in each entity table',()=>{
  for(const [name,data] of Object.entries(collections)) {
    assert.ok(Array.isArray(data.breweries)&&data.breweries.length>0,name);
    assert.ok(Array.isArray(data.beers)&&data.beers.length>0,name);
    for(const [rows,fields] of [[data.breweries,breweryFields],[data.beers,beerFields]]) {
      for(const row of rows) {
        for(const field of fields) assert.ok(Object.hasOwn(row,field),`${row.id}: missing ${field}`);
        assert.match(row.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.ok(nonempty(row.name)&&nonempty(row.description),row.id);
      }
    }
    data.beers.forEach(beer=>assert.equal(beer.collection,name,beer.id));
  }
  assert.equal(new Set(breweries.map(row=>row.id)).size,breweries.length,'Duplicate brewery IDs');
  assert.equal(new Set(beers.map(row=>row.id)).size,beers.length,'Duplicate beer IDs');
});

test('valid brewery foreign keys, five world countries, and BrewDog-only archive',()=>{
  for(const data of Object.values(collections)) {
    const ids=new Set(data.breweries.map(row=>row.id));
    for(const beer of data.beers) assert.ok(ids.has(beer.breweryId),`${beer.id}: orphan brewery`);
    for(const id of ids) assert.ok(data.beers.some(beer=>beer.breweryId===id),`${id}: empty brewery`);
  }
  assert.ok(new Set(collections.world.breweries.map(row=>row.country)).size>=5);
  assert.equal(collections.archive.breweries.length,1);
  assert.match(collections.archive.breweries[0].name,/BrewDog/i);
  assert.equal(collections.archive.breweries[0].country,'United Kingdom');
  for(const beer of collections.archive.beers) {
    assert.equal(beer.breweryId,collections.archive.breweries[0].id);
    assert.match(beer.sourceNote,/历史/);
    assert.match(beer.sourceNote,/不表示/);
  }
});

test('finite coordinates, country consistency and explicit location precision',()=>{
  const boxes={'United States':[24,50,-125,-66],'Belgium':[49,52,2,7],'Germany':[47,56,5,16],'Ireland':[51,56,-11,-5],'Czechia':[48,52,12,19],'Japan':[24,46,122,146],'Australia':[-44,-10,112,154],'United Kingdom':[49,61,-9,3],'Canada':[41,84,-142,-52],'Netherlands':[50,54,3,8],'Norway':[57,72,4,32],'Denmark':[54,58,7,16],'Brazil':[-34,6,-74,-34],'Sweden':[55,70,10,25]};
  for(const row of breweries) {
    assert.equal(typeof row.lat,'number',`${row.id}: null/non-numeric lat`);
    assert.equal(typeof row.lng,'number',`${row.id}: null/non-numeric lng`);
    assert.ok(Number.isFinite(row.lat)&&row.lat>=-90&&row.lat<=90,row.id);
    assert.ok(Number.isFinite(row.lng)&&row.lng>=-180&&row.lng<=180,row.id);
    assert.ok(['brewery','city'].includes(row.locationPrecision),row.id);
    assert.ok(nonempty(row.country)&&nonempty(row.countryZh)&&nonempty(row.city),row.id);
    const b=boxes[row.country];assert.ok(b,`Review bounds for ${row.country}`);
    assert.ok(row.lat>=b[0]&&row.lat<=b[1]&&row.lng>=b[2]&&row.lng<=b[3],`${row.id}: wrong country/hemisphere`);
    if(row.locationPrecision==='city') assert.match(row.description,/城市|市中心|总部|参考/);
    assert.ok(row.year===null||(Number.isInteger(row.year)&&row.year>0&&row.year<=2026),row.id);
  }
});

test('nonempty source URLs and specific image attribution',()=>{
  for(const row of [...breweries,...beers]) {
    assert.ok(Array.isArray(row.sourceUrls)&&row.sourceUrls.length>0,`${row.id}: missing source`);
    row.sourceUrls.forEach(httpUrl);
  }
  breweries.forEach(row=>httpUrl(row.website));
  for(const beer of beers) {
    httpUrl(beer.imageSource);
    assert.ok(nonempty(beer.imageCredit)&&nonempty(beer.sourceNote),beer.id);
    if(beer.collection==='world') {
      httpUrl(beer.imageLicenseUrl);
      assert.match(beer.imageCredit,/CC BY|CC0/);
    } else assert.match(beer.imageCredit,/非商业/);
  }
});

test('all images are local, unique, valid JPEG/PNG files with usable dimensions',()=>{
  const hashes=[];
  for(const beer of beers) {
    assert.match(beer.image,/^\/images\/[a-z0-9-]+\.(?:png|jpg|jpeg)$/);
    const file=realpathSync(resolve(publicRoot,`.${beer.image}`));
    const rel=relative(publicRoot,file);
    assert.ok(rel&&!rel.startsWith(`..${sep}`)&&rel!=='..',`${beer.id}: image escaped public`);
    assert.ok(statSync(file).isFile());
    const data=readFileSync(file);assert.ok(data.length>1000,beer.id);
    const [w,h]=dimensions(data,extname(file));assert.ok(w>=100&&h>=100,`${beer.id}: ${w}x${h}`);
    hashes.push(createHash('sha256').update(data).digest('hex'));
  }
  assert.equal(new Set(hashes).size,hashes.length,'Reused generic image/duplicate asset');
});

test('parameters are numbers or null and missing facts stay null',()=>{
  for(const beer of beers) {
    for(const field of ['abv','ibu','srm']) {
      const value=beer[field];if(value===null) continue;
      assert.equal(typeof value,'number',`${beer.id}.${field}`);
      assert.ok(Number.isFinite(value)&&value>=0,`${beer.id}.${field}: negative/nonfinite parameter`);
    }
    assert.ok(beer.abv===null||beer.abv<=100,beer.id);
  }
  const byId=new Map(beers.map(beer=>[beer.id,beer]));
  // Known missing values must not be silently converted to 0. Low alcohol is not zero alcohol.
  for(const [id,field] of [['duvel','ibu'],['guinness','ibu'],['sierra-pale','srm'],['archive-410','srm'],['archive-413','srm']]) assert.equal(byId.get(id)[field],null,`${id}.${field}`);
  assert.equal(byId.get('archive-032').abv,0.5);
  assert.equal(byId.get('archive-364').abv,0.5);
  assert.equal(byId.get('archive-095').ibu,0);
  assert.equal(byId.get('archive-095').sourceRecord.ibu,0);
});

test('flavor and recipe fields retain declared types and readable descriptions',()=>{
  for(const beer of beers) {
    assert.ok(nonempty(beer.originalDescription)&&nonempty(beer.style)&&nonempty(beer.styleZh),beer.id);
    assert.ok(Array.isArray(beer.flavors),beer.id);
    if(beer.flavors.length===0) assert.ok(beer.collection==='archive'&&beer.sourceRecord,`${beer.id}: missing flavor provenance`);
    for(const field of ['flavors','hops','malts','foodPairings']) {
      assert.ok(Array.isArray(beer[field])&&beer[field].every(nonempty),`${beer.id}.${field}`);
      assert.equal(new Set(beer[field]).size,beer[field].length,`${beer.id}.${field}: duplicate tags`);
    }
    assert.ok(beer.yeast===null||nonempty(beer.yeast),beer.id);
    assert.ok(beer.firstBrewed===null||nonempty(beer.firstBrewed),beer.id);
  }
});

test('no invented ratings, review counts, prices or numerical flavor profiles',()=>{
  const prohibited=/^(?:ratings?|ratingCount|reviews?|reviewCount|scores?|stars|popularity|prices?|sensoryScores?|flavou?rScores?|radar|flavou?rProfile)$/i;
  function inspect(value,path) {
    if(!value||typeof value!=='object') return;
    for(const [key,child] of Object.entries(value)) {
      assert.ok(!prohibited.test(key),`${path}.${key}: unverified quantitative field`);
      inspect(child,`${path}.${key}`);
    }
  }
  inspect(collections,'collections');
});
