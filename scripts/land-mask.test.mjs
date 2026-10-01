import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGeographicLandMask, createScreenLandMask, createProjectedLandGuard } from '../src/land-mask.mjs';

const ring = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]];
const polygon = (...coordinates) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates } });
const planar = (contains, options = {}) => createScreenLandMask({ width: 40, height: 30,
  step: 2, padding: 0, unproject: (x, y) => ({ lng: x, lat: y }), geographicMask: { contains }, ...options });

test('geographic raster keeps polygon holes while adjoining countries form continuous land', () => {
  const mask = createGeographicLandMask([polygon(ring(-40, -30, 40, 30), ring(-10, -10, 10, 10)),
    polygon(ring(40, -30, 80, 30))], { width: 720, height: 360 });
  assert.equal(mask.contains(-25, 0), true);
  assert.equal(mask.contains(0, 0), false);
  assert.equal(mask.contains(40, 0), true);
  assert.equal(mask.contains(81, 0), false);
  assert.equal(mask.contains(0, 35), false);
  assert.equal(mask.contains(NaN, 0), false);
  assert.equal(mask.contains(0, 100), false);
});

test('multipolygons preserve separate islands and antimeridian-cut geometry', () => {
  const mask = createGeographicLandMask([{ type: 'MultiPolygon', coordinates: [
    [ring(170, -20, 180, -10)], [ring(-180, -20, -170, -10)], [ring(20, 10, 30, 20)],
  ] }], { width: 720, height: 360 });
  assert.equal(mask.contains(179.9, -15), true);
  assert.equal(mask.contains(-179.9, -15), true);
  assert.equal(mask.contains(181, -15), true);
  assert.equal(mask.contains(0, -15), false);
  assert.equal(mask.contains(25, 15), true);
  assert.equal(mask.contains(40, 15), false);
});

test('rectangles test their whole interior, including an enclosed lake and a narrow bay', () => {
  const lake = planar((x, y) => !(x >= 16 && x <= 20 && y >= 12 && y <= 16));
  assert.equal(lake.containsPoint(5, 5), true);
  assert.equal(lake.containsRect({ left: 4, right: 28, top: 4, bottom: 24 }), false);
  assert.equal(lake.containsRect({ left: 2, right: 10, top: 2, bottom: 10 }), true);
  const bay = planar((x, y) => !(x >= 17 && x <= 19 && y <= 20));
  assert.equal(bay.containsRect({ left: 4, right: 28, top: 6, bottom: 16 }), false);
});

test('off-globe, partial viewport and malformed rectangles fail closed', () => {
  const mask = planar(() => true, { unproject: (x, y) => (x - 20) ** 2 + (y - 15) ** 2 < 14 ** 2 ? { lng: x, lat: y } : null });
  assert.equal(mask.containsRect({ left: 16, right: 24, top: 12, bottom: 18 }), true);
  assert.equal(mask.containsRect({ left: 0, right: 24, top: 12, bottom: 18 }), false);
  assert.equal(mask.containsRect({ left: -1, right: 24, top: 12, bottom: 18 }), false);
  assert.equal(mask.containsRect({ left: 2, right: 4, top: 4, bottom: 3 }), false);
  assert.equal(mask.containsRect({ left: NaN, right: 4, top: 2, bottom: 3 }), false);
  assert.equal(mask.componentAt(100, 100), -1);
  assert.equal(mask.componentAt(0, 0), -1);
});

test('connected-land labels and bounded coastal lookup never merge separate islands', () => {
  const mask = planar(x => x < 12 || x > 24);
  assert.ok(mask.componentAt(4, 10) >= 0);
  assert.equal(mask.componentAt(4, 10), mask.componentAt(8, 20));
  assert.notEqual(mask.componentAt(4, 10), mask.componentAt(30, 10));
  assert.equal(mask.componentAt(18, 10), -1);
  assert.equal(mask.nearestLandPoint(18, 10, 3), null);
  const near = mask.nearestLandPoint(12, 10, 6);
  assert.ok(near && near.distance <= 6);
  assert.equal(near.component, mask.componentAt(4, 10));
});

