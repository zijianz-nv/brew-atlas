import test from 'node:test';
import assert from 'node:assert/strict';
import {createBeerPhotoIdentityIndex, REVIEWED_BEER_PHOTO_GROUPS} from '../src/beer-photo-identity.mjs';
import {chooseRandomBeer, hasRecommendableBeerPhoto, recommendableBeerCandidates} from '../src/random-beer.mjs';

const beer = (id, extras = {}) => ({id, name:id, image:`/images/${id}.png`, description:'官方介绍这款酒的酿造特点。', ...extras});

test('random candidates require a usable displayed photo and preserve all source fields', () => {
  const pictured = Object.freeze(beer('pictured', {sourceUrls:['https://brewery.example/pictured'], sourceNote:'保留来源说明'}));
  const records = Object.freeze([pictured, Object.freeze(beer('empty', {image:null})), beer('blank', {image:'  '}),
    beer('sentinel', {image:'null'}), beer('no-intro', {description:''}), beer('name-only', {description:'name-only'})]);
  const before = JSON.stringify(records);
  assert.deepEqual(recommendableBeerCandidates(records), [pictured]);
  assert.equal(JSON.stringify(records), before);
  assert.equal(chooseRandomBeer(recommendableBeerCandidates(records)), pictured);
});

test('reviewed generic images remain excluded even when the filtered alias lacks a hash', () => {
  const reviewed = beer('known-barrel', {image:'/images/barrel-a.png', imageDownloadUrl:'https://cdn.example/shared.png',
    imageEvidence:{originalSha256:REVIEWED_BEER_PHOTO_GROUPS[0].originalSha256s[0]}});
  const alias = beer('alias', {image:'/images/barrel-b.png', imageDownloadUrl:'https://cdn.example/shared.png'});
  const actual = beer('actual');
  const identityIndex = createBeerPhotoIdentityIndex([reviewed, alias, actual]);
  assert.deepEqual(recommendableBeerCandidates([alias, actual], {identityIndex}), [actual]);
  assert.deepEqual(recommendableBeerCandidates([reviewed]), []);
});

test('explicit placeholders, logos and recorded failed downloads are not recommendations', () => {
  const records = [beer('fallback', {image:'/brew-atlas/images/no-image.png'}), beer('generic', {image:'/images/placeholder.webp'}),
    beer('default-path', {image:'/images/default.png'}), beer('logo-path', {image:'/images/logo.jpg'}), beer('flag', {imagePlaceholder:true}), beer('logo', {imageKind:'brewery_logo'}), beer('cache-failed', {imageCacheStatus:'failed'}),
    beer('evidence-failed', {imageEvidence:{downloadStatus:'download_failed'}}), beer('unsafe', {image:'javascript:alert(1)'})];
  assert(records.every(record => !hasRecommendableBeerPhoto(record)));
  assert.deepEqual(recommendableBeerCandidates(records), []);
});

test('local subpaths, real product photos and public image URLs remain eligible', () => {
  const records = [beer('local', {image:'/brew-atlas/images/local.png'}),
    beer('external', {image:'https://cdn.example/product.png?v=2', imageSource:'https://brewery.example/placeholder-beer'}),
    beer('packshot', {imageKind:'official_product_packshot', imageEvidence:{individuallyVerified:false}})];
  assert.deepEqual(recommendableBeerCandidates(records), records);
});

test('random choices use only the current eligible scope and avoid repeating the current beer when possible', () => {
  const a=beer('a'), b=beer('b'), c=beer('c');
  assert.equal(chooseRandomBeer([a,b,c], {selectedId:'b', random:()=>0}), a);
  assert.equal(chooseRandomBeer([a,b,c], {selectedId:'b', random:()=>.99999}), c);
  assert.equal(chooseRandomBeer([b], {selectedId:'b', random:()=>0}), b);
});

test('empty or wholly unpictured results return no recommendation without using randomness', () => {
  const random=()=>{throw new Error('An empty pool must not be sampled');};
  assert.equal(chooseRandomBeer([], {random}), null);
  assert.equal(chooseRandomBeer(recommendableBeerCandidates([beer('no-photo',{image:null})]), {random}), null);
});
