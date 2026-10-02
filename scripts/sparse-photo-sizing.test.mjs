import test from 'node:test';
import assert from 'node:assert/strict';
import { createSparsePhotoScaleMap, fitSparsePhotoFrames, MAX_SPARSE_PHOTO_SCALE } from '../src/sparse-photo-sizing.mjs';
import { photoDimensions } from '../src/marker-layout.mjs';

const place = (id, lat, lng, count = 3) => ({ id, lat, lng,
  photoBeers: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, image: `/${id}-${index}.webp` })),
});

test('isolated photo groups grow within a firm bound, while dense local collections stay compact', () => {
  const result = createSparsePhotoScaleMap([
    place('isolated', -31.95, 115.86), place('singleton', 64.13, -21.9, 1),
    place('dense', 50.8, 4.3, 30), place('near-dense', 50.9, 4.4, 2),
  ]);
  assert.equal(result.get('isolated'), MAX_SPARSE_PHOTO_SCALE);
  assert.equal(result.get('singleton'), MAX_SPARSE_PHOTO_SCALE);
  assert.equal(result.get('dense'), 1);
  assert.equal(result.get('near-dense'), 1);
  assert.ok([...result.values()].every(scale => scale >= 1 && scale <= 1.55));
});

test('all breweries sharing coordinates use their combined density and identical size', () => {
  const result = createSparsePhotoScaleMap([
    place('a', 12, 34, 10), place('b', 12, 34, 10), place('c', 12, 34, 10),
  ]);
  assert.deepEqual([...result.values()], [1, 1, 1]);
});

test('repeated beer records at a shared location do not inflate density', () => {
  const a = place('a', 12, 34, 4);
  const b = { ...a, id: 'b', photoBeers: [...a.photoBeers, ...a.photoBeers] };
  const result = createSparsePhotoScaleMap([a, b]);
  assert.deepEqual([...result.values()], [1.55, 1.55]);
});

test('nearby breweries across the date line constrain one another like any other neighbors', () => {
  const wrapped = createSparsePhotoScaleMap([place('a', 0, 179.9, 2), place('b', 0, -179.9, 30)]);
  const ordinary = createSparsePhotoScaleMap([place('a', 0, -0.1, 2), place('b', 0, 0.1, 30)]);
  assert.deepEqual(wrapped, ordinary);
  assert.equal(wrapped.get('a'), 1);
});

test('near the poles, large longitude differences remain geographically close', () => {
  const nearPole = createSparsePhotoScaleMap([place('a', 89.9, 0, 2), place('b', 89.9, 180, 30)]);
  const equator = createSparsePhotoScaleMap([place('a', 0, 0, 2), place('b', 0, 180, 30)]);
  assert.equal(nearPole.get('a'), 1);
  assert.equal(equator.get('a'), 1.55);
  const identicalPole = createSparsePhotoScaleMap([place('a', 90, 0, 12), place('b', 90, 180, 12)]);
  assert.deepEqual([...identicalPole.values()], [1, 1]);
});

test('density fades smoothly with geographic distance without a hard bucket boundary', () => {
  const scaleAt = lng => createSparsePhotoScaleMap([place('a', 0, 0, 3), place('b', 0, lng, 20)]).get('a');
  assert.ok(scaleAt(0.1) < scaleAt(1));
  assert.ok(scaleAt(1) < scaleAt(2));
  assert.equal(scaleAt(3), 1.55);
  assert.ok(Math.abs(scaleAt(1.999) - scaleAt(2.001)) < 0.002);
});

test('array ordering and unrelated distant additions do not change a local size preference', () => {
  const places = [place('a', 0, 0, 3), place('b', 0, 1, 9), place('c', 1, 1, 8)];
  const before = createSparsePhotoScaleMap(places);
  const after = createSparsePhotoScaleMap([...places].reverse().concat(place('far', -40, 120, 100)));
  for (const [id, scale] of before) assert.equal(after.get(id), scale);
});

test('invalid coordinates and missing eligible photos neither enlarge nor suppress nearby photos', () => {
  const entries = [place('valid', 1, 1), place('bad-lat', 100, 1, 100), place('bad-lng', 1, NaN, 100),
    { id: 'empty', lat: 1, lng: 1, photoBeers: [] },
    { id: 'missing-image', lat: 1, lng: 1, photoBeers: [{ id: 'missing' }, { image: ' ' }] },
    { id: 'missing-coordinates', photoBeers: place('source', 1, 1, 100).photoBeers }];
  const result = createSparsePhotoScaleMap(entries);
  assert.equal(result.get('valid'), 1.55);
  for (const entry of entries.slice(1)) assert.equal(result.get(entry.id), 1);
  assert.equal(createSparsePhotoScaleMap().size, 0);
});

