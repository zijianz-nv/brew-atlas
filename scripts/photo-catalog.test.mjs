import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicRoot=realpathSync(path.join(root,'public'));
const read=name=>JSON.parse(readFileSync(path.join(publicRoot,'data',`${name}.json`),'utf8'));
const data=read('off'),originals=['world','archive','openbeer'].map(read);
const originalBreweries=new Map(originals.flatMap(part=>part.breweries).map(b=>[b.id,b]));
const breweryById=new Map(data.breweries.map(b=>[b.id,b]));
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const hasPoint=b=>Number.isFinite(b.lat)&&Number.isFinite(b.lng)&&Math.abs(b.lat)<=90&&Math.abs(b.lng)<=180;
const http=value=>{assert(nonempty(value),'Missing source URL');const u=new URL(value);assert(['http:','https:'].includes(u.protocol),value);assert(!u.username&&!u.password,'Source must not contain credentials');return u;};
const signature=bytes=>bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png'
  :bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpeg'
    :bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;

test('OFF photo collection preserves real product identities without colliding with older records',()=>{
  assert(data.metadata&&Array.isArray(data.beers)&&Array.isArray(data.breweries));
  assert(data.beers.length>0,'OFF collection is empty');
  assert.equal(new Set(data.beers.map(b=>b.id)).size,data.beers.length,'Duplicate OFF beer id');
  assert.equal(breweryById.size,data.breweries.length,'Duplicate OFF brewery id');
  const olderIds=new Set(originals.flatMap(part=>part.beers).map(b=>b.id)),codes=new Set();
  for(const beer of data.beers){
    assert(nonempty(beer.id)&&nonempty(beer.name));assert(!olderIds.has(beer.id),`${beer.id}: overwrites existing source`);
    assert.equal(beer.collection,'off');assert.equal(beer.craftStatus,'unknown',beer.id);
    assert(breweryById.has(beer.breweryId),`${beer.id}: orphan brewery`);
    assert(Array.isArray(beer.offCategories)&&beer.offCategories.includes('en:beers'),`${beer.id}: original beer category missing`);
    assert(Array.isArray(beer.packagingCodes)&&beer.packagingCodes.length>0,`${beer.id}: missing source barcode`);
    for(const code of beer.packagingCodes){assert(nonempty(code),beer.id);assert(!codes.has(code),`${code}: reused across product groups`);codes.add(code);}
    assert(Array.isArray(beer.sourceUrls)&&beer.sourceUrls.length>0,beer.id);beer.sourceUrls.forEach(http);
    for(const field of ['abv','ibu','srm'])assert(beer[field]===null||typeof beer[field]==='number'&&Number.isFinite(beer[field])&&beer[field]>=0,`${beer.id}.${field}: missing numbers must be null`);
    if(beer.abv!==null)assert(beer.abv<=100,beer.id);
    for(const field of ['rating','ratings','averageRating','untappdRating','ratingScore','score'])assert(!(field in beer),`${beer.id}: unsupported rating field ${field}`);
  }
});

test('every OFF record has an actual local image and attributable source',()=>{
  const hashes=new Map();
  for(const beer of data.beers){
    assert(nonempty(beer.image)&&beer.image.startsWith('/images/'),`${beer.id}: image must be local`);
    const file=realpathSync(path.resolve(publicRoot,`.${beer.image}`));
    assert(file.startsWith(`${publicRoot}${path.sep}`),`${beer.id}: image escapes public`);
    const bytes=readFileSync(file);assert(bytes.length>100,`${beer.id}: empty image`);assert(signature(bytes),`${beer.id}: file is not a supported real image`);
    assert(nonempty(beer.imageCredit),`${beer.id}: missing author/license attribution`);
    assert.match(beer.imageCredit,/Open Food Facts|CC BY-SA|Creative Commons/i,`${beer.id}: image credit lacks source/license`);
    assert.equal(http(beer.imageSource).hostname.endsWith('openfoodfacts.org'),true,`${beer.id}: unexpected image provenance`);
    if(beer.imageLicenseUrl)http(beer.imageLicenseUrl);
    if(beer.imageDownloadUrl)http(beer.imageDownloadUrl);
    const hash=createHash('sha256').update(bytes).digest('hex');if(!hashes.has(hash))hashes.set(hash,[]);hashes.get(hash).push(beer.id);
  }
  // Report repeated bytes for review rather than claiming distinct packaging
  // photos always represent distinct recipes or vice versa.
  console.log('OFF photo audit',JSON.stringify({records:data.beers.length,uniqueImageBytes:hashes.size,reusedImageGroups:[...hashes.values()].filter(ids=>ids.length>1).length}));
});

test('OFF map references preserve sourced coordinates and never turn sales countries into production locations',()=>{
  let mapped=0,unlocated=0;
  for(const brewery of data.breweries){
    assert(nonempty(brewery.id)&&nonempty(brewery.name));
    if(hasPoint(brewery)){
      const prior=originalBreweries.get(brewery.id);assert(prior,`${brewery.id}: unverified new map coordinate`);
      assert.deepEqual([brewery.lat,brewery.lng],[prior.lat,prior.lng],`${brewery.id}: reference coordinate changed`);
      assert.equal(brewery.country,prior.country,`${brewery.id}: reference country changed`);mapped++;
    }else{
      assert.equal(brewery.lat,null,`${brewery.id}: unusable latitude must be null`);assert.equal(brewery.lng,null,`${brewery.id}: unusable longitude must be null`);
      if(!originalBreweries.has(brewery.id))assert.equal(brewery.country,null,`${brewery.id}: unknown brand assigned a sales country`);
      unlocated++;
    }
  }
  for(const beer of data.beers){
    const brewery=breweryById.get(beer.breweryId);
    if(!hasPoint(brewery))continue;
    const evidence=beer.locationEvidence||brewery.locationEvidence;
    assert(evidence&&typeof evidence==='object',`${beer.id}: mapped brand needs location evidence`);
    assert.equal(evidence.productionLocationVerified,false,`${beer.id}: brand location is not verified production`);
    assert.equal(evidence.salesCountriesUsed,false,`${beer.id}: do not use market country`);
    assert.equal(evidence.sourceBreweryId,brewery.id,`${beer.id}: mismatched reference identity`);
    assert(Array.isArray(evidence.sourceUrls)&&evidence.sourceUrls.length>0,`${beer.id}: location source missing`);evidence.sourceUrls.forEach(http);
  }
  console.log('OFF geography audit',JSON.stringify({referenceBreweries:mapped,unlocatedBrandRecords:unlocated}));
});