test('land-path distance charges the coastal detour even within one connected landmass', () => {
  // Two coasts connect only around the bottom of a large sea, analogous to
  // Europe/Africa being connected through a distant land bridge.
  const mask = planar((x, y) => x < 30 || x > 70 || y > 60, { width: 100, height: 80 });
  assert.equal(mask.componentAt(21, 11), mask.componentAt(81, 11));
  const short = mask.distancesFrom(21, 11, 80, { snapDistance: 0 });
  assert.equal(short.distanceAt(81, 11), Infinity);
  assert.equal(short.distanceAt(21, 31), 20);
  const long = mask.distancesFrom(21, 11, 200, { snapDistance: 0 });
  assert.ok(long.distanceAt(81, 11) > 150 && long.distanceAt(81, 11) <= 200);
  assert.equal(mask.canReach(21, 11, 81, 11, { maxDistance: 80 }), false);
  assert.equal(mask.canReach(21, 11, 81, 11, { maxDistance: 200 }), true);
  assert.equal(short, mask.distancesFrom(21, 11, 80, { snapDistance: 0 }), 'same source/radius reuses BFS');
});

test('coastal path starts are bounded and routes cannot jump water or diagonal corners', () => {
  const islands = planar(x => x < 12 || x > 24);
  assert.equal(islands.distancesFrom(12, 11, 10, { snapDistance: 0 }).source, null);
  const snapped = islands.distancesFrom(12, 11, 10, { snapDistance: 5 });
  assert.ok(snapped.source && snapped.source.distance > 0);
  assert.equal(snapped.distanceAt(7, 11), 5);
  assert.equal(snapped.distanceAt(29, 11), Infinity);
  const diagonal = planar((x, y) => (x <= 10 && y <= 10) || (x >= 10 && y >= 10));
  assert.equal(diagonal.canReach(7, 7, 13, 13, { maxDistance: 100 }), false);
});

test('path search reports its work bound and rejects invalid destinations', () => {
  const mask = planar(() => true);
  const route = mask.distancesFrom(11, 11, 100000);
  assert.equal(route.maxDistance, 510);
  assert.equal(route.truncated, true);
  assert.ok(route.sampledCells <= 511 * 511);
  assert.ok(route.visitedCells <= route.sampledCells);
  assert.equal(route.distanceAt(11, 11), 0);
  assert.equal(route.distanceAt(-1, 11), Infinity);
  assert.equal(route.distanceAt(NaN, 11), Infinity);
  assert.equal(mask.distancesFrom(11, 11, -1).distanceAt(11, 11), Infinity);
});

test('padding and fractional viewport edges remain conservative at selectable steps', () => {
  const mask = planar(() => true, { width: 39.5, height: 29.5, step: 3, padding: 2 });
  assert.equal(mask.containsRect({ left: 2, right: 37.5, top: 2, bottom: 27.5 }), true);
  assert.equal(mask.containsRect({ left: 1.9, right: 37.5, top: 2, bottom: 27.5 }), false);
  assert.equal(mask.containsPoint(39.4, 29.4), true);
  assert.equal(mask.containsPoint(39.5, 29.5), false);
});

test('sparse animation guard matches full mask and reuses samples only for the current projection', () => {
  let calls = 0;
  const options = { width: 40, height: 30, step: 2, padding: 2,
    unproject: (x, y) => { calls++; return x < 38 ? { lng: x, lat: y } : null; },
    geographicMask: { contains: (x, y) => !(x >= 16 && x <= 20 && y >= 12 && y <= 16) } };
  const full = createScreenLandMask(options), guard = createProjectedLandGuard(options);
  for (let top = 0; top < 30; top += 2.5) {
    for (let left = 0; left < 40; left += 2.5) {
      const rect = { left, right: left + 8, top, bottom: top + 6 };
      assert.equal(guard.containsRect(rect), full.containsRect(rect));
    }
  }
  const rect = { left: 3, right: 10, top: 3, bottom: 10 };
  assert.equal(guard.containsRect(rect), true);
  const before = calls;
  assert.equal(guard.containsRect(rect), true);
  assert.equal(calls, before, 'same-frame repeat should reuse all projection samples');
  const changed = createProjectedLandGuard({ ...options, unproject: () => null });
  assert.equal(changed.containsRect(rect), false, 'new camera guard must not reuse stale land');
});