const frame = (id, x, y, targetScale = 1.55) => ({ id, x, y, width: 20, height: 40, targetScale });
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const area = rect => (rect.right - rect.left) * (rect.bottom - rect.top);
const assertOverlapRules = result => {
  const values = [...result.values()];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      if (i === j) continue;
      const shared = overlap(values[i].rect, values[j].rect);
      assert.ok(shared <= Math.min(area(values[i].rect), area(values[j].rect)) * .22 + 1e-7);
      sum += shared;
    }
    assert.ok(sum <= area(values[i].rect) * .35 + 1e-7);
  }
};

test('sparse frames grow to their target and keep every original center and aspect ratio', () => {
  const frames = [frame('a', 50, 50), frame('b', 150, 50, 1.3)];
  const result = fitSparsePhotoFrames(frames);
  assert.equal(result.get('a').scale, 1.55);
  assert.equal(result.get('b').scale, 1.3);
  for (const original of frames) {
    const { rect } = result.get(original.id);
    assert.equal((rect.left + rect.right) / 2, original.x);
    assert.equal((rect.top + rect.bottom) / 2, original.y);
    assert.equal((rect.right - rect.left) / (rect.bottom - rect.top), .5);
  }
});

test('a larger preferred frame reserves all neighbors instead of hiding them', () => {
  const frames = [frame('a', 50, 50), frame('b', 67, 50), frame('c', 84, 50)];
  const result = fitSparsePhotoFrames(frames);
  assert.equal(result.size, frames.length);
  assert.ok(result.get('a').scale < 1.55);
  for (const entry of frames) assert.ok(result.get(entry.id).scale >= 1);
  assertOverlapRules(result);
});

test('expansion respects summed overlap on already placed neighbors, not just individual pairs', () => {
  const frames = [frame('left', 32, 50), frame('center', 50, 50), frame('right', 68, 50),
    frame('above', 50, 12), frame('below', 50, 88)];
  const result = fitSparsePhotoFrames(frames);
  assert.equal(result.size, frames.length);
  assertOverlapRules(result);
  assert.ok([...result.values()].some(value => value.scale < 1.55));
});

test('viewport or control constraints cap expansion while preserving the validated base photo', () => {
  const result = fitSparsePhotoFrames([frame('edge', 10, 50), frame('near-edge', 112, 50)], {
    acceptRect: rect => rect.left >= 0 && rect.right <= 125 && rect.top >= 0 && rect.bottom <= 100,
  });
  assert.equal(result.get('edge').scale, 1);
  assert.equal(result.get('near-edge').scale, 1.25);
  const rejected = fitSparsePhotoFrames([frame('base', 50, 50)], { acceptRect: () => false });
  assert.equal(rejected.get('base').scale, 1);
  assert.deepEqual(rejected.get('base').rect, { left: 40, right: 60, top: 30, bottom: 70 });
});

test('invalid targets never shrink base photos or exceed the global enlargement bound', () => {
  const result = fitSparsePhotoFrames([frame('huge', 50, 50, 100), frame('small', 150, 50, .5), frame('unknown', 250, 50, NaN)]);
  assert.equal(result.get('huge').scale, 1.55);
  assert.equal(result.get('small').scale, 1);
  assert.equal(result.get('unknown').scale, 1);
});

test('sparse enlargement preserves distant perspective sizing without restoring the near-view pixel floor', () => {
  for(const compact of [false,true]){
    const dimensions=photoDimensions({compact,photoZoomBase:2.5/2.5,zoom:2.5/19});
    const input={id:'distant',x:50,y:50,width:dimensions.photoWidth,height:dimensions.photoHeight,targetScale:1.55};
    const {scale,rect}=fitSparsePhotoFrames([input]).get(input.id);
    assert.equal(scale,1.55);
    assert.ok(Math.abs((rect.bottom-rect.top)-dimensions.photoHeight*scale)<1e-8);
    assert.ok(Math.abs((rect.right-rect.left)-dimensions.photoWidth*scale)<1e-8);
    assert.ok(rect.bottom-rect.top<8);
    assert.equal((rect.left+rect.right)/2,input.x);
    assert.equal((rect.top+rect.bottom)/2,input.y);
  }
});
