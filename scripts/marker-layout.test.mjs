import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutMapMarkers, markerBounds, photoDimensions, photoLandBounds, photoTouchesLand } from '../src/marker-layout.mjs';
import { createGeographicLandMask, createScreenLandMask } from '../src/land-mask.mjs';
import { compareBeerPhotoRank } from '../src/beer-ranking.mjs';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera } from 'three';
import { createSphereUnprojector } from '../src/map-projection.mjs';

const place = (id, x, y, extras = {}) => ({
  id, x, y, lat: 30 + y / 100, lng: x / 100, beerCount: 2,
  brewery: { id, name: id }, photoBeers: [{ id: `${id}-beer`, image: `/images/${id}.jpg` }], ...extras,
});
const options = { width: 1000, height: 700 };
const photos = (id, n) => Array.from({ length: n }, (_, index) => ({ id: `${id}-${String(index).padStart(3, '0')}`, image: `/images/${id}-${index}.jpg` }));
const ratedPhoto = (id, rating, ratingsCount, extras = {}) => ({ id, image: `/images/${id}.webp`, collection: 'beertasting', rating, ratingsCount, ...extras });
function intersection(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}
function mockLand(regions, water = []) {
  const pointIn = (x, y, rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  const componentAt = (x, y) => water.some(rect => pointIn(x, y, rect)) ? -1 : regions.findIndex(rect => pointIn(x, y, rect));
  const mask = { componentAt, rejectedWithLandCenter: 0, containsRect(rect) {
    const contains = regions.some(land => rect.left >= land.left && rect.right <= land.right && rect.top >= land.top && rect.bottom <= land.bottom)
      && !water.some(hole => intersection(rect, hole) > 0);
    if (!contains && componentAt((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2) >= 0) mask.rejectedWithLandCenter++;
    return contains;
  } };
  return mask;
}
function assertGeometry(result, input, opts = options) {
  const represented = result.markers.flatMap(marker => marker.members || [marker.representative]);
  assert.deepEqual([...represented, ...result.clipped.map(item => item.entry)].map(item => item.id).sort(), input.map(item => item.id).sort());
  const source = new Map(input.map(item => [item.id, item]));
  const seenPhotos = new Set();
  const hitRects = [];
  for (const marker of result.markers) {
    const original = source.get(marker.anchorId);
    assert.deepEqual([marker.x, marker.y, marker.lat, marker.lng], [original.x, original.y, original.lat, original.lng]);
    assert.equal(marker.brewery, original.brewery);
    const rect = markerBounds(marker);
    assert.ok(rect.left >= (opts.leftMargin ?? 8) - 1e-8 && rect.right <= opts.width - (opts.rightMargin ?? 8) + 1e-8, JSON.stringify(rect));
    assert.ok(rect.top >= (opts.topMargin ?? 8) - 1e-8 && rect.bottom <= opts.height - (opts.bottomMargin ?? 8) + 1e-8, JSON.stringify(rect));
    assert.equal(marker.countRect, null, 'only photographs occupy the map; no count/dot rectangle remains');
    if (marker.photos.length) assert.ok(marker.markerWidth > 0 && marker.markerHeight > 0);
    else {
      assert.equal(marker.markerWidth, 0); assert.equal(marker.markerHeight, 0);
      assert.equal(marker.displayOffsetX, 0); assert.equal(marker.displayOffsetY, 0);
      assert.deepEqual(marker.occupancyRects, [], 'metadata-only groups reserve no screen space');
    }
    const photoRects = [];
    for (const photo of marker.photos) {
      const place = source.get(photo.sourceId);
      assert.ok(place.photoBeers.includes(photo.beer), 'representative must be an actual beer of its stated source brewery');
      assert.deepEqual([photo.sourceLat, photo.sourceLng, photo.sourceX, photo.sourceY], [place.lat, place.lng, place.x, place.y]);
      assert.ok(!seenPhotos.has(photo.beer.id), 'no duplicate beer images added as decorative copies'); seenPhotos.add(photo.beer.id);
      const px = photo.sourceX + photo.displayOffsetX, py = photo.sourceY + photo.displayOffsetY;
      assert.ok(Math.abs(px - (marker.x + marker.displayOffsetX + photo.x)) < 1e-8);
      assert.ok(Math.abs(py - (marker.y + marker.displayOffsetY + photo.y)) < 1e-8);
      const p = { left: px - photo.width / 2, right: px + photo.width / 2, top: py - photo.height / 2, bottom: py + photo.height / 2 };
      assert.ok(p.left >= rect.left - 1e-8 && p.right <= rect.right + 1e-8 && p.top >= rect.top - 1e-8 && p.bottom <= rect.bottom + 1e-8);
      const maximumHeight = photoDimensions({ compact: opts.compact, zoom: 100 }).photoHeight;
      assert.ok(photo.width > 0 && photo.height > 0 && photo.height <= maximumHeight, 'uniform frames remain positive without a near-view minimum in the distant sky');
      assert.equal(photo.scale, 1, 'every visible photo must share the viewport zoom scale');
      assert.deepEqual({ photoWidth: photo.width, photoHeight: photo.height }, { photoWidth: marker.photoWidth, photoHeight: marker.photoHeight });
      assert.ok(Math.abs(photo.width - photo.height * .52) <= .006, 'the complete image frame keeps its aspect ratio when zoomed');
      assert.ok(Math.hypot(photo.displayOffsetX, photo.displayOffsetY) <= photo.maxDisplayDistance + 1e-8, 'visual expansion remains close to its own source brewery');
      if (opts.landMask) {
        assert.ok(photoTouchesLand(opts.landMask, p), 'the actual image frame must intersect land; padding cannot manufacture contact');
        assert.ok(photo.landContactX >= p.left && photo.landContactX <= p.right && photo.landContactY >= p.top && photo.landContactY <= p.bottom);
        const component = opts.landMask.componentAt(photo.landContactX, photo.landContactY);
        assert.equal(component >= 0 ? component : null, photo.landComponent);
        if (opts.landMask.geographicAt) {
          const point = opts.landMask.geographicAt(photo.landContactX, photo.landContactY);
          assert.ok(point && opts.landMask.geographicContains(point.lng, point.lat), 'routing support is actual land inside this frame');
          assert.ok(opts.landMask.geographicAt(px, py), 'image center has a real display coordinate');
        }
      }
      photoRects.push(p);
    }
    assert.equal(marker.occupancyRects.length, photoRects.length);
    for (let i = 0; i < photoRects.length; i++) {
      for (const edge of ['left', 'right', 'top', 'bottom']) assert.ok(Math.abs(photoRects[i][edge] - marker.occupancyRects[i][edge]) < 1e-8);
      for (const obstacle of opts.obstacles || []) assert.equal(intersection(photoRects[i], obstacle), 0, 'actual photographs must avoid overlays');
    }
    const availableIds = new Set(marker.members.flatMap(member => member.photoBeers || []).filter(beer => typeof beer.image === 'string' && beer.image.trim()).map(beer => beer.id));
    assert.equal(marker.availablePhotoCount, availableIds.size);
    assert.equal(marker.hiddenPhotoCount, marker.availablePhotoCount - marker.photos.length);
    assert.ok(marker.maximumPhotos >= marker.photos.length);
    hitRects.push(...photoRects);
  }
  const overlapAreas = hitRects.map(() => 0);
  const area = rect => (rect.right - rect.left) * (rect.bottom - rect.top);
  for (let i = 0; i < hitRects.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = hitRects[i], b = hitRects[j];
      const overlap = intersection(a, b);
      assert.ok(overlap <= Math.min(area(a), area(b)) * .22 + 1e-8, 'a pair can overlap at most 22% of the smaller frame');
      overlapAreas[i] += overlap; overlapAreas[j] += overlap;
    }
    assert.ok(overlapAreas[i] <= area(hitRects[i]) * .35 + 1e-8, 'already tested neighbours must not hide a photograph');
  }
  for (let i = 0; i < hitRects.length; i++) assert.ok(overlapAreas[i] <= area(hitRects[i]) * .35 + 1e-8,
    'all neighbouring intersections together cover at most 35% of each frame');
  assert.equal(result.markers.reduce((sum, item) => sum + item.beerCount, 0), represented.reduce((sum, item) => sum + item.beerCount, 0));
}

test('photo ranking prefers supported high ratings before tiny-sample perfect ratings with stable ties', () => {
  const input = Object.freeze([
    ratedPhoto('tiny-perfect', 5, 1), ratedPhoto('good-many', 4.2, 1500),
    ratedPhoto('best-supported', 4.8, 10), ratedPhoto('equal-fewer', 4.6, 20),
    ratedPhoto('equal-more-b', 4.6, 100), ratedPhoto('equal-more-a', 4.6, 100),
    ratedPhoto('small-good', 4.4, 9), { id: 'unknown', image: '/images/unknown.webp' },
  ].map(Object.freeze));
  const before = JSON.stringify(input);
  const expected = ['best-supported', 'equal-more-a', 'equal-more-b', 'equal-fewer', 'good-many', 'tiny-perfect', 'small-good', 'unknown'];
  assert.deepEqual([...input].sort(compareBeerPhotoRank).map(beer => beer.id), expected);
  assert.deepEqual([...input].reverse().sort(compareBeerPhotoRank).map(beer => beer.id), expected);
  assert.equal(JSON.stringify(input), before, 'sorting does not overwrite source ratings or the source array');
});

test('ranking does not mix other scales, cheers counts, invalid values, or zero-review placeholder scores', () => {
  const unknown = [
    ratedPhoto('old-scale', 5, 10000, { collection: 'archive' }),
    ratedPhoto('legacy-no-source', 4.9, 200, { collection: undefined }),
    ratedPhoto('cheers-only', 5, undefined, { cheers_count: 50000, sourceRecord: { cheers_count: 50000 } }),
    ratedPhoto('no-votes', 5, 0), ratedPhoto('fractional-count', 5, 1.5), ratedPhoto('negative-count', 5, -20),
    ratedPhoto('missing-score', null, 100), ratedPhoto('string-score', '4.9', 100),
    ratedPhoto('string-count', 4.9, '100'), ratedPhoto('too-high', 5.1, 100),
    ratedPhoto('negative-score', -0.1, 100), ratedPhoto('infinite-score', Infinity, 100),
    ratedPhoto('nan-score', NaN, 100),
  ];
  const supported = ratedPhoto('supported', 4, 10);
  const result = [...unknown, supported].sort(compareBeerPhotoRank);
  assert.equal(result[0], supported);
  assert.deepEqual(result.slice(1).map(beer => beer.id), unknown.map(beer => beer.id).sort());
  assert.equal(result.length, unknown.length + 1, 'unknown ratings are retained, never filtered out');
  assert.ok(compareBeerPhotoRank(ratedPhoto('zero-real', 0, 10), ratedPhoto('few-perfect', 5, 9)) < 0, 'a real zero with positive reviews is not missing');
});

test('far view and enlarged pictures retain source rating priority without changing source data', () => {
  const beerPhotos = [...photos('unknown', 220), ratedPhoto('best-reviewed', 4.6, 200), ratedPhoto('few-perfect', 5, 1)];
  const input = [place('p', 195, 170, { beerCount: beerPhotos.length, photoBeers: beerPhotos })];
  const before = JSON.stringify(input), opts = { width: 390, height: 340, compact: true };
  const far = layoutMapMarkers(input, { ...opts, zoom: 1 }), near = layoutMapMarkers(input, { ...opts, zoom: 8 });
  assert.deepEqual(far.markers[0].photos.slice(0, 2).map(photo => photo.beer.id), ['best-reviewed', 'few-perfect']);
  assert.ok(far.markers[0].photos.some(photo => photo.beer.rating === undefined), 'unknown scores still get available space');
  assert.deepEqual(near.markers[0].photos.slice(0, 2).map(photo => photo.beer.id), ['best-reviewed', 'few-perfect']);
  assert.ok(near.markers[0].photoHeight > far.markers[0].photoHeight);
  assert.equal(near.markers[0].photoHeight, 32); // Compact maximum, not a fixed-size thumbnail.
  assert.equal(JSON.stringify(input), before);
  assertGeometry(far, input, opts);
  assertGeometry(near, input, opts);
});

test('regional rating priority keeps the first-photo opportunity for lower-rated and unknown breweries', () => {
  const input = [
    place('a-lower', 400, 300, { photoBeers: [ratedPhoto('lower', 3.8, 500)] }),
    place('z-high', 400, 300, { beerCount: 200, photoBeers: photos('high', 200).map(beer => ({ ...beer, collection: 'beertasting', rating: 4.7, ratingsCount: 100 })) }),
    place('m-unknown', 400, 300),
  ];
  const before = JSON.stringify(input), result = layoutMapMarkers(input, options);
  assert.deepEqual(result.markers[0].photos.slice(0, 3).map(photo => photo.sourceId), ['z-high', 'a-lower', 'm-unknown']);
  assert.equal(result.markers[0].anchorId, 'a-lower', 'rating priority does not rewrite the geographic representative');
  assert.deepEqual(layoutMapMarkers([...input].reverse(), options), result);
  assert.equal(JSON.stringify(input), before);
  assertGeometry(result, input);
});

test('dense coincident breweries use available space at a real selected brewery', () => {
  const input = Array.from({ length: 500 }, (_, i) => place(`brewery-${i}`, 300, 300, { beerCount: i + 1 }));
  const result = layoutMapMarkers(input, { ...options, selectedId: 'brewery-17' });
  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].anchorId, 'brewery-17');
  assert.equal(result.markers[0].members.length, 500);
  assert.ok(result.markers[0].photos.length > 8);
  assert.ok(result.markers[0].photos.length <= 500, 'only actual source images are used, at the uniform readable size');
  assert.equal(new Set(result.markers[0].photos.map(photo => photo.sourceId)).size, result.markers[0].photos.length);
  assert.equal(result.markers[0].photos[0].sourceId, 'brewery-17');
  assertGeometry(result, input);
});

