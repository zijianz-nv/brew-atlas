import test from 'node:test';
import assert from 'node:assert/strict';
import {beerImageSource} from '../src/beer-image-source.mjs';

const describedBeer = Object.freeze({
  name: 'Example IPA',
  description: 'Citrus hop aroma and a dry finish.',
  image: '/images/example.webp',
  imageOriginal: '/images/originals/example.jpg',
  imageThumbnail: '/images/thumbnails/example.webp',
});
const variants = ['card', 'original', 'thumbnail'];

test('partial records require both a primary image and a usable introduction for every variant', () => {
  for (const beer of [undefined, null, {}, {...describedBeer, image: null}, {...describedBeer, image: '  '}, {...describedBeer, description: '暂无介绍'}]) {
    for (const variant of variants) assert.equal(beerImageSource(beer, variant), null);
  }
  const beer = Object.freeze({...describedBeer, description: '', originalDescription: '<p>A bright, hoppy ale.</p>'});
  assert.equal(beerImageSource(beer), beer.image);
});

test('card, original, and thumbnail surfaces select their own image sources', () => {
  assert.equal(beerImageSource(describedBeer), describedBeer.image);
  assert.equal(beerImageSource(describedBeer, 'card'), describedBeer.image);
  assert.equal(beerImageSource(describedBeer, 'original'), describedBeer.imageOriginal);
  assert.equal(beerImageSource(describedBeer, 'thumbnail'), describedBeer.imageThumbnail);
  assert.equal(beerImageSource(describedBeer, 'unknown'), describedBeer.image);
});

test('detail images retain the processed primary image when derivative evidence is present', () => {
  for (const derivative of [true, 'background_removed', {operation: 'crop'}]) {
    const beer = Object.freeze({...describedBeer, imageEvidence: Object.freeze({derivative})});
    assert.equal(beerImageSource(beer, 'original'), beer.image);
    assert.equal(beerImageSource(beer, 'thumbnail'), beer.imageThumbnail);
  }
  assert.equal(beerImageSource({...describedBeer, imageEvidence: {derivative: false}}, 'original'), describedBeer.imageOriginal);
});

test('missing original and thumbnail images fall back to the primary image', () => {
  for (const missing of [undefined, null, '']) {
    const beer = Object.freeze({...describedBeer, imageOriginal: missing, imageThumbnail: missing});
    for (const variant of variants) assert.equal(beerImageSource(beer, variant), beer.image);
  }
});

test('local, encoded, external, and data URLs are preserved exactly for the selected source', () => {
  for (const source of ['/images/local.webp', './images/beer%20name.webp?v=2#crop', 'https://cdn.example/beer.jpg?size=large&v=2', '//cdn.example/beer.webp', 'data:image/webp;base64,UklGRg==']) {
    assert.equal(beerImageSource({...describedBeer, image: source}), source);
    assert.equal(beerImageSource({...describedBeer, imageOriginal: source}, 'original'), source);
    assert.equal(beerImageSource({...describedBeer, imageThumbnail: source}, 'thumbnail'), source);
  }
});
