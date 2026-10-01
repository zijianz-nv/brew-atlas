import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera } from 'three';
import { createGeographicLandMask } from '../src/land-mask.mjs';
import { choosePhotoFocusAltitude } from '../src/photo-focus.mjs';

const features = JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson', import.meta.url))).features;
const geographicMask = createGeographicLandMask(features, { width: 8192, height: 4096, coastMargin: 0 });
const target = { id: 'rococo-gotemba', lat: 35.30869444, lng: 138.93461111 };
const place = source => ({ ...source, brewery: source, beerCount: 1,
  photoBeers: [{ id: `${source.id}-photo`, image: '/local.jpg' }] });
const homeAltitude = (width, height) => Math.max(1.5, Math.min(4.8,
  Math.sqrt(1 + 1 / (Math.min(width * .87, height * .87) / height * Math.tan(25 * Math.PI / 180)) ** 2) - 1)) * .76;

test('a deliberate Japanese island focus finds a real land slot with unchanged full-size photos', () => {
  for (const [width, height] of [[1440, 674], [390, 608]]) {
    const camera = new PerspectiveCamera(50, width / height, .1, 3000);
    camera.position.set(200, 100, 300); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const before = camera.matrixWorld.toArray(), sourceBefore = JSON.stringify(target);
    const result = choosePhotoFocusAltitude({ camera, target, places: [place(target)], geographicMask,
      width, height, initialAltitude: width < 500 ? .42 : .6,
      layoutOptions: { compact: width < 600, photoZoomBase: 2.5 / homeAltitude(width, height) } });
    assert.equal(result.found, true);
    // Photo sizes and allowed overlap are a shared UI policy. If that policy
    // already fits Japan, focusing must not zoom further just for this test.
    if (result.attempts[0].targetPhotos) assert.equal(result.altitude, result.attempts[0].altitude);
    else assert(result.altitude < result.attempts[0].altitude);
    assert(result.altitude >= .08);
    assert(result.attempts.at(-1).targetPhotos >= 1);
    assert(result.attempts.length <= 9);
    assert.deepEqual(camera.matrixWorld.toArray(), before, 'probing must not move the actual camera');
    assert.equal(JSON.stringify(target), sourceBefore, 'source coordinates stay unchanged');
  }
});

test('a continental focus keeps its normal distance and missing photos never trigger zoom', () => {
  const width = 1440, height = 674, camera = new PerspectiveCamera(50, width / height, .1, 3000);
  const inland = { id: 'munich', lat: 48.1375, lng: 11.575 };
  const options = { camera, target: inland, places: [place(inland)], geographicMask, width, height,
    layoutOptions: { photoZoomBase: 2.5 / homeAltitude(width, height) } };
  const result = choosePhotoFocusAltitude(options);
  assert.equal(result.found, true); assert.equal(result.altitude, .6); assert.equal(result.attempts.length, 1);
  assert.deepEqual(choosePhotoFocusAltitude({ ...options, places: [] }), { altitude: .6, found: false, attempts: [] });
});

test('an impossible ocean source is bounded and preserves the normal focus instead of crossing sea', () => {
  const width = 390, height = 608, camera = new PerspectiveCamera(50, width / height, .1, 3000);
  const ocean = { id: 'ocean', lat: 0, lng: -140 };
  const result = choosePhotoFocusAltitude({ camera, target: ocean, places: [place(ocean)], geographicMask,
    width, height, initialAltitude: .42, maximumAttempts: 3 });
  assert.equal(result.found, false); assert.equal(result.altitude, .42); assert.equal(result.attempts.length, 3);
  assert(result.attempts.every(attempt => attempt.targetPhotos === 0));
});
