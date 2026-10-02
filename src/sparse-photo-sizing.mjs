/** Camera-independent size preferences; screen layout must still check fit. */
export const MAX_SPARSE_PHOTO_SCALE = 1.55;

const radiusKm = 300;
const earthRadiusKm = 6371;
const radiusAngle = radiusKm / earthRadiusKm;
const radiusCos = Math.cos(radiusAngle);
const radians = Math.PI / 180;
const normalizeLongitude = value => ((value % 360) + 540) % 360 - 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validCoordinates = place => Number.isFinite(place?.lat)
  && Math.abs(place.lat) <= 90 && Number.isFinite(place?.lng);

/**
 * Return Map<sourceId, scale> for already-eligible brewery photo lists.
 *
 * Use the full eligible catalog, before country/search/camera filtering, so
 * rotating or selecting a country cannot change a bottle's preferred size.
 * Nearby photo count sets a smooth preference from 1 to 1.55. Four or fewer
 * nearby photos can grow to 1.55; 24 or more stay compact. A singleton has the
 * same bounded maximum: this never tries to stretch it across an empty country.
 *
 * Breweries at identical coordinates share an aggregated count. Distances use
 * the sphere (including the date line and poles), with a smooth 300 km cutoff.
 * There is deliberately no screen, camera, country area, or rank input.
 */
export function createSparsePhotoScaleMap(places = []) {
  const scales = new Map();
  const locations = new Map();
  for (const place of places) {
    if (place?.id == null) continue;
    scales.set(place.id, 1);
    if (!validCoordinates(place) || !Array.isArray(place.photoBeers)) continue;
    const beers = place.photoBeers.filter(beer => typeof beer?.image === 'string' && beer.image.trim());
    if (!beers.length) continue;
    const lat = place.lat;
    const lng = Math.abs(lat) === 90 ? 0 : normalizeLongitude(place.lng);
    const key = `${lat}:${lng}`;
    let location = locations.get(key);
    if (!location) {
      const phi = lat * radians, theta = lng * radians;
      location = { ids: new Set(), photos: new Set(), vector: [
        Math.cos(phi) * Math.cos(theta), Math.cos(phi) * Math.sin(theta), Math.sin(phi),
      ] };
      locations.set(key, location);
    }
    location.ids.add(place.id);
    // A repeated beer at the same location must not manufacture local density.
    for (const beer of beers) location.photos.add(beer.id == null ? `image:${beer.image}` : `id:${beer.id}`);
  }
  const groups = [...locations.values()];
  const densities = groups.map(group => group.photos.size);
  // Dot products discard far-away groups without an expensive inverse cosine.
  // Each symmetric pair is calculated only once.
  for (let i = 0; i < groups.length; i++) {
    const a = groups[i].vector;
    for (let j = i + 1; j < groups.length; j++) {
      const b = groups[j].vector;
      const cosine = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
      if (cosine <= radiusCos) continue;
      const fraction = Math.acos(cosine) / radiusAngle;
      const weight = (1 - fraction * fraction) ** 2;
      densities[i] += groups[j].photos.size * weight;
      densities[j] += groups[i].photos.size * weight;
    }
  }
  groups.forEach((group, index) => {
    const density = clamp((densities[index] - 4) / 20, 0, 1);
    const smoothDensity = density * density * (3 - 2 * density);
    // Quantization removes immaterial floating-point differences after sorting.
    const scale = Math.round((1 + (MAX_SPARSE_PHOTO_SCALE - 1) * (1 - smoothDensity)) * 10000) / 10000;
    for (const id of group.ids) scales.set(id, scale);
  });
  return scales;
}

const frameRect = (frame, scale) => ({
  left: frame.x - frame.width * scale / 2, right: frame.x + frame.width * scale / 2,
  top: frame.y - frame.height * scale / 2, bottom: frame.y + frame.height * scale / 2,
});
const rectArea = rect => (rect.right - rect.left) * (rect.bottom - rect.top);
const intersectionArea = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/**
 * Enlarge valid base frames without removing or displacing any base photo.
 *
 * Inputs: [{ id, x, y, width, height, targetScale }], with screen-space centers
 * and unscaled base dimensions. Base frames must already satisfy layout rules.
 * Output: Map<id, { scale, rect }>. Invalid/duplicate IDs are ignored. Input
 * order is priority order, so callers should keep it deterministic.
 *
 * Every other base frame is reserved before any enlargement. Each candidate
 * must fit acceptRect(rect), <=22% pair overlap of the smaller frame and <=35%
 * summed overlap for both itself and every affected neighbor. This is for a
 * settled layout, not the animation loop. A rejected enlargement always falls
 * back to the unchanged base frame; it cannot hide a previously valid photo.
 */
export function fitSparsePhotoFrames(frames = [], { acceptRect = () => true } = {}) {
  const seen = new Set();
  const entries = frames.filter(frame => {
    if (frame?.id == null || seen.has(frame.id)
      || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)
      || frame.width <= 0 || frame.height <= 0) return false;
    seen.add(frame.id);
    return true;
  });
  const rects = entries.map(frame => frameRect(frame, 1));
  const areas = rects.map(rectArea);
  const sums = entries.map(() => 0);
  const result = new Map(entries.map((frame, index) => [frame.id, { scale: 1, rect: rects[index] }]));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const overlap = intersectionArea(rects[i], rects[j]);
      sums[i] += overlap; sums[j] += overlap;
    }
  }
  const epsilon = 1e-7;
  for (let i = 0; i < entries.length; i++) {
    const frame = entries[i];
    const maximum = Number.isFinite(frame.targetScale) ? clamp(frame.targetScale, 1, MAX_SPARSE_PHOTO_SCALE) : 1;
    for (let step = 0; maximum - step * 0.1 > 1 + epsilon; step++) {
      const scale = Math.round((maximum - step * 0.1) * 10000) / 10000;
      const rect = frameRect(frame, scale);
      if (!acceptRect(rect)) continue;
      const area = rectArea(rect), deltas = new Float64Array(entries.length);
      let total = 0, fits = true;
      for (let j = 0; j < entries.length; j++) {
        if (i === j) continue;
        const overlap = intersectionArea(rect, rects[j]);
        deltas[j] = overlap - intersectionArea(rects[i], rects[j]);
        total += overlap;
        if (overlap > Math.min(area, areas[j]) * 0.22 + epsilon
          || sums[j] + deltas[j] > areas[j] * 0.35 + epsilon
          || total > area * 0.35 + epsilon) { fits = false; break; }
      }
      if (!fits) continue;
      for (let j = 0; j < entries.length; j++) if (i !== j) sums[j] += deltas[j];
      sums[i] = total; areas[i] = area; rects[i] = rect;
      result.set(frame.id, { scale, rect });
      break;
    }
  }
  return result;
}
