import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {contentImageStyle} from '../src/photo-content-layout.mjs';

const load=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const catalog=await load('public/data/regional.json');
const registry=await load('public/data-sources/regional/image-cutouts.json');
const beers=new Map(catalog.beers.map(beer=>[beer.id,beer]));
const bytes=asset=>readFile(new URL('../public'+asset,import.meta.url));
const hash=data=>createHash('sha256').update(data).digest('hex');

test('every displayed cutout retains a reviewed source and a full-resolution alpha PNG',async()=>{
 assert.ok(registry.images.length>=20);
 assert.equal(new Set(registry.images.map(r=>r.beerId)).size,registry.images.length);
 for(const record of registry.images){
  assert.equal(record.reviewStatus,'approved',record.beerId);
  const original=await bytes(record.sourceImage),edited=await bytes(record.image);
  assert.equal(hash(original),record.sourceSha256);
  assert.equal(hash(edited),record.imageSha256);
  assert.notEqual(record.image,record.sourceImage);
  assert.equal(edited.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(edited[25],6,'cutout is RGBA, not an RGB checkerboard');
  const beer=beers.get(record.beerId);
  assert.equal(beer.imageOriginal,record.image);
  assert.equal(beer.imageBeforeCutout.image,record.sourceImage);
  assert.equal(beer.imageDerivation.sourceSha256,record.sourceSha256);
  assert.equal(beer.imageDerivation.rgbPixelsUnchanged,true);
  assert.equal(beer.imageSource,beer.imageSource?.match(/^https?:\/\/.+/)?.[0]);
 }
});

test('map and card images use smaller local WebP copies with valid framing and evidence',async()=>{
 let full=0,map=0;
 for(const record of registry.images){
  const beer=beers.get(record.beerId),variants=beer.imageDerivation.displayVariants;
  assert.equal(beer.image,variants.card.path);
  assert.equal(beer.imageThumbnail,variants.map.path);
  assert.ok(contentImageStyle(beer,.52));
  for(const variant of Object.values(variants)){
   const asset=await bytes(variant.path);
   assert.equal(asset.toString('ascii',8,12),'WEBP');
   assert.equal(hash(asset),variant.sha256);
  }
  assert.equal(beer.imageEvidence.sha256,variants.card.sha256);
  full+=(await bytes(record.image)).length;
  map+=(await bytes(beer.imageThumbnail)).length;
 }
 assert.ok(map<full/2,'map should not download the full-resolution cutout set');
});
