import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {applyCatalogImageCutouts} from './apply-catalog-image-cutouts.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const registry=JSON.parse(await readFile(new URL('../public/data-sources/image-cutouts/catalog-cutouts.json',import.meta.url),'utf8'));
const fixture=()=>({beers:registry.images.map(entry=>({id:entry.beerId,name:entry.beerId,image:entry.sourceImage,...(entry.sourceField==='imageOriginal'?{image:'/images/previous-card.webp',imageOriginal:entry.sourceImage}:{}),sourceUrls:['https://example.org/product'],description:'Original product information',abv:5.3}))});

test('reviewed old-catalog cutouts replace both display sizes and preserve source photos and facts',async()=>{
 const catalog=fixture(),ids=await applyCatalogImageCutouts(catalog,{root,registry});
 assert.equal(ids.length,registry.images.length);assert.ok(ids.includes('weihen-dunkel'));
 for(let index=0;index<catalog.beers.length;index++){
  const beer=catalog.beers[index],entry=registry.images[index];
  assert.equal(beer.image,entry.image);assert.equal(beer.imageOriginal,entry.imageFull);
  assert.equal(beer.imageThumbnail,entry.imageThumbnail);assert.equal(beer.imageBeforeCutout[entry.sourceField||'image'],entry.sourceImage);
  assert.equal(beer.imageEvidence.originalSha256,entry.sourceSha256);assert.equal(beer.imageEvidence.derivative,true);
  assert.equal(beer.description,'Original product information');assert.equal(beer.abv,5.3);
  assert.deepEqual(beer.sourceUrls,['https://example.org/product']);
 }
});

test('changed original image identity rejects the whole override instead of applying a stale mask',async()=>{
 const catalog=fixture();catalog.beers.at(-1)[registry.images.at(-1).sourceField||'image']='/images/other.png';
 const before=structuredClone(catalog);
 await assert.rejects(applyCatalogImageCutouts(catalog,{root,registry}),/source no longer matches/);
 assert.deepEqual(catalog,before);
});

test('unreviewed derivatives and altered bytes are rejected',async()=>{
 const pending=structuredClone(registry);pending.images[0].reviewed=false;
 await assert.rejects(applyCatalogImageCutouts(fixture(),{root,registry:pending}),/Unreviewed/);
 const changed=structuredClone(registry);changed.images[0].sourceSha256='0'.repeat(64);
 await assert.rejects(applyCatalogImageCutouts(fixture(),{root,registry:changed}),/hash changed/);
});
