import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {hasDescribedPhoto} from '../src/beer-photo-eligibility.mjs';
import {beerPhotoIdentityKeys, createBeerPhotoIdentityIndex, deduplicateBeerPhotos, REVIEWED_BEER_PHOTO_GROUPS} from '../src/beer-photo-identity.mjs';

const hash = digit => digit.repeat(64);
const beer = (id, extras = {}) => ({id, name:id, image:`/images/${id}.png`, description:'Citrus aroma and dry finish.', ...extras});
const ids = beers => beers.map(beer => beer.id);

test('different local paths with the same byte hash share one deterministic best supported rating', () => {
  const rows = [beer('many', {collection:'beertasting', rating:4.1, ratingsCount:30, imageEvidence:{originalSha256:hash('a')}}),
    beer('few', {collection:'beertasting', rating:5, ratingsCount:1, imageCache:{originalSha256:hash('a')}}),
    beer('best', {collection:'beertasting', rating:4.2, ratingsCount:20, imageEvidence:{sha256:hash('a')}})];
  for (const input of [rows, rows.toReversed(), [rows[1], rows[2], rows[0]]]) assert.deepEqual(ids(deduplicateBeerPhotos(input)), ['best']);
});

test('unscored duplicates favor actual complete fields, then stable IDs without modifying input', () => {
  const rows = Object.freeze([Object.freeze(beer('a', {image:'/same.png',rating:99})),
    Object.freeze(beer('z', {image:'/same.png',abv:5.2,ibu:30,style:'Pale Ale'}))]);
  assert.deepEqual(ids(deduplicateBeerPhotos(rows)), ['z']);
  assert.deepEqual(ids(deduplicateBeerPhotos([beer('b',{image:'/same.png'}),beer('a',{image:'/same.png'})])), ['a']);
  assert.equal(rows.length,2);assert.equal(rows[0].rating,99);
});

test('search restores every filtered beer and object, including another beer sharing the photo', () => {
  const rows = [beer('a',{image:'/same.png'}),beer('b',{image:'/same.png'})];
  const index = createBeerPhotoIdentityIndex(rows);
  const restored = index.deduplicate(rows,{searchActive:true});
  assert.deepEqual(restored, rows);assert.notEqual(restored,rows);assert.equal(restored[1],rows[1]);
  assert.deepEqual(index.deduplicate([rows[1]]),[rows[1]]);
});

test('asset aliases link across sources transitively; source webpages and query variants do not', () => {
  const rows = [beer('a',{imageDownloadUrl:'https://cdn.example/one.png',imageEvidence:{originalSha256:hash('b')}}),
    beer('b',{collection:'world',imageDownloadUrl:'https://cdn.example/one.png#ignored'}),
    beer('c',{image:'/other.png',imageEvidence:{originalSha256:hash('b')}})];
  const index = createBeerPhotoIdentityIndex(rows);
  assert.equal(new Set(rows.map(index.identityFor)).size,1);
  assert.equal(index.identityFor(rows[0]),`sha256:${hash('b')}`);
  const separate = [beer('d',{image:'https://cdn.example/photo?id=1',imageSource:'https://brewery.example/beers'}),
    beer('e',{image:'https://cdn.example/photo?id=2',imageSource:'https://brewery.example/beers'})];
  assert.equal(deduplicateBeerPhotos(separate).length,2);
});

test('blank or malformed identity evidence cannot merge unrelated items or suppress complete records', () => {
  const rows = [beer('a',{imageEvidence:{sha256:'null'}}),beer('b',{imageEvidence:{sha256:'null'}}),
    beer('c',{image:'/same.png',description:''}),beer('d',{image:'/same.png'}),beer('e',{image:null})];
  assert.equal(deduplicateBeerPhotos(rows).length,5);
  assert.deepEqual(beerPhotoIdentityKeys({image:null,imageEvidence:{sha256:hash('a')}}),[]);
});