test('dense sources use genuine partial overlap while every photo remains separately readable', () => {
  for (const compact of [false, true]) {
    const input = [place('dense', 500, 350, { beerCount: 500, photoBeers: photos('dense', 500) })];
    const opts = { ...options, compact, landMask: mockLand([{ left: 300, right: 700, top: 180, bottom: 520 }]) };
    const result = layoutMapMarkers(input, opts);
    const rects = result.markers.flatMap(marker => marker.occupancyRects);
    assert.ok(rects.length > 30);
    let overlappingPairs = 0;
    for (let i = 0; i < rects.length; i++) for (let j = 0; j < i; j++) if (intersection(rects[i], rects[j]) > 0) overlappingPairs++;
    assert.ok(overlappingPairs > 0, 'the compact grid should actually use the newly allowed overlap');
    assertGeometry(result, input, opts);
    assert.deepEqual(layoutMapMarkers(input, opts), result, 'partial overlap does not make the layout nondeterministic');
  }
});

test('breweries with many recipes cannot crowd out other source breweries', () => {
  const input = [place('a-recipes', 400, 300, { beerCount: 325, photoBeers: photos('a-recipes', 325) }),
    ...['b', 'c', 'd', 'e'].map(id => place(id, 400, 300))];
  const result = layoutMapMarkers(input, options);
  assert.equal(new Set(result.markers[0].photos.map(photo => photo.sourceId)).size, 5);
  assertGeometry(result, input);
});

test('pictures grow in proportion to relative zoom until the device size limit', () => {
  const input = [place('p', 500, 350, { beerCount: 800, photoBeers: photos('p', 800) })];
  for (const compact of [false, true]) {
    const base = compact ? 14 : 26, maximum = compact ? 32 : 56;
    const photoZoomBase = compact ? 1.1562905994600432 : 1.5059591459777457;
    const factors = [1, 1.25, 2, 4, 100];
    const opts = { ...options, compact, photoZoomBase };
    const layouts = factors.map(factor => layoutMapMarkers(input, { ...opts, zoom: photoZoomBase * factor }));
    assert.deepEqual(layouts.map(l => l.markers[0].photoHeight), [base, base * 1.25, base * 2, maximum, maximum]);
    assert.ok(layouts[0].markers[0].photos.length > 8, 'overview keeps its existing density, without a per-brewery cap');
    for (const layout of layouts) {
      const marker = layout.markers[0];
      assert.equal(marker.availablePhotoCount, 800);
      assert.equal(marker.hiddenPhotoCount, 800 - marker.photos.length);
      assertGeometry(layout, input, opts);
    }
  }
});

test('responsive zoom bases preserve the overview and invalid bases remain finite', () => {
  const input = [place('p', 500, 350)];
  for (const compact of [false, true]) {
    const height = compact ? 14 : 26;
    for (const home of [1, 1.1562905994600432, 1.5059591459777457, 2]) {
      const marker = layoutMapMarkers(input, { ...options, compact, zoom: home, photoZoomBase: home }).markers[0];
      assert.equal(marker.photoHeight, height);
    }
    for (const invalid of [0, -1, NaN, Infinity]) {
      const marker = layoutMapMarkers(input, { ...options, compact, zoom: invalid, photoZoomBase: invalid }).markers[0];
      assert.equal(marker.photoHeight, height);
      assertGeometry({ markers: [marker], clipped: [] }, input);
    }
  }
});

