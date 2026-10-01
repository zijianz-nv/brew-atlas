const CELL_SIZE = 64;
const MAX_BUCKETS_PER_RECT = 256;

function validRect(input) {
  if (!input || typeof input !== 'object') return null;
  const {left, top, right, bottom} = input;
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  const width = right - left, height = bottom - top, area = width * height;
  if (!(width > 0 && height > 0 && Number.isFinite(area) && area > 0)) return null;
  return {left, top, right, bottom, area};
}

function intersection(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

/** Invalid geometry is unsafe, rather than accidentally counted as no overlap. */
export function photoIntersectionArea(a, b) {
  const left = validRect(a), right = validRect(b);
  return left && right ? intersection(left, right) : Infinity;
}

function bucketKeys(rect) {
  const left = Math.floor(rect.left / CELL_SIZE), right = Math.ceil(rect.right / CELL_SIZE) - 1;
  const top = Math.floor(rect.top / CELL_SIZE), bottom = Math.ceil(rect.bottom / CELL_SIZE) - 1;
  if (![left, right, top, bottom].every(Number.isSafeInteger)) return null;
  const count = (right - left + 1) * (bottom - top + 1);
  // Avoid unbounded grid allocation for oversized or extreme-coordinate input.
  if (count <= 0 || count > MAX_BUCKETS_PER_RECT) return null;
  const keys = [];
  for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) keys.push(`${x},${y}`);
  return keys;
}

const overLimit = (covered, area, fraction) => covered > area * fraction + area * Number.EPSILON * 16;

/**
 * Sum pair intersections conservatively, including areas covered by multiple
 * neighbors. Both the candidate and every existing photograph keep their own
 * remaining overlap budget. Stored bounds are snapshots of the caller's rect.
 */
export function createPhotoOccupancy({maxPairOverlap = .22, maxTotalOverlap = .35} = {}) {
  const validLimits = [maxPairOverlap, maxTotalOverlap].every(value => Number.isFinite(value) && value >= 0 && value <= 1);
  const buckets = new Map(), oversized = [], entries = [];

  function assess(input) {
    const rect = validRect(input);
    if (!validLimits || !rect) return null;
    const keys = bucketKeys(rect);
    const neighbors = keys ? new Set(oversized) : entries;
    if (keys) for (const key of keys) for (const entry of buckets.get(key) || []) neighbors.add(entry);
    const overlaps = [];
    let covered = 0;
    for (const entry of neighbors) {
      const area = intersection(rect, entry.rect);
      if (!area) continue;
      const smallerArea = Math.min(rect.area, entry.rect.area);
      // Full containment is never a useful partial overlap, even with loose options.
      if (area >= smallerArea || overLimit(area, smallerArea, maxPairOverlap)
          || overLimit(entry.covered + area, entry.rect.area, maxTotalOverlap)) return null;
      covered += area;
      if (overLimit(covered, rect.area, maxTotalOverlap)) return null;
      overlaps.push({entry, area});
    }
    return {rect, keys, covered, overlaps};
  }

  return Object.freeze({
    canPlace: rect => Boolean(assess(rect)),
    add(input) {
      const placement = assess(input);
      if (!placement) return false;
      const {rect, keys, covered, overlaps} = placement;
      const entry = {rect, covered};
      for (const overlap of overlaps) overlap.entry.covered += overlap.area;
      entries.push(entry);
      if (!keys) oversized.push(entry);
      else for (const key of keys) {
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(entry);
      }
      return true;
    },
  });
}