test('bundled world geography recognizes land, open water and the texture antimeridian', () => {
  const features = JSON.parse(readFileSync(new URL('../public/maps/world-110m.geojson', import.meta.url), 'utf8'));
  const mask = createGeographicLandMask(features);
  for (const [lng, lat] of [[13.4, 52.5], [-99, 39], [135, -25], [25, 0], [-47, -15], [100, 50], [0, -85]]) {
    assert.equal(mask.contains(lng, lat), true, `${lng},${lat} should be land`);
  }
  for (const [lng, lat] of [[0, 0], [-30, 30], [-150, 0], [80, -30], [0, 88]]) {
    assert.equal(mask.contains(lng, lat), false, `${lng},${lat} should be water`);
  }
});

test('50m coastlines retain real coastal references without expanding open water', () => {
  const geography = JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson', import.meta.url), 'utf8'));
  const mask = createGeographicLandMask(geography, { width: 8192, height: 4096, coastMargin: 0 });
  const land = [
    ['BrewDog city reference, Ellon', -2.05818, 57.37214],
    ['Jeju Beer city reference, Jeju-Si', 126.523, 33.513],
    ['8 Wired city reference, Warkworth', 174.66666667, -36.4],
    ['Hop Federation city reference, Riwaka', 173, -41.08333333],
    ['Garage Project city reference, Wellington', 174.77722222, -41.28888889],
    ['The White Owl city reference, Mumbai', 72.8775, 19.07611111],
    ['Fiji, Viti Levu', 178, -17.8],
    ['Fiji, Vanua Levu', 179.3, -16.5],
    ['Fiji, island east of date line', -179.92, -16.48],
    ['Antarctica west of date line', 179, -85],
    ['Antarctica east of date line', -179, -85],
  ];
  for (const [name, lng, lat] of land) assert.equal(mask.contains(lng, lat), true, name);
  const water = [
    ['Pacific at original Fiji crossing strip', -150, -16.51],
    ['Pacific at original Fiji crossing strip, farther east', -100, -16.49],
    ['Water near Fiji, east of date line', -179, -16.5],
    ['Atlantic at original Russia crossing strip', -30, 65.04],
    ['Arctic at original Russia crossing strip', 0, 71.53],
    ['Southern Ocean west of date line', 179, -60],
    ['Southern Ocean east of date line', -179, -60],
    ['Central Pacific', -150, 0],
    ['Atlantic', -30, 0],
    ['Indian Ocean', 80, -30],
  ];
  for (const [name, lng, lat] of water) assert.equal(mask.contains(lng, lat), false, name);
});

test('50m public asset has closed rings and no non-horizontal uncut date-line edges', () => {
  const geography = JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson', import.meta.url), 'utf8'));
  assert.equal(geography.features.length, 241);
  for (const feature of geography.features) {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      assert.deepEqual(ring[0], ring.at(-1), `${feature.properties.name}: closed ring`);
      for (let i = 1; i < ring.length; i++) {
        const [lng, lat] = ring[i];
        assert.ok(Number.isFinite(lng) && Math.abs(lng) <= 180.000001);
        assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 90.000001);
        assert.ok(Math.abs(lng - ring[i - 1][0]) <= 180 || Math.abs(lat - ring[i - 1][1]) <= 1e-8,
          `${feature.properties.name}: date-line edges must be clipped, except horizontal polar closures`);
      }
    }
  }
});