test('larger images respect real control geometry even when fewer source images fit', () => {
  const obstacles = [
    { left: 28, top: 30, right: 255.21875, bottom: 143 },
    { left: 1357, top: 313.625, right: 1419, bottom: 498.625 },
    { left: 617.7578125, top: 602.71875, right: 822.2421875, bottom: 651 },
    { left: 198, top: 661, right: 1242, bottom: 819 },
  ];
  for (const compact of [false, true]) {
    const opts = { width: 1440, height: 674, compact, obstacles, bottomMargin: 12, photoZoomBase: 1.5059591459777457 };
    for (const selectedId of [undefined, 'p']) {
      for (const amount of [95, 500]) {
        const input = [place('p', 720, 337, { beerCount: amount, photoBeers: photos('p', amount) })];
        const zooms = [2.2727272727272734, 2.990430622009571, 4, 8];
        const layouts = zooms.map(zoom => layoutMapMarkers(input, { ...opts, zoom, selectedId }));
        assert.ok(layouts[1].markers[0].photoHeight > layouts[0].markers[0].photoHeight);
        assert.equal(layouts.at(-1).markers[0].photoHeight, compact ? 32 : 56);
        for (const layout of layouts) {
          assert.equal(layout.markers[0].beerCount, amount);
          assert.equal(layout.markers[0].availablePhotoCount, amount);
          assert.equal(layout.markers[0].photos[0].beer.id, 'p-000', 'repacking retains source-priority order');
          assertGeometry(layout, input, opts);
        }
      }
    }
  }
});

test('larger usable space and brewery selection expand capacity without a photo-count cap', () => {
  const layouts = [
    { width: 390, height: 700 },
    { width: 800, height: 700 },
    { width: 1400, height: 1000 },
  ].map(opts => {
    const input = [place('p', opts.width / 2, opts.height / 2, { beerCount: 800, photoBeers: photos('p', 800) })];
    const result = layoutMapMarkers(input, opts);
    assertGeometry(result, input, opts);
    return result.markers[0].photos.length;
  });
  assert.ok(layouts[0] > 4);
  assert.ok(layouts[1] > layouts[0]);
  assert.ok(layouts[2] > layouts[1]);
  const input = [place('p', 500, 350, { beerCount: 4000, photoBeers: photos('p', 4000) })];
  const normal = layoutMapMarkers(input, options), selected = layoutMapMarkers(input, { ...options, selectedId: 'p' });
  assert.ok(selected.markers[0].photos.length > normal.markers[0].photos.length);
  assert.ok(selected.markers[0].photos.length <= input[0].photoBeers.length);
  assertGeometry(selected, input);
});

test('different regional groups each get a first photo before a large brewery fills space', () => {
  const input = [place('a-many', 440, 300, { beerCount: 500, photoBeers: photos('many', 500) }),
    ...['b', 'c', 'd'].map((id, i) => place(id, 550 + i * 100, 300))];
  const result = layoutMapMarkers(input, { ...options, selectedId: 'a-many' });
  assert.equal(result.markers.length, 4);
  for (const id of ['b', 'c', 'd']) assert.ok(result.markers.some(marker => marker.photos.some(photo => photo.sourceId === id)));
  assert.ok(result.markers.find(marker => marker.anchorId === 'a-many').photos.length > 8);
  assertGeometry(result, input);
});

test('obstacles constrain individual hit rectangles while empty group bounds can cross them', () => {
  const input = [place('p', 300, 350, { beerCount: 800, photoBeers: photos('p', 800) })];
  const opts = { ...options, selectedId: 'p', obstacles: [{ left: 420, right: 490, top: 220, bottom: 470 }] };
  const result = layoutMapMarkers(input, opts);
  assert.ok(result.markers[0].photos.length > 8);
  assert.ok(intersection(markerBounds(result.markers[0]), opts.obstacles[0]) > 0, 'empty enclosing space is not a hit rectangle');
  assertGeometry(result, input, opts);
});

test('a sparse brewery gets only its actual images while record counts stay honest', () => {
  const input = [place('one-photo', 350, 300, { beerCount: 200 })];
  const result = layoutMapMarkers(input, { ...options, zoom: 10 });
  assert.equal(result.markers[0].photos.length, 1);
  assert.equal(result.markers[0].beerCount, 200);
  assertGeometry(result, input);
});

test('unpictured groups retain source counts without reserving space or rendering symbols', () => {
  const pictured = place('photo', 401, 302);
  const input = [place('no-photo', 400, 301, { photoBeers: [], beerCount: 100 }), pictured,
    place('isolated-no-photo', 750, 500, { photoBeers: [], beerCount: 40 })];
  const before = layoutMapMarkers([pictured], options), result = layoutMapMarkers(input, options);
  assert.equal(result.markers[0].anchorId, 'photo');
  assert.deepEqual(result.markers[0].photos, before.markers[0].photos, 'adding unpictured records must not push photographs away');
  const empty = result.markers.find(marker => marker.anchorId === 'isolated-no-photo');
  assert.equal(empty.beerCount, 40);
  assert.equal(empty.availablePhotoCount, 0);
  assertGeometry(result, input);
});

test('the source point can hold a photograph instead of leaving a number-shaped hole', () => {
  const input = [place('p', 500, 350)];
  const opts = { ...options, landMask: mockLand([{ left: 0, top: 0, right: 1000, bottom: 700 }]) };
  const result = layoutMapMarkers(input, opts), photo = result.markers[0].photos[0];
  assert.ok(Math.hypot(photo.displayOffsetX, photo.displayOffsetY) < 14,
    'the nearest safe picture may occupy the formerly reserved source-control area');
  assertGeometry(result, input, opts);
});

test('dense chains remain separate readable regional fans independent of fetch order', () => {
  const input = Array.from({ length: 28 }, (_, i) => place(`p-${String(i).padStart(2, '0')}`, 70 + i * 30, 250));
  const result = layoutMapMarkers(input, options);
  assert.ok(result.markers.length >= 4 && result.markers.length < input.length);
  assertGeometry(result, input);
  const reordered = layoutMapMarkers([...input].reverse(), options);
  assert.deepEqual(result, reordered);
});

test('boundary and controls constrain fans without changing their original anchors', () => {
  const input = [place('left', 5, 100), place('top', 100, 5), place('overlay', 400, 300), place('clear', 800, 500),
    place('near-edge', 14, 600, { photoBeers: photos('near-edge', 5), beerCount: 5 }), place('invalid', NaN, 30)];
  const opts = { ...options, obstacles: [{ left: 380, right: 430, top: 270, bottom: 340 }] };
  const result = layoutMapMarkers(input, opts);
  assert.deepEqual(result.clipped.map(({ entry, reason }) => [entry.id, reason]), [['left', 'bounds'], ['top', 'bounds'], ['invalid', 'coordinates']]);
  assert.ok(result.markers.find(marker => marker.id === 'near-edge').displayOffsetX >= 0);
  assert.ok(result.markers.some(marker => marker.photos.some(photo => photo.sourceId === 'overlay')), 'a source behind a control can use safe nearby photo cells');
  assertGeometry(result, input, opts);
});

test('dateline neighbours on opposite projected edges never falsely cluster', () => {
  const input = [place('east', 950, 300, { lng: 179.9 }), place('west', 50, 300, { lng: -179.9 })];
  const result = layoutMapMarkers(input, options);
  assert.equal(result.markers.length, 2);
  assertGeometry(result, input);
});

test('whole image rectangles avoid sea bays and inland lakes even when their centers are land', () => {
  const landMask = mockLand([{ left: 80, top: 70, right: 820, bottom: 630 }], [
    { left: 540, top: 240, right: 830, bottom: 320 }, // Sea bay cuts into the continent.
    { left: 325, top: 240, right: 350, bottom: 310 }, // Inland lake has land on every side.
  ]);
  const input = [place('lake-shore', 310, 280, { beerCount: 2000, photoBeers: photos('lake', 2000) })];
  const opts = { ...options, landMask, selectedId: 'lake-shore', zoom: 8 };
  const result = layoutMapMarkers(input, opts);
  assert.ok(result.markers[0].photos.length > 8);
  assert.ok(result.markers[0].hiddenPhotoCount > 0, 'land area controls count without squeezing photos into water');
  assert.ok(landMask.rejectedWithLandCenter > 0, 'fixture exercises rectangles whose centers alone would pass');
  assertGeometry(result, input, opts);
});

test('a source just offshore uses nearby mainland cells without adding a coastal symbol', () => {
  const landMask = mockLand([{ left: 100, top: 60, right: 790, bottom: 640 }]);
  const input = [place('coastal', 98, 300, { beerCount: 100, photoBeers: photos('coast', 100) })];
  const opts = { ...options, landMask, selectedId: 'coastal' };
  const result = layoutMapMarkers(input, opts), marker = result.markers[0];
  assert.equal(result.clipped.length, 0);
  assert.ok(marker.photos.length > 8);
  assert.ok(marker.photos.every(photo => photo.sourceLandComponent === null && photo.landComponent === 0));
  assert.equal(marker.countRect, null);
  assert.deepEqual([marker.x, marker.y], [input[0].x, input[0].y], 'the original source anchor is never relocated');
  assert.ok(marker.occupancyRects.every(rect => landMask.containsRect(rect)), 'every occupied rectangle is a land-safe photograph');
  assertGeometry(result, input, opts);
});

