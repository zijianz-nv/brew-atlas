import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {applyWorldPhotoReplacements} from './apply-world-photo-replacements.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const registry=JSON.parse(await readFile(new URL('../public/data-sources/world-photo-replacements.json',import.meta.url),'utf8'));
const fixture=()=>({beers:registry.images.map(entry=>({
  id:entry.beerId,name:entry.beerId,image:entry.previousImage,imageOriginal:entry.previousImage,
  imageCredit:'Old Commons author',imageSource:'https://commons.wikimedia.org/old-photo',
  imageLicenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',
  imageEvidence:{originalSha256:entry.previousSha256},
  sourceUrls:['https://example.org/product'],description:'Original product facts',abv:5.3,
}))});

test('five verified exact-product photographs replace all display sizes and retain old provenance',async()=>{
  const catalog=fixture(),before=structuredClone(catalog),ids=await applyWorldPhotoReplacements(catalog,{root,registry});
  assert.equal(ids.length,5);
  for(let i=0;i<catalog.beers.length;i++){
    const beer=catalog.beers[i],entry=registry.images[i];
    assert.equal(beer.image,entry.newImage);assert.equal(beer.imageOriginal,entry.imageOriginal);
    assert.equal(beer.imageThumbnail,entry.imageThumbnail);assert.equal(beer.imageSource,entry.sourceUrl);
    assert.equal(beer.imageCredit,entry.imageCredit);assert.equal(beer.imageLicenseUrl,undefined);
    assert.equal(beer.imageBeforeReplacement.image,before.beers[i].image);
    assert.equal(beer.imageBeforeReplacement.imageLicenseUrl,before.beers[i].imageLicenseUrl);
    assert.equal(beer.imageEvidence.originalSha256,entry.sourceSha256);
    assert.equal(beer.imageDerivation.oldSourceRGBPreservedInDisplay,false);
    assert.equal(beer.description,before.beers[i].description);assert.equal(beer.abv,before.beers[i].abv);
    assert.deepEqual(beer.sourceUrls,before.beers[i].sourceUrls);
  }
});

test('an existing better photo or unknown/duplicate ID rejects the batch atomically',async()=>{
  const changed=fixture();changed.beers.at(-1).image='/images/better-official.png';const before=structuredClone(changed);
  await assert.rejects(applyWorldPhotoReplacements(changed,{root,registry}),/source no longer matches/);
  assert.deepEqual(changed,before);
  for(const bad of [
    {...registry,images:[...registry.images,registry.images[0]]},
    {...registry,images:[{...registry.images[0],beerId:'unknown'}]},
  ])await assert.rejects(applyWorldPhotoReplacements(fixture(),{root,registry:bad}),/duplicate or unknown/);
});

test('unreviewed replacements, stale source bytes and mismatched new provenance cannot be applied',async()=>{
  for(const [patch,error] of [
    [{reviewed:false},/Unreviewed/],
    [{previousSha256:'0'.repeat(64)},/hash changed/],
    [{fullSha256:'0'.repeat(64)},/hash changed/],
    [{imageEvidence:{originalSha256:'0'.repeat(64)}},/provenance/],
  ]){
    const catalog=fixture(),before=structuredClone(catalog),bad=structuredClone(registry);
    Object.assign(bad.images.at(-1),patch);
    await assert.rejects(applyWorldPhotoReplacements(catalog,{root,registry:bad}),error);
    assert.deepEqual(catalog,before);
  }
});
