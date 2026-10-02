import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoPrefetcher, mapPhotoSource} from '../src/photo-prefetch.mjs';

const beer = id => ({id, imageThumbnail: `/map/${id}.webp`, image: `/detail/${id}.png`, imageOriginal: `/original/${id}.jpg`});
function fixture(options = {}) {
  const images = [], settled = [];
  const prefetch = createPhotoPrefetcher({...options, onSettled: event => settled.push(event), createImage: () => {
    const image = {removed: false, removeAttribute(name) { if (name === 'src') this.removed = true; }};
    images.push(image); return image;
  }});
  return {prefetch, images, settled, loaded(index) { images[index].onload?.(); }, fail(index) { images[index].onerror?.(); }};
}

test('construction and queued updates are SSR safe and cannot compete with first photos', () => {
  const server = createPhotoPrefetcher();
  server.update([beer('a')]);
  assert.equal(server.snapshot().active, 0);
  assert.equal(server.snapshot().queued, 1);
  server.dispose();
  const f = fixture();
  f.prefetch.update([beer('a'), beer('b')]);
  assert.equal(f.images.length, 0);
  f.prefetch.setEnabled(true);
  assert.equal(f.images.length, 2);
  assert.equal(f.images[0].src, '/map/a.webp');
  assert.equal(f.images[0].fetchPriority, 'low');
});

test('only the map thumbnail or map image fallback is requested; source and identity duplicates collapse', () => {
  assert.equal(mapPhotoSource({imageOriginal: '/original.jpg'}), null);
  assert.equal(mapPhotoSource({image: '/fallback.png'}), '/fallback.png');
  const f = fixture({enabled: true});
  f.prefetch.update([beer('a'), beer('a'), {...beer('b'), imageThumbnail: '/map/a.webp'},
    {image: '/fallback.png'}, {imageOriginal: '/never.jpg'}, null]);
  assert.deepEqual(f.images.map(image => image.src), ['/map/a.webp', '/fallback.png']);
});

test('rapid camera updates discard obsolete queued sources but allow bounded in-flight work to finish', () => {
  const f = fixture({enabled: true, concurrency: 2});
  f.prefetch.update(['a', 'b', 'c', 'd'].map(beer));
  assert.equal(f.images.length, 2);
  f.prefetch.update(['f', 'e', 'a'].map(beer));
  assert.deepEqual(f.prefetch.snapshot().queuedSources, ['/map/f.webp', '/map/e.webp']);
  f.loaded(0);
  assert.equal(f.images[2].src, '/map/f.webp');
  f.loaded(1);
  assert.equal(f.images[3].src, '/map/e.webp');
  assert.equal(f.prefetch.snapshot().active, 2);
  assert.ok(f.images.every(image => !['/map/c.webp', '/map/d.webp'].includes(image.src)));
});

test('successful and failed thumbnails are not requested repeatedly on every movement', () => {
  const f = fixture({enabled: true, concurrency: 2});
  f.prefetch.update(['a', 'b'].map(beer));
  f.loaded(0); f.fail(1);
  f.prefetch.update(['a', 'b'].map(beer));
  assert.equal(f.images.length, 2);
  assert.deepEqual(f.settled, [{source: '/map/a.webp', ready: true}, {source: '/map/b.webp', ready: false}]);
  f.prefetch.markLoaded([beer('c'), '/map/d.webp']);
  f.prefetch.update(['c', 'd', 'e'].map(beer));
  assert.equal(f.images[2].src, '/map/e.webp');
});

test('cancel invalidates late load callbacks, and a later update can restart canceled work', () => {
  const f = fixture({enabled: true, concurrency: 1});
  f.prefetch.update(['a', 'b'].map(beer));
  const oldLoaded = f.images[0].onload;
  f.prefetch.cancel(); oldLoaded();
  assert.equal(f.images[0].removed, true);
  assert.equal(f.prefetch.snapshot().active, 0);
  assert.equal(f.prefetch.snapshot().queued, 0);
  assert.equal(f.prefetch.snapshot().loaded, 0);
  f.prefetch.update([beer('a')]);
  assert.equal(f.images.length, 2);
  f.loaded(1);
  assert.equal(f.prefetch.snapshot().loaded, 1);
});

test('hiding and disposal stop downloads, release images, and prevent terminal restart', () => {
  const f = fixture({enabled: true});
  f.prefetch.update([beer('a')]);
  f.prefetch.setEnabled(false);
  assert.equal(f.images[0].removed, true);
  f.prefetch.update([beer('b')]);
  assert.equal(f.images.length, 1);
  f.prefetch.setEnabled(true);
  assert.equal(f.images[1].src, '/map/b.webp');
  f.prefetch.dispose();
  f.prefetch.update([beer('c')]); f.prefetch.setEnabled(true);
  assert.equal(f.images.length, 2);
  assert.equal(f.images[1].removed, true);
  assert.equal(f.prefetch.snapshot().disposed, true);
});

test('decode holds its concurrency slot and cancellation ignores a pending decode', async () => {
  const images = [], resolves = [];
  const prefetch = createPhotoPrefetcher({enabled: true, concurrency: 1, createImage: () => {
    const image = {decode: () => new Promise(resolve => resolves.push(resolve)), removeAttribute() {}};
    images.push(image); return image;
  }});
  prefetch.update(['a', 'b'].map(beer));
  images[0].onload();
  assert.equal(images.length, 1);
  resolves[0](); await Promise.resolve();
  assert.equal(images.length, 2);
  images[1].onload(); prefetch.cancel();
  resolves[1](); await Promise.resolve();
  assert.equal(prefetch.snapshot().loaded, 1);
  assert.equal(prefetch.snapshot().active, 0);
});

test('huge candidate lists remain bounded and invalid image creation never wedges the queue', () => {
  const f = fixture({concurrency: 2, maxQueued: 3});
  f.prefetch.update(Array.from({length: 1000}, (_, index) => beer(index)));
  assert.equal(f.prefetch.snapshot().queued, 3);
  let calls = 0;
  const prefetch = createPhotoPrefetcher({enabled: true, createImage: () => { calls++; throw new Error('unavailable'); }});
  prefetch.update(['a', 'b'].map(beer));
  assert.equal(calls, 2);
  assert.equal(prefetch.snapshot().failed, 2);
  assert.equal(prefetch.snapshot().active, 0);
});