test('small islands use only close complete land cells, and never a distant continent', () => {
  const island = { left: 145, top: 295, right: 155, bottom: 305 };
  const input = [place('island', 150, 300, { beerCount: 100, photoBeers: photos('island', 100) })];
  const nearby = { ...options, selectedId: 'island', zoom: 8,
    landMask: mockLand([island, { left: 165, top: 60, right: 750, bottom: 640 }]) };
  const result = layoutMapMarkers(input, nearby);
  assert.ok(result.markers[0].photos.length > 0, 'a sub-thumbnail island can use adjacent mainland');
  assert.ok(result.markers[0].photos.every(photo => photo.sourceLandComponent === 0 && photo.landComponent === 1));
  assertGeometry(result, input, nearby);
  const remote = { ...nearby, landMask: mockLand([island, { left: 450, top: 60, right: 950, bottom: 640 }]) };
  const remoteResult = layoutMapMarkers(input, remote);
  assert.equal(remoteResult.markers.length, 1, 'the source metadata remains available without a fallback symbol');
  assert.equal(remoteResult.markers[0].photos.length, 0, 'selection cannot move island photos to a remote landmass');
  assert.equal(remoteResult.markers[0].hiddenPhotoCount, 100);
  assertGeometry(remoteResult, input, remote);
});

test('a narrow screen gap cannot relocate coastal beer hundreds of kilometres across a sea', () => {
  const input = [place('coastal', 150, 300, {lat:43.2667,lng:-1.9667,beerCount:20,photoBeers:photos('coastal',20)})];
  const island = {left:145,top:295,right:155,bottom:305};
  const mainland = {left:165,top:60,right:750,bottom:640};
  const landMask = mockLand([island,mainland]);
  landMask.geographicAt = () => ({lat:34,lng:-2});
  const opts = {...options,selectedId:'coastal',zoom:8,landMask};
  assert.equal(layoutMapMarkers(input,opts).markers[0].photos.length,0,'Spain cannot jump to north Africa at a mobile zoom');
  landMask.geographicAt = () => ({lat:43.5,lng:-1.5});
  assert(layoutMapMarkers(input,opts).markers[0].photos.length>0,'genuinely nearby coastal land remains available');
});

test('breweries clustered across a strait keep photos on each individual source landmass', () => {
  const landMask = mockLand([
    { left: 70, top: 50, right: 380, bottom: 650 },
    { left: 400, top: 50, right: 900, bottom: 650 },
  ]);
  const input = [place('west', 375, 300, { beerCount: 50, photoBeers: photos('west', 50) }),
    place('east', 405, 300, { beerCount: 50, photoBeers: photos('east', 50) })];
  const opts = { ...options, landMask, selectedId: 'west', zoom: 8 };
  const result = layoutMapMarkers(input, opts);
  assert.equal(result.markers.length, 1, 'nearby source anchors may share a metadata group');
  for (const sourceId of ['west', 'east']) {
    const rendered = result.markers[0].photos.filter(photo => photo.sourceId === sourceId);
    assert.ok(rendered.length > 8);
    assert.ok(rendered.every(photo => photo.landComponent === (sourceId === 'west' ? 0 : 1)));
  }
  assertGeometry(result, input, opts);
});

test('selection remains locally bounded even on one large connected continent', () => {
  const landMask = mockLand([{ left: 0, top: 0, right: 1600, bottom: 700 }]);
  const input = [place('p', 180, 350, { beerCount: 1000, photoBeers: photos('p', 1000) })];
  const opts = { width: 1600, height: 700, landMask, selectedId: 'p', zoom: 128 };
  const result = layoutMapMarkers(input, opts);
  assert.ok(result.markers[0].photos.length > 100);
  for (const photo of result.markers[0].photos) assert.ok(Math.hypot(photo.displayOffsetX, photo.displayOffsetY) <= 342 + 1e-8);
  assertGeometry(result, input, opts);
});

test('shared land components cannot move photos across a broad sea, with paths or the conservative fallback', () => {
  // Two coasts belong to one connected landmass via the far eastern and western
  // edges, as Europe and Africa do. Their short straight line crosses a sea;
  // the actual route around it is much longer than the local expansion budget.
  const landMask = createScreenLandMask({ width: 900, height: 600, step: 2, padding: 2,
    unproject: (x, y) => ({ lng: x / 100, lat: 30 + y / 100 }),
    geographicMask: { contains: (lng, lat) => {
      const x = lng * 100, y = (lat - 30) * 100;
      return x >= 60 && x <= 860 && y >= 50 && y <= 550
        && !(x > 130 && x < 800 && y > 280 && y < 330);
    } },
  });
  assert.equal(landMask.componentAt(450, 240), landMask.componentAt(450, 360));
  assert.equal(landMask.distancesFrom(450, 240, 160, { snapDistance: 12 }).distanceAt(450, 360), Infinity);
  for (const mask of [landMask, { ...landMask, distancesFrom: undefined }]) {
    const input = [place('north-coast', 450, 240, { beerCount: 200, photoBeers: photos('north', 200) })];
    const opts = { width: 900, height: 600, landMask: mask, selectedId: 'north-coast' };
    const result = layoutMapMarkers(input, opts);
    assert.ok(result.markers[0].photos.length > 8);
    assert.ok(result.markers[0].photos.every(photo => photo.landContactY <= 280 && photo.sourceY + photo.displayOffsetY < 300), 'photos may overhang the near coastline but cannot jump to the opposite coast');
    assertGeometry(result, input, opts);
  }
});

test('proportional pictures preserve the land reach budget while zoom increases local room', () => {
  const landMask = mockLand([{ left: 0, top: 0, right: 1000, bottom: 700 }]);
  const input = [place('p', 500, 350, { beerCount: 500, photoBeers: photos('p', 500) })];
  for (const compact of [false, true]) {
    const opts = { ...options, compact, landMask };
    const first = layoutMapMarkers(input, opts), zoomed = layoutMapMarkers(input, { ...opts, zoom: 4 });
    const marker = first.markers[0];
    assert.ok(marker.photos.length > 8);
    const radius = (compact ? 30 : 32) * 3;
    assert.ok(marker.photos.every(photo => photo.maxDisplayDistance === radius && Math.hypot(photo.displayOffsetX, photo.displayOffsetY) <= radius + 1e-8));
    assert.ok(zoomed.markers[0].photoHeight > marker.photoHeight);
    assert.ok(zoomed.markers[0].photos.every(photo => photo.maxDisplayDistance > radius));
    assertGeometry(first, input, opts);
    assertGeometry(zoomed, input, opts);
  }
});

test('thousands of mixed records stay bounded with readable fans on phone and desktop', () => {
  for (const compact of [false, true]) {
    const opts = { width: compact ? 390 : 1440, height: compact ? 740 : 900, compact, zoom: 2, topMargin: 95, bottomMargin: 130 };
    const input = Array.from({ length: 1200 }, (_, i) => place(`seed-${i}`, (i * 73 + 17) % opts.width, (i * 113 + 31) % opts.height,
      { photoBeers: i % 3 ? photos(`b-${i}`, 4) : [], beerCount: i % 3 ? 4 : 3 }));
    const started = performance.now();
    const result = layoutMapMarkers(input, opts);
    assert.ok(performance.now() - started < 1500, '1,200 records must not require an unbounded layout search');
    assert.ok(result.markers.length >= (compact ? 6 : 20) && result.markers.length < 250);
    assertGeometry(result, input, opts);
  }
});

test('invalid viewport reports all input as clipped without mutation', () => {
  const input = [Object.freeze(place('a', 100, 100))];
  assert.deepEqual(layoutMapMarkers(input, { width: 0, height: 300 }), { markers: [], clipped: [{ entry: input[0], reason: 'viewport' }] });
  assertGeometry(layoutMapMarkers(input, options), input);
});


function renderedPhotos(result) {
  return result.markers.flatMap(marker => marker.photos.map(photo => ({ ...photo,
    centerX: photo.sourceX + photo.displayOffsetX, centerY: photo.sourceY + photo.displayOffsetY })));
}
function projectedPlacements(result, project = (x, y) => ({ x, y }), reachScale = 1) {
  return new Map(renderedPhotos(result).map(photo => [photo.beer.id, {
    ...project(photo.centerX, photo.centerY), maxDisplayDistance: photo.maxDisplayDistance * reachScale, scale: photo.scale,
  }]));
}

test('the renderer and layout share proportional photo dimensions', () => {
  for (const compact of [false, true]) for (const zoom of [0, 1, 1.33, 2.76, 30, NaN]) {
    const opts = { ...options, zoom, compact, photoZoomBase: 1.506 };
    const { photoWidth, photoHeight } = layoutMapMarkers([place('p', 500, 350)], opts).markers[0];
    assert.deepEqual(photoDimensions(opts), { photoWidth, photoHeight });
  }
});