test('reviewed generic barrel encodings are one identity, hidden by default, restored only by search', () => {
  const rows=REVIEWED_BEER_PHOTO_GROUPS[0].originalSha256s.map((sha,i)=>beer(`barrel-${i}`,{imageEvidence:{originalSha256:sha}}));
  const index=createBeerPhotoIdentityIndex(rows);
  assert.equal(index.identityFor(rows[0]),index.identityFor(rows[1]));
  assert(rows.every(index.isGeneric));
  assert.deepEqual(index.deduplicate(rows),[]);
  assert.deepEqual(index.deduplicate(rows,{searchActive:true}),rows);
});

test('similar actual archive packaging with different printed beer labels is not merged', () => {
  const archive=JSON.parse(fs.readFileSync(new URL('../public/data/archive.json',import.meta.url))).beers;
  const rows=archive.filter(b=>['archive-016','archive-093','archive-027','archive-028'].includes(b.id));
  assert.equal(rows.length,4);
  const index=createBeerPhotoIdentityIndex(rows);
  assert.equal(new Set(rows.map(index.identityFor)).size,4);
  assert.deepEqual(index.deduplicate(rows),rows);
});

test('only the manually reviewed Hinterland image pair is joined, with current bytes checked', () => {
  const archive=JSON.parse(fs.readFileSync(new URL('../public/data/archive.json',import.meta.url))).beers;
  const rows=archive.filter(b=>['archive-193','archive-222'].includes(b.id));
  const reviewed=REVIEWED_BEER_PHOTO_GROUPS.find(group=>group.kind==='reviewed_same_display_photo');
  for (const asset of reviewed.assets) {
    const bytes=fs.readFileSync(new URL(`../public${asset.path}`,import.meta.url));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256,'Reviewed photo changed; re-check image identity before merging.');
  }
  const index=createBeerPhotoIdentityIndex(rows);
  assert.equal(index.identityFor(rows[0]),index.identityFor(rows[1]));
  assert(rows.every(row=>!index.isGeneric(row)));
  assert.deepEqual(ids(index.deduplicate(rows)),['archive-193']);
  assert.deepEqual(index.deduplicate(rows,{searchActive:true}),rows);
});

test('real eligible catalog duplicate byte groups are collapsed, while searches preserve all beer IDs', () => {
  const all = ['world','archive','off','openbeer','beertasting'].flatMap(name=>JSON.parse(fs.readFileSync(new URL(`../public/data/${name}.json`,import.meta.url))).beers);
  const eligible=all.filter(hasDescribedPhoto), index=createBeerPhotoIdentityIndex(all), deduped=index.deduplicate(eligible);
  const groups = new Map();
  for (const row of eligible) {
    const path=row.imageOriginal||row.image;
    if (!path?.startsWith('/')) continue;
    const bytes=fs.readFileSync(new URL(`../public${path}`,import.meta.url));
    const digest=crypto.createHash('sha256').update(bytes).digest('hex');
    if (row.imageEvidence?.originalSha256) assert.equal(row.imageEvidence.originalSha256,digest,row.id);
    const group=groups.get(digest)||[];group.push(row);groups.set(digest,group);
  }
  for (const group of groups.values()) {
    if (group.length<2) continue;
    assert.equal(new Set(group.map(index.identityFor)).size,1,group.map(b=>b.id).join(','));
    assert.equal(deduped.filter(b=>group.includes(b)).length,group.every(index.isGeneric)?0:1);
  }
  assert(deduped.length<eligible.length,'existing exact byte duplicate sample should remain covered');
  assert.equal(new Set(deduped.map(index.identityFor)).size,deduped.length);
  assert.deepEqual(ids(index.deduplicate(eligible,{searchActive:true})),ids(eligible));
  const toit=eligible.filter(b=>b.name.startsWith('Toit '));
  assert(toit.length>=2);assert.equal(index.deduplicate(toit).length,0);assert.equal(index.deduplicate(toit,{searchActive:true}).length,toit.length);
});
