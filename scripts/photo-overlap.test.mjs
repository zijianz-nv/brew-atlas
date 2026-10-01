import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoOccupancy, photoIntersectionArea} from '../src/photo-overlap.mjs';

const rect = (left, top = 0, width = 100, height = 100) => ({left, top, right:left + width, bottom:top + height});
const areaOf = box => (box.right - box.left) * (box.bottom - box.top);

test('light partial overlap is allowed; edge contact and corner contact cost no overlap', () => {
  const occupancy = createPhotoOccupancy();
  assert.equal(occupancy.add(rect(0)), true);
  assert.equal(occupancy.canPlace(rect(80)), true);
  assert.equal(occupancy.canPlace(rect(100)), true);
  assert.equal(occupancy.canPlace(rect(100, 100)), true);
  assert.equal(photoIntersectionArea(rect(0), rect(80)), 2000);
  assert.equal(photoIntersectionArea(rect(0), rect(100)), 0);
  assert.equal(photoIntersectionArea(rect(0), rect(100, 100)), 0);
});

test('pair limit uses the smaller image, with the exact threshold accepted', () => {
  const occupancy = createPhotoOccupancy();
  occupancy.add(rect(0));
  assert.equal(occupancy.canPlace(rect(78)), true);
  assert.equal(occupancy.canPlace(rect(77.99)), false);
  assert.equal(occupancy.canPlace(rect(95, 40, 20, 20)), false, '25% of the smaller image is covered');
  assert.equal(occupancy.canPlace(rect(96, 40, 20, 20)), true, '20% of the smaller image is covered');
});

test('duplicate rectangles and full containment are rejected even with loose options', () => {
  for (const options of [{}, {maxPairOverlap:1, maxTotalOverlap:1}]) {
    const occupancy = createPhotoOccupancy(options), box = rect(0);
    assert.equal(occupancy.add(box), true);
    assert.equal(occupancy.canPlace(box), false);
    assert.equal(occupancy.add({...box}), false);
    assert.equal(occupancy.canPlace(rect(20, 20, 10, 10)), false);
    assert.equal(occupancy.canPlace(rect(-10, -10, 120, 120)), false);
  }
});

test('a new image cannot exhaust the accumulated budget of an old image', () => {
  const occupancy = createPhotoOccupancy();
  occupancy.add(rect(0));
  occupancy.add(rect(-80));
  assert.equal(occupancy.canPlace(rect(80)), false, 'old middle image would be covered by 40%');
  assert.equal(occupancy.add(rect(80)), false, 'unsafe add must not change occupancy');
  assert.equal(occupancy.canPlace(rect(85)), true, '35% cumulative coverage remains allowed');
});

test('a new image also has its own cumulative overlap limit', () => {
  const occupancy = createPhotoOccupancy();
  occupancy.add(rect(-80));
  occupancy.add(rect(80));
  assert.equal(occupancy.canPlace(rect(0)), false, 'candidate would be covered by 40%');
});

test('a valid final arrangement is accepted in each insertion order', () => {
  const boxes = [rect(0), rect(-82.5), rect(82.5)];
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const occupancy = createPhotoOccupancy();
    for (const index of order) {
      assert.equal(occupancy.canPlace(boxes[index]), true);
      assert.equal(occupancy.add(boxes[index]), true);
    }
  }
});

test('canPlace is read-only and caller mutations cannot alter already stored bounds', () => {
  const occupancy = createPhotoOccupancy(), box = rect(0);
  occupancy.add(box);
  for (let i = 0; i < 5; i++) assert.equal(occupancy.canPlace(rect(-80)), true);
  assert.equal(occupancy.add(rect(-80)), true);
  Object.assign(box, rect(500));
  assert.equal(occupancy.canPlace(rect(80)), false);
  assert.equal(occupancy.canPlace(rect(500)), true);
});

test('invalid geometry and invalid limits fail closed without reserving space', () => {
  const invalid = [null, undefined, {}, rect(0, 0, 0), rect(0, 0, -1), rect(0, 0, 1, 0),
    {left:0, top:0, right:Infinity, bottom:1}, {left:NaN, top:0, right:1, bottom:1},
    {left:'0', top:0, right:1, bottom:1}, rect(-1e308, 0, Infinity, 1), rect(0, 0, 1e308, 1e308)];
  const occupancy = createPhotoOccupancy();
  for (const box of invalid) {
    assert.equal(occupancy.canPlace(box), false);
    assert.equal(occupancy.add(box), false);
    assert.equal(photoIntersectionArea(box, rect(0)), Infinity);
  }
  assert.equal(occupancy.add(rect(0)), true);
  for (const options of [{maxPairOverlap:NaN},{maxTotalOverlap:Infinity},{maxPairOverlap:-.1},{maxTotalOverlap:1.1}]) {
    assert.equal(createPhotoOccupancy(options).canPlace(rect(0)), false);
  }
});

test('zero overlap limits still allow exactly touching rectangles across negative grid cells', () => {
  const occupancy = createPhotoOccupancy({maxPairOverlap:0, maxTotalOverlap:0});
  assert.equal(occupancy.add(rect(-64, -64, 64, 64)), true);
  assert.equal(occupancy.add(rect(0, -64, 64, 64)), true);
  assert.equal(occupancy.canPlace(rect(-.01, -64, 64, 64)), false);
});

test('oversized and extreme-coordinate rectangles use a bounded fallback', () => {
  const occupancy = createPhotoOccupancy();
  assert.equal(occupancy.add(rect(0, 0, 100000, 100000)), true);
  assert.equal(occupancy.canPlace(rect(99990, 50000, 100, 100)), true);
  assert.equal(occupancy.canPlace(rect(50000, 50000)), false);
  const extreme = rect(1e20, 1e20, 1e6, 1e6);
  assert.equal(occupancy.add(extreme), true);
  assert.equal(occupancy.canPlace({...extreme}), false);
});

test('bucket decisions match a full-scan oracle over 661 candidate photos', () => {
  const occupancy = createPhotoOccupancy(), placed = [];
  let seed = 71829;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32);
  const canPlaceByScan = candidate => {
    let covered = 0;
    for (const old of placed) {
      const intersection = photoIntersectionArea(candidate, old);
      if (intersection > .22 * Math.min(areaOf(candidate), areaOf(old))) return false;
      covered += intersection;
      const oldCovered = placed.filter(other => other !== old).reduce((sum, other) => sum + photoIntersectionArea(old, other), intersection);
      if (oldCovered > .35 * areaOf(old)) return false;
    }
    return covered <= .35 * areaOf(candidate);
  };
  for (let i = 0; i < 661; i++) {
    const candidate = rect(Math.floor(random() * 1100) - 100, Math.floor(random() * 750) - 100, 18 + Math.floor(random() * 12), 28 + Math.floor(random() * 18));
    const expected = canPlaceByScan(candidate);
    assert.equal(occupancy.canPlace(candidate), expected, `candidate ${i}`);
    if (expected) { assert.equal(occupancy.add(candidate), true); placed.push(candidate); }
  }
  assert(placed.length > 250, 'exercise occupancy at a realistic photo count');
});