test('solar-system distances shrink bottle frames with the Earth while retaining the home dimensions', () => {
  assert.deepEqual(photoDimensions(), {photoHeight:26,photoWidth:13.52});
  assert.deepEqual(photoDimensions({compact:true}), {photoHeight:14,photoWidth:7.28});
  for (const compact of [false,true]) for (const homeAltitude of [1.5,2.5,3.648]) {
    const base=compact?14:26,photoZoomBase=2.5/homeAltitude;
    let previousHeight=base;
    for (const altitude of [homeAltitude,homeAltitude*2,18,19]) {
      const opts={...options,compact,zoom:2.5/altitude,photoZoomBase};
      const dimensions=photoDimensions(opts);
      const radiusRatio=Math.sqrt(homeAltitude*(homeAltitude+2)/(altitude*(altitude+2)));
      assert.ok(Math.abs(dimensions.photoHeight-base*radiusRatio)<=.0051);
      assert.ok(dimensions.photoHeight<=previousHeight);previousHeight=dimensions.photoHeight;
      const input=[place('distant',500,350)],layout=layoutMapMarkers(input,opts);
      const marker=layout.markers[0],photo=marker.photos[0];
      assert.ok(photo,'far zoom keeps a real bottle rather than replacing it with a dot');
      assert.deepEqual({photoWidth:photo.width,photoHeight:photo.height},dimensions);
      assert.deepEqual({photoWidth:marker.photoWidth,photoHeight:marker.photoHeight},dimensions);
      assertGeometry(layout,input,opts);
    }
    assert.ok(previousHeight<7,'the farthest bottle frame cannot keep a 14/26px near-view floor');
  }
});

test('safe images keep exact projected centers through repeated zooms while new images fill remaining space', () => {
  const landMask = mockLand([{ left: 0, top: 0, right: 1000, bottom: 700 }]);
  let input = [place('p', 450, 330, { beerCount: 200, photoBeers: photos('p', 8) })];
  let opts = { ...options, landMask, zoom: 1, preservePrevious: true };
  let result = layoutMapMarkers(input, opts);
  assert.equal(renderedPhotos(result).length, 8);
  for (const [factor, amount] of [[1.2, 18], [1.2, 28], [1.12, 40]]) {
    const project = (x, y) => ({ x: 450 + (x - 450) * factor + 2.17, y: 330 + (y - 330) * factor - 1.43 });
    const previousPlacements = projectedPlacements(result, project, factor);
    const before = JSON.stringify([...previousPlacements]);
    const projectedSource = project(input[0].x, input[0].y);
    input = [{ ...input[0], ...projectedSource, photoBeers: photos('p', amount) }];
    opts = { ...opts, zoom: opts.zoom * factor, previousPlacements };
    result = layoutMapMarkers(input, opts);
    const rendered = renderedPhotos(result), byId = new Map(rendered.map(photo => [photo.beer.id, photo]));
    for (const [id, previous] of previousPlacements) {
      const photo = byId.get(id);
      assert.ok(photo, `safe existing image ${id} must remain present`);
      assert.equal(photo.placementRetained, true);
      assert.ok(Math.abs(photo.centerX - previous.x) < 1e-9 && Math.abs(photo.centerY - previous.y) < 1e-9,
        'camera-projected centers do not snap to the new grid');
    }
    assert.ok(rendered.some(photo => !previousPlacements.has(photo.beer.id)), 'new images continue to enter safe free cells');
    assert.equal(JSON.stringify([...previousPlacements]), before, 'the caller owns the anchor history');
    assertGeometry(result, input, opts);
  }
});

test('arbitrary retained rectangles share collision space with all new grid images', () => {
  const input = [place('p', 500, 350, { beerCount: 200, photoBeers: photos('p', 200) })];
  const previousPlacements = new Map([['p-000', { x: 500.125, y: 350.375 }]]);
  const opts = { ...options, previousPlacements, preservePrevious: true };
  const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
  assert.equal(rendered[0].centerX, 500.125); assert.equal(rendered[0].centerY, 350.375);
  assert.equal(rendered[0].placementRetained, true);
  assert.ok(rendered.length > 50 && rendered.some(photo => !photo.placementRetained));
  assertGeometry(result, input, opts);
});

test('unsafe previous images hide instead of moving and safe new images still enter', () => {
  const landMask = mockLand([{ left: 100, top: 80, right: 900, bottom: 620 }], [
    { left: 620, right: 660, top: 240, bottom: 380 },
  ]);
  const input = [place('p', 500, 350, { beerCount: 40, photoBeers: photos('p', 40) })];
  const obstacles = [{ left: 530, right: 580, top: 250, bottom: 300 }];
  const halfWidth = photoDimensions().photoWidth / 2;
  const cases = [
    ['viewport', { x: 4, y: 350 }], ['coast', { x: 100 + halfWidth - .5, y: 350, maxDisplayDistance: 500 }],
    ['lake rectangle', { x: 620 - halfWidth + .5, y: 300, maxDisplayDistance: 200 }],
    ['controls', { x: 550, y: 275 }], ['source reach', { x: 850, y: 450 }],
    ['no visible projection', null],
  ];
  for (const [reason, previous] of cases) {
    const opts = { ...options, landMask, obstacles, previousPlacements: new Map([['p-000', previous]]), preservePrevious: true };
    const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
    assert.ok(!rendered.some(photo => photo.beer.id === 'p-000'), `${reason}: hidden, not relocated`);
    assert.ok(rendered.length > 10, `${reason}: other actual beers use the free space`);
    assertGeometry(result, input, opts);
  }
  const opts = { ...options, landMask, obstacles, previousPlacements: new Map([['p-000', { x: 550, y: 275 }]]) };
  const relocated = renderedPhotos(layoutMapMarkers(input, opts)).find(photo => photo.beer.id === 'p-000');
  assert.ok(relocated && !relocated.placementRetained, 'callers may explicitly keep legacy reallocation behavior');
});

test('camera-projected reach may grow while retained images still obey land paths and coastal distance', () => {
  const landMask = mockLand([{ left: 0, top: 0, right: 1000, bottom: 700 }]);
  const input = [place('p', 400, 350, { photoBeers: photos('p', 2) })];
  const previousPlacements = new Map([['p-000', { x: 535.17, y: 350.23, maxDisplayDistance: 150 }]]);
  const opts = { ...options, landMask, previousPlacements, preservePrevious: true };
  const result = layoutMapMarkers(input, opts), kept = renderedPhotos(result).find(photo => photo.beer.id === 'p-000');
  assert.ok(kept?.placementRetained && kept.maxDisplayDistance === 150);
  assert.ok(kept.displayOffsetX > 96, 'projection-scaled proven reach avoids pulling an existing anchor inward');
  assertGeometry(result, input, opts);

  const island = { left: 145, top: 295, right: 155, bottom: 305 };
  const shore = mockLand([island, { left: 165, top: 60, right: 750, bottom: 640 }]);
  shore.geographicAt = () => ({ lat: 34, lng: -2 });
  const coastal = [place('coastal', 150, 300, { lat: 43.2667, lng: -1.9667, photoBeers: photos('coastal', 2) })];
  const coastalOptions = { ...options, landMask: shore, preservePrevious: true,
    previousPlacements: new Map([['coastal-000', { x: 180, y: 300, maxDisplayDistance: 300 }]]) };
  assert.equal(renderedPhotos(layoutMapMarkers(coastal, coastalOptions)).length, 0,
    'an extended prior radius does not allow a 300+ km coastal crossing');
  shore.geographicAt = () => ({ lat: 43.5, lng: -1.5 });
  assert.ok(renderedPhotos(layoutMapMarkers(coastal, coastalOptions)).find(photo => photo.beer.id === 'coastal-000')?.placementRetained);
});

test('previous anchors cannot bypass land-route limits across connected continental coasts', () => {
  const landMask = createScreenLandMask({ width: 900, height: 600, step: 2, padding: 2,
    unproject: (x, y) => ({ lng: x / 100, lat: 30 + y / 100 }),
    geographicMask: { contains: (lng, lat) => {
      const x = lng * 100, y = (lat - 30) * 100;
      return x >= 60 && x <= 860 && y >= 50 && y <= 550
        && !(x > 130 && x < 800 && y > 280 && y < 330);
    } },
  });
  const input = [place('north', 450, 240, { photoBeers: photos('north', 30) })];
  for (const mask of [landMask, { ...landMask, distancesFrom: undefined }]) {
    const opts = { width: 900, height: 600, landMask: mask, preservePrevious: true,
      previousPlacements: new Map([['north-000', { x: 450, y: 360, maxDisplayDistance: 180 }]]) };
    const result = layoutMapMarkers(input, opts);
    assert.ok(!renderedPhotos(result).some(photo => photo.beer.id === 'north-000'));
    assert.ok(renderedPhotos(result).length > 8);
    assertGeometry(result, input, opts);
  }
});

test('retained identity follows beer IDs across changing groups and leaves first-photo opportunities', () => {
  const original = place('z-many', 500, 350, { beerCount: 120, photoBeers: photos('z', 120) });
  const before = layoutMapMarkers([original], options);
  const previousPlacements = projectedPlacements(before);
  const input = [original, place('a-neighbour', 510, 352), place('outside', 605, 350)];
  const opts = { ...options, previousPlacements, preservePrevious: true };
  const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
  assert.notEqual(result.markers.find(marker => marker.members.some(member => member.id === original.id)).id, before.markers[0].id);
  assert.ok(rendered.some(photo => photo.sourceId === 'a-neighbour'));
  assert.ok(rendered.some(photo => photo.sourceId === 'outside'));
  for (const photo of rendered.filter(photo => photo.sourceId === original.id)) {
    const old = previousPlacements.get(photo.beer.id);
    assert.ok(photo.placementRetained);
    assert.ok(Math.abs(photo.centerX - old.x) < 1e-9 && Math.abs(photo.centerY - old.y) < 1e-9);
  }
  assertGeometry(result, input, opts);
});

test('a new brewery cannot displace safe visible sibling anchors and still gets first access to free cells', () => {
  const original = place('old', 500, 350, { beerCount: 8, photoBeers: photos('old', 8) });
  const before = layoutMapMarkers([original], options), previousPlacements = projectedPlacements(before);
  const target = previousPlacements.get('old-001');
  // The newcomer's nearest grid cell is exactly the second old photograph's
  // anchor. Previously its first allocation evicted that continuously visible
  // sibling even though plenty of other safe cells were available nearby.
  const newcomer = place('new', target.x, target.y, { photoBeers: photos('new', 2) });
  const input = [{ ...original, beerCount: 10, photoBeers: photos('old', 10) }, newcomer];
  const opts = { ...options, previousPlacements, preservePrevious: true,
    visiblePreviousPhotoIds: new Set(previousPlacements.keys()) };
  const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
  for (const [id, anchor] of previousPlacements) {
    const photo = rendered.find(photo => photo.beer.id === id);
    assert.ok(photo?.placementRetained, `${id} remains visible at its safe old anchor`);
    assert.equal(photo.centerX, anchor.x); assert.equal(photo.centerY, anchor.y);
  }
  const ids = rendered.map(photo => photo.beer.id);
  assert.ok(ids.includes('new-000'), 'the entering brewery receives a photograph in free space');
  assert.ok(ids.includes('old-008'), 'existing breweries can still add unseen photographs');
  assert.ok(ids.indexOf('new-000') < ids.indexOf('old-008'), 'new source first-photo fairness remains ahead of additional unseen siblings');
  assert.deepEqual(layoutMapMarkers([...input].reverse(), opts), result);
  assertGeometry(result, input, opts);
});

test('shrinking projected spacing keeps the higher-priority photo and omits excessively overlapping anchors', () => {
  const input = [place('p', 500, 350, { photoBeers: [ratedPhoto('high', 4.6, 100), ratedPhoto('low', 3.8, 100), ...photos('new', 20)] })];
  const opts = { ...options, preservePrevious: true,
    previousPlacements: new Map([['high', { x: 500.23, y: 350.42 }], ['low', { x: 500.23 + photoDimensions().photoWidth * .65, y: 350.42 }]]) };
  const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
  assert.ok(rendered.find(photo => photo.beer.id === 'high')?.placementRetained);
  assert.ok(!rendered.some(photo => photo.beer.id === 'low'), 'the colliding old photo is omitted, never snapped somewhere else');
  assert.ok(rendered.some(photo => photo.beer.id.startsWith('new')));
  assertGeometry(result, input, opts);
});

test('zooming in and out retains projected old centers when overlap remains within the readable budget', () => {
  for (const compact of [false, true]) {
    const { photoWidth } = photoDimensions({ compact });
    const input = [place('p', 500, 350, { beerCount: 60, photoBeers: photos('p', 60) })];
    const landMask = mockLand([{ left: 100, right: 900, top: 80, bottom: 620 }]);
    let previousPlacements = new Map([
      ['p-000', { x: 500.125, y: 350.375 }],
      ['p-001', { x: 500.125 + photoWidth * 1.02, y: 350.375 }],
    ]);
    for (const [zoom, projectionScale] of [[1.25, 1.1], [1, .85]]) {
      previousPlacements = new Map([...previousPlacements].map(([id, point]) => [id, {
        x: 500.125 + (point.x - 500.125) * projectionScale, y: point.y,
      }]));
      const opts = { ...options, compact, zoom, landMask, previousPlacements, preservePrevious: true };
      const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
      const kept = rendered.filter(photo => previousPlacements.has(photo.beer.id));
      assert.equal(kept.length, 2, 'both partially overlapping existing pictures stay visible');
      for (const photo of kept) {
        const previous = previousPlacements.get(photo.beer.id);
        assert.equal(photo.placementRetained, true);
        assert.equal(photo.centerX, previous.x); assert.equal(photo.centerY, previous.y);
      }
      const rects = kept.map(photo => ({ left: photo.centerX - photo.width / 2, right: photo.centerX + photo.width / 2,
        top: photo.centerY - photo.height / 2, bottom: photo.centerY + photo.height / 2 }));
      assert.ok(intersection(...rects) > 0, 'this case exercises partial overlap, not merely separated anchors');
      assert.ok(rendered.some(photo => !previousPlacements.has(photo.beer.id)), 'new images still fill the remaining readable space');
      assertGeometry(result, input, opts);
    }
  }
});


test('a safe off-grid island anchor survives even when the global grid has no full rectangle there', () => {
  const { photoWidth: width, photoHeight: height } = photoDimensions();
  const island = clearance => ({ left: 500 - width / 2 - clearance, right: 500 + width / 2 + clearance,
    top: 350 - height / 2 - clearance, bottom: 350 + height / 2 + clearance });
  const landMask = mockLand([island(.3)]);
  const input = [place('island', 500, 350)];
  const opts = { ...options, landMask, preservePrevious: true };
  assert.equal(renderedPhotos(layoutMapMarkers(input, opts)).length, 0, 'this island falls between the new grid rows');
  const previousPlacements = new Map([['island-beer', { x: 500, y: 350, scale: 0.45 }]]);
  const result = layoutMapMarkers(input, { ...opts, previousPlacements });
  assert.equal(renderedPhotos(result).length, 1);
  assert.equal(renderedPhotos(result)[0].placementRetained, true);
  assertGeometry(result, input, opts);
  const tooTight = mockLand([island(.2)]);
  assert.equal(renderedPhotos(layoutMapMarkers(input,{...opts,landMask:tooTight,previousPlacements})).length,0,
    'a 0.2px coastline clearance cannot pass the renderer\'s 0.25px rounding guard');
});


test('a brewery with an unsafe top anchor gets another first photo before competitors fill the remaining space', () => {
  const landMask = mockLand([{ left: 475, right: 525, top: 320, bottom: 380 }]);
  const input = [place('a-many', 500, 350, { beerCount: 80, photoBeers: photos('a', 80) }),
    place('z-neighbour', 500, 350, { photoBeers: photos('z', 2) })];
  const before = layoutMapMarkers([input[0]], { ...options, landMask });
  const previousPlacements = projectedPlacements(before);
  previousPlacements.set('z-000', { x: 10, y: 10 });
  const opts = { ...options, landMask, previousPlacements, preservePrevious: true };
  const result = layoutMapMarkers(input, opts), rendered = renderedPhotos(result);
  assert.ok(!rendered.some(photo => photo.beer.id === 'z-000'));
  assert.ok(rendered.some(photo => photo.beer.id === 'z-001'), 'the other actual beer receives its brewery first-photo opportunity');
  assert.ok(rendered.some(photo => photo.beer.id.startsWith('a') && photo.placementRetained));
  assertGeometry(result, input, opts);
});


test('re-entry permission never moves a safe previous image', () => {
  const input = [place('p', 500, 350, { beerCount: 30, photoBeers: photos('p', 30) })];
  const opts = { ...options, preservePrevious: true,
    landMask: mockLand([{ left: 100, top: 80, right: 900, bottom: 620 }]),
    previousPlacements: new Map([['p-000', { x: 500.125, y: 350.375 }]]),
    relocatablePhotoIds: new Set(['p-000']) };
  const result = layoutMapMarkers(input, opts), old = renderedPhotos(result).find(photo => photo.beer.id === 'p-000');
  assert.equal(old?.placementRetained, true);
  assert.equal(old.centerX, 500.125); assert.equal(old.centerY, 350.375);
  assertGeometry(result, input, opts);
});

test('only explicitly permitted hidden images may re-enter at a new safe land cell', () => {
  const input = [place('coast', 510, 350, { beerCount: 3, photoBeers: photos('coast', 3) })];
  const landMask = mockLand([{ left: 500, top: 80, right: 900, bottom: 620 }]);
  // The centers remain on land after zooming out, but the uniform full images
  // cannot fit at their old coastal positions. A permit comes only after the
  // renderer has hidden an image and the camera has settled.
  const previousPlacements = new Map([
    ['coast-000', { x: 501, y: 350 }], ['coast-001', { x: 502, y: 380 }],
    ['coast-002', { x: 540.125, y: 410.375 }],
  ]);
  const opts = { ...options, landMask, previousPlacements, preservePrevious: true };
  const before = renderedPhotos(layoutMapMarkers(input, opts));
  assert.deepEqual(before.map(photo => photo.beer.id), ['coast-002']);
  const result = layoutMapMarkers(input, { ...opts, relocatablePhotoIds: new Set(['coast-000']) });
  const rendered = renderedPhotos(result), returned = rendered.find(photo => photo.beer.id === 'coast-000');
  assert.ok(returned && !returned.placementRetained, 'the permitted hidden image receives a new safe cell');
  assert.ok(returned.centerX !== 501 || returned.centerY !== 350);
  assert.ok(!rendered.some(photo => photo.beer.id === 'coast-001'), 'the other unsafe old image remains hidden');
  const retained = rendered.find(photo => photo.beer.id === 'coast-002');
  assert.ok(retained?.placementRetained);
  assert.equal(retained.centerX, 540.125); assert.equal(retained.centerY, 410.375);
  assertGeometry(result, input, opts);
});


test('inland and coastal photos share one frame size at every zoom', () => {
  const input = [place('a', 400, 350, { photoBeers: photos('a', 10) }), place('b', 700, 350, { photoBeers: photos('b', 10) })];
  for (const compact of [false, true]) for (const zoom of [1, 1.7, 10]) {
    const opts = { ...options, compact, zoom, landMask: mockLand([{ left: 200, right: 940, top: 100, bottom: 600 }]) };
    const result = layoutMapMarkers(input, opts);
    assert.ok(renderedPhotos(result).length > 1);
    for (const photo of renderedPhotos(result)) {
      const dimensions = photoDimensions({ compact, zoom });
      assert.equal(photo.scale, 1);
      assert.equal(photo.height, dimensions.photoHeight);
      assert.equal(photo.width, dimensions.photoWidth);
    }
    assertGeometry(result, input, opts);
  }
});

test('a narrow island waits for enough land space instead of mixing miniature and normal bottles', () => {
  const input = [place('island', 500, 350, { beerCount: 20, photoBeers: photos('island', 20) }), place('mainland', 800, 350)];
  const mainland = { left: 650, right: 940, top: 100, bottom: 600 };
  const islandHalfWidth = (photoDimensions({ zoom: 4 }).photoWidth - 1) / 2;
  const landMask = mockLand([{ left: 500 - islandHalfWidth, right: 500 + islandHalfWidth, top: 180, bottom: 520 }, mainland]);
  for (const selectedId of [undefined, 'island']) {
    const opts = { ...options, landMask, zoom: 4, selectedId };
    const result = layoutMapMarkers(input, opts);
    assert.equal(renderedPhotos(result).filter(photo => photo.sourceId === 'island').length, 0);
    assert.ok(renderedPhotos(result).some(photo => photo.sourceId === 'mainland'));
    assertGeometry(result, input, opts);
    const enlarged = { ...opts, landMask: mockLand([{ left: 440, right: 560, top: 150, bottom: 550 }, mainland]) };
    const after = layoutMapMarkers(input, enlarged);
    assert.ok(renderedPhotos(after).some(photo => photo.sourceId === 'island'));
    assertGeometry(after, input, enlarged);
  }
});

test('legacy small anchors use the shared size and survive only if the full new frame fits', () => {
  const islandHalfWidth = (photoDimensions({ zoom: 2 }).photoWidth + photoDimensions({ zoom: 5 }).photoWidth) / 4;
  const landMask = mockLand([{ left: 500 - islandHalfWidth, right: 500 + islandHalfWidth, top: 180, bottom: 520 }]);
  const input = [place('island', 500, 350)];
  const previousPlacements = new Map([['island-beer', { x: 500, y: 350, scale: .6 }]]);
  for (const zoom of [5, 2, 1]) {
    const opts = { ...options, landMask, zoom, previousPlacements, preservePrevious: true };
    const result = layoutMapMarkers(input, opts), photo = renderedPhotos(result)[0];
    if (zoom === 5) {
      assert.equal(photo, undefined, 'a legacy miniature cannot bypass the uniform full-frame coast check');
    } else {
      assert.ok(photo?.placementRetained); assert.equal(photo.scale, 1);
      assert.equal(photo.centerX, 500); assert.equal(photo.centerY, 350);
      assert.equal(photo.height, photoDimensions({ zoom }).photoHeight);
    }
    assertGeometry(result, input, opts);
  }
});

function metricCoastalMask(pixelsPerKm, coastKm, island = false) {
  const degreesKm = Math.PI / 180 * 6371;
  return createScreenLandMask({ width: 1000, height: 700, step: 2, padding: 2,
    unproject: (x, y) => ({ lng: (x - 200) / pixelsPerKm / degreesKm, lat: (350 - y) / pixelsPerKm / degreesKm }),
    geographicMask: { contains: (lng, lat) => {
      const xKm = lng * degreesKm, yKm = lat * degreesKm;
      return xKm >= coastKm || (island && Math.abs(xKm) <= .4 && Math.abs(yKm) <= .4);
    } },
  });
}

test('a fixed nearby coastal correction remains valid when magnification makes it wider than 12 pixels', () => {
  const input = [place('coast', 200, 350, { lat: 0, lng: 0, beerCount: 10, photoBeers: photos('coast', 10) })];
  for (const pixelsPerKm of [2, 8, 20]) {
    const landMask = metricCoastalMask(pixelsPerKm, 8);
    assert.equal(landMask.componentAt(200, 350), -1);
    assert.ok(landMask.nearestLandPoint(200, 350, 300).distance > 12);
    const opts = { ...options, zoom: pixelsPerKm, landMask, selectedId: 'coast' };
    const result = layoutMapMarkers(input, opts);
    assert.ok(renderedPhotos(result).length > 0, `the same 8km correction must work at ${pixelsPerKm}px/km`);
    assert.ok(renderedPhotos(result).every(photo => photo.landContactX >= 200 + 8 * pixelsPerKm));
    assertGeometry(result, input, opts);
  }
});

test('coastal correction rejects distant water origins and cannot bridge a sea from a visible island', () => {
  const input = [place('p', 200, 350, { lat: 0, lng: 0, photoBeers: photos('p', 10) })];
  for (const coastKm of [21, 97]) for (const pixelsPerKm of [.08, 4]) {
    const landMask = metricCoastalMask(pixelsPerKm, coastKm);
    const result = layoutMapMarkers(input, { ...options, zoom: 10, landMask, selectedId: 'p' });
    assert.equal(renderedPhotos(result).length, 0, `${coastKm}km offshore does not qualify as a 20km coast correction`);
  }
  const landMask = metricCoastalMask(10, 5, true);
  assert.ok(landMask.componentAt(200, 350) >= 0, 'the original island is represented as actual land');
  const result = layoutMapMarkers(input, { ...options, zoom: 10, landMask, selectedId: 'p' });
  assert.ok(renderedPhotos(result).length > 0, 'the photograph may now overhang its original small island');
  assert.ok(renderedPhotos(result).every(photo => photo.landContactX <= 204 && photo.centerX < 215), 'no photo may use the distant mainland across the 46px strait');
});

test('a visible safe old image survives when its brewery anchor leaves the viewport or faces away', () => {
  for (const original of [place('p', -30, 350), place('p', 500, 350, { retainOnly: true })]) {
    const input = [{ ...original, beerCount: 30, photoBeers: photos('p', 30) }];
    const x = original.x < 0 ? 35 : 540;
    const opts = { ...options, landMask: mockLand([{ left: 0, right: 1000, top: 0, bottom: 700 }]), preservePrevious: true,
      previousPlacements: new Map([['p-000', { x, y: 350, maxDisplayDistance: 150, scale: .6 }]]) };
    const result = layoutMapMarkers(input, opts), kept = renderedPhotos(result);
    assert.equal(kept.length, 1, 'sources outside the active view retain old pictures but never create new ones');
    assert.ok(kept[0].placementRetained); assert.equal(kept[0].centerX, x); assert.equal(kept[0].scale, 1);
    assert.equal(result.clipped.length, 0);
    assertGeometry(result, input, opts);
    assert.equal(layoutMapMarkers(input, { ...opts, previousPlacements: new Map() }).markers.length, 0);
  }
});

test('refined coastlines display uniform Ellon frames once enough land is visible, including extreme zoom', () => {
  const features = JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson', import.meta.url), 'utf8')).features;
  const geographicMask = createGeographicLandMask(features, { width: 8192, height: 4096, coastMargin: 0 });
  const source = place('coastal-fixture', 0, 0, { lat: 57.37214, lng: -2.05818, beerCount: 40, photoBeers: photos('coastal-fixture', 40) });
  const rad = Math.PI / 180;
  for (const [mode, width, height, zooms, photoZoomBase] of [
    ['desktop', 1440, 674, [3.93, 8.96, 13.56, 17.84, 26], 1.506],
    ['phone', 424, 516, [5.95, 7.83, 10.3, 13.56, 17.84], 1.156],
    ['flat', 1440, 674, [4, 6.4, 10.24, 26.21, 67.1], 1],
  ]) for (const zoom of zooms) {
    let unproject;
    if (mode === 'flat') {
      unproject = (x, y) => ({ lng: source.lng + (x - width / 2) / width * 360 / zoom,
        lat: source.lat - (y - height / 2) / width * 360 / zoom });
    } else {
      const camera = new PerspectiveCamera(50, width / height, .1, 10000), distance = 100 * (1 + 2.5 / zoom);
      camera.position.set(distance * Math.cos(source.lat * rad) * Math.sin(source.lng * rad),
        distance * Math.sin(source.lat * rad), distance * Math.cos(source.lat * rad) * Math.cos(source.lng * rad));
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      unproject = createSphereUnprojector(camera, width, height);
    }
    const landMask = createScreenLandMask({ width, height, unproject, geographicMask });
    const input = [{ ...source, x: width / 2, y: height / 2 }];
    for (const selectedId of [undefined, source.id]) {
      const opts = { width, height, zoom, photoZoomBase, compact: width < 600, selectedId, landMask };
      const result = layoutMapMarkers(input, opts);
      // Phone 13.56 had only a border-touching candidate: it was accepted by
      // placement but hidden by rendering. Require the next close view to show
      // a safely padded frame; every returned frame is still checked below.
      if (zoom >= (mode === 'flat' ? 10.24 : mode === 'phone' ? 17.84 : 13.56))
        assert.ok(renderedPhotos(result).length > 0, `${mode} ${zoom}, selected=${!!selectedId}: a uniform full-size coastal image must fit in a sufficiently close view`);
      assertGeometry(result, input, opts);
    }
  }
});


test('new photographs remain within 300km even on continuous land at a distant view', () => {
  const landMask = createScreenLandMask({ width: 1000, height: 700, step: 2, padding: 2,
    unproject: (x, y) => ({ lng: (x - 500) / 20, lat: (350 - y) / 20 }), geographicMask: { contains: () => true } });
  const input = [place('p', 500, 350, { lat: 0, lng: 0, beerCount: 300, photoBeers: photos('p', 300) })];
  const opts = { ...options, landMask, selectedId: 'p' };
  const result = layoutMapMarkers(input, opts);
  assert.ok(renderedPhotos(result).length > 1);
  for (const photo of renderedPhotos(result)) {
    const point = landMask.geographicAt(photo.centerX, photo.centerY), rad = Math.PI / 180;
    const km = 12742 * Math.asin(Math.sqrt(Math.sin(point.lat * rad / 2) ** 2
      + Math.cos(point.lat * rad) * Math.sin(point.lng * rad / 2) ** 2));
    assert.ok(km <= 300, `a new image cannot drift ${km.toFixed(1)}km from its actual brewery`);
  }
  assertGeometry(result, input, opts);
});


test('a tiny real island lost only by screen sampling cannot use offshore snapping across water', () => {
  const degreesKm = Math.PI / 180 * 6371;
  const landMask = createScreenLandMask({ width: 1000, height: 700, step: 2, padding: 2,
    unproject: (x, y) => ({ lng: (x - 200) / 4 / degreesKm, lat: (350 - y) / 4 / degreesKm }),
    geographicMask: { contains: (lng, lat) => lng * degreesKm >= 5
      || (Math.abs(lng * degreesKm) < .08 && Math.abs(lat * degreesKm) < .08) } });
  assert.equal(landMask.geographicContains(0, 0), true, 'the geographic source is on its own real island');
  assert.equal(landMask.componentAt(200, 350), -1, 'the island is too narrow for a complete conservative screen cell');
  const input = [place('island', 200, 350, { lat: 0, lng: 0 })];
  const result = layoutMapMarkers(input, { ...options, landMask, zoom: 10 });
  assert.ok(renderedPhotos(result).length > 0, 'an actual island sample inside the frame is sufficient even without a conservative path cell');
  assert.ok(renderedPhotos(result).every(photo => Math.abs(photo.landContactX - 200) < .32 && Math.abs(photo.landContactY - 350) < .32),
    'routing stays on the source island and does not cross 5km of water to mainland');
  assertGeometry(result, input, { ...options, landMask, zoom: 10 });
});


test('real Warkworth and Izu land routes survive narrow bridges split by conservative screen cells', () => {
  const features = JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson', import.meta.url), 'utf8')).features;
  const geographicMask = createGeographicLandMask(features, { width: 8192, height: 4096, coastMargin: 0 });
  const catalog = JSON.parse(readFileSync(new URL('../public/data/beertasting.json', import.meta.url), 'utf8'));
  const baird = catalog.breweries.find(brewery => brewery.name === 'Baird Beer');
  const coordinates = [[-36.4, 174.66666667], [baird.lat, baird.lng]], rad = Math.PI / 180;
  for (const [lat, lng] of coordinates) for (const zoom of [13.56, 17.84]) {
    const width = 1440, height = 674, camera = new PerspectiveCamera(50, width / height, .1, 10000), distance = 100 * (1 + 2.5 / zoom);
    camera.position.set(distance * Math.cos(lat * rad) * Math.sin(lng * rad), distance * Math.sin(lat * rad), distance * Math.cos(lat * rad) * Math.cos(lng * rad));
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const landMask = createScreenLandMask({ width, height, geographicMask, unproject: createSphereUnprojector(camera, width, height) });
    const input = [place('coastal-source', width / 2, height / 2, { lat, lng, beerCount: 6, photoBeers: photos('coastal-source', 6) })];
    const opts = { width, height, landMask, zoom, photoZoomBase: 1.506, selectedId: input[0].id };
    const result = layoutMapMarkers(input, opts);
    assert.ok(renderedPhotos(result).length > 0, `${lat},${lng} at zoom ${zoom} must follow actual connecting land`);
    assertGeometry(result, input, opts);
    const repeated = layoutMapMarkers(input, { ...opts, previousPlacements: projectedPlacements(result), preservePrevious: true });
    assert.ok(renderedPhotos(repeated).every(photo => photo.placementRetained));
    assertGeometry(repeated, input, opts);
  }
});

test('a coastal photo keeps its offshore center and DOM anchor when its raw frame still touches land', () => {
  const degreesKm = Math.PI / 180 * 6371;
  const landMask = createScreenLandMask({ width: 1000, height: 700, step: 2, padding: 2,
    unproject: (x, y) => ({ lng: (x - 500) / 10 / degreesKm, lat: (350 - y) / 10 / degreesKm }),
    geographicMask: { contains: lng => lng >= 0 } });
  const input = [place('coast', 503, 350, { lat: 0, lng: .3 / degreesKm, photoBeers: photos('coast', 20) })];
  const opts = { ...options, zoom: 2, landMask, preservePrevious: true,
    previousPlacements: new Map([['coast-000', { x: 498, y: 350, maxDisplayDistance: 120 }]]) };
  const result = layoutMapMarkers(input, opts), retained = renderedPhotos(result).find(photo => photo.beer.id === 'coast-000');
  assert.ok(retained?.placementRetained);
  assert.equal(retained.centerX, 498); assert.equal(retained.centerY, 350);
  assert.equal(landMask.componentAt(retained.centerX, retained.centerY), -1, 'the unchanged photo center is in water');
  assert.ok(retained.landContactX >= 500, 'a distinct routing support remains on the original shore');
  assertGeometry(result, input, opts);
  const whollyAtSea = layoutMapMarkers(input, { ...opts,
    previousPlacements: new Map([['coast-000', { x: 480, y: 350, maxDisplayDistance: 120 }]]) });
  assert.equal(renderedPhotos(whollyAtSea).some(photo => photo.beer.id === 'coast-000'), false, 'a wholly ocean old anchor must hide rather than jump');
});

test('contact-based geographic fallback cannot skip a narrow high-latitude water raster cell', () => {
  const waterLeft = .3515625, waterRight = .3955078125;
  const landMask = {
    geographicWidth: 8192, geographicHeight: 4096,
    geographicContains: lng => lng < waterLeft || lng >= waterRight,
    geographicAt: (x, y) => ({ lng: (x - 300) / 10, lat: 80 + (350 - y) / 100 }),
    componentAt: () => -1, containsPoint: () => false,
    nearestLandPoint: () => null, distancesFrom: () => ({ distanceAt: () => Infinity }),
    intersectsRect: rect => rect.left > 365 && rect.right < 400 && rect.top > 325 && rect.bottom < 375,
    landPointInRect(rect) { return this.intersectsRect(rect) ? { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 } : null; },
  };
  const input = [place('polar', 300, 350, { lat: 80, lng: 0, photoBeers: photos('polar', 10) })];
  const result = layoutMapMarkers(input, { ...options, zoom: 10, selectedId: 'polar', landMask });
  assert.equal(renderedPhotos(result).length, 0, 'sub-kilometre water pixels cannot become a new straight-line land route');
});

test('intersection-only mask contract admits coastal overhang while invalid frames fail closed', () => {
  const seen = [];
  const mask = { intersectsRect(rect) { seen.push({ ...rect }); return rect.right > 100 && rect.left < 110; } };
  const rect = { left: 98, right: 102, top: 5, bottom: 10 };
  assert.equal(photoTouchesLand(mask, rect), true);
  assert.deepEqual(seen, [rect], 'new API receives the exact unpadded image frame');
  for (const invalid of [null, { ...rect, right: 98 }, { ...rect, left: NaN }]) assert.equal(photoTouchesLand(mask, invalid), false);
});
