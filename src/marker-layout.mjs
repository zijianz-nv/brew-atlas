/** Screen-space photo layouts. Geographic coordinates always remain source data. */
import { compareBeerPhotoRank } from './beer-ranking.mjs';
import { createPhotoOccupancy } from './photo-overlap.mjs';

const finite = value => Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validPhoto = beer => beer && typeof beer.image === 'string' && beer.image.trim().length > 0;
const hasPhoto = entry => Array.isArray(entry.photoBeers) && entry.photoBeers.some(validPhoto);
const count = entry => finite(entry.beerCount) && entry.beerCount >= 0 ? entry.beerCount : 0;
const rectAt = (x, y, width, height) => ({ left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 });

// Placement and movement must use the same CSS2D rounding margin; otherwise an
// accepted first anchor can be permanently hidden by the render-time guard.
export const photoLandBounds = rect => ({left:rect.left - 0.25,right:rect.right + 0.25,
  top:rect.top - 0.25,bottom:rect.bottom + 0.25});

/** Shared by layout and culling; never enlarge a frame to manufacture contact. */
export function photoTouchesLand(mask, rect) {
  if (!rect || ![rect.left, rect.right, rect.top, rect.bottom].every(finite)
    || rect.right <= rect.left || rect.bottom <= rect.top) return false;
  if (typeof mask?.intersectsRect === 'function') return mask.intersectsRect(rect);
  // Older consumers may provide only the original conservative mask contract.
  return typeof mask?.containsRect === 'function' && mask.containsRect(photoLandBounds(rect));
}
const landSupport = cell => cell.landPoint || cell;


export function markerBounds(marker) {
  return rectAt(marker.x + (marker.displayOffsetX || 0), marker.y + (marker.displayOffsetY || 0), marker.markerWidth, marker.markerHeight);
}
function overlaps(a, b, gap = 0) {
  return a.left < b.right + gap && a.right + gap > b.left && a.top < b.bottom + gap && a.bottom + gap > b.top;
}


function geographicDistance(a, b) {
  if (!a || !b || ![a.lat, a.lng, b.lat, b.lng].every(finite)) return Infinity;
  const rad = Math.PI / 180;
  const square = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(clamp(square, 0, 1)));
}

// A true land coordinate can lie in a screen cell rejected because one corner
// touches water. Reach the nearest fully sampled land cell only through actual
// geographic land; this never bridges a strait from an undersampled island.
function continuousGeographicLand(mask, from, to) {
  if (typeof mask.geographicContains !== 'function' || !mask.geographicContains(from.lng, from.lat)) return false;
  const target = mask.geographicAt(to.x, to.y), distance = geographicDistance(from, target);
  if (!finite(distance) || distance > 300) return false;
  const steps = Math.max(1, Math.ceil(distance), Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2));
  if (steps > 2048) return false;
  // Reuse the raster supercover rather than kilometre-spaced probes: at high
  // latitudes a real water pixel can be narrower than one kilometre.
  return geographicLandSegment(mask, from, target);
}

// Test every geographic-raster cell intersected by a segment. Explicit corner
// checks reject diagonal contacts through a water pixel; short longitude deltas
// keep routes continuous at the antimeridian.
function geographicLandSegment(mask, from, to) {
  const contains = mask.geographicContains, width = mask.geographicWidth, height = mask.geographicHeight;
  const deltaLng = ((to.lng - from.lng + 540) % 360) - 180, deltaLat = to.lat - from.lat;
  const at = t => ({ lng: from.lng + deltaLng * t, lat: from.lat + deltaLat * t });
  if (![width, height].every(value => finite(value) && value > 0)) {
    const steps = Math.max(4, Math.ceil(geographicDistance(from, to) * 4));
    for (let i = 0; i <= steps; i++) { const p = at(i / steps); if (!contains(p.lng, p.lat)) return false; }
    return true;
  }
  const x = (from.lng + 180) / 360 * width, y = (90 - from.lat) / 180 * height;
  const dx = deltaLng / 360 * width, dy = -deltaLat / 180 * height, cuts = [0, 1];
  for (const [start, delta] of [[x, dx], [y, dy]]) {
    if (!delta) continue;
    for (let edge = Math.floor(Math.min(start, start + delta)) + 1; edge < Math.max(start, start + delta); edge++) cuts.push((edge - start) / delta);
  }
  cuts.sort((a, b) => a - b);
  const sample = t => {
    const sx = x + dx * t, sy = y + dy * t;
    const xs = Math.abs(sx - Math.round(sx)) < 1e-8 ? [sx - 1e-7, sx + 1e-7] : [sx];
    const ys = Math.abs(sy - Math.round(sy)) < 1e-8 ? [sy - 1e-7, sy + 1e-7] : [sy];
    return xs.every(px => ys.every(py => contains(px / width * 360 - 180, 90 - py / height * 180)));
  };
  for (let i = 0; i < cuts.length; i++) {
    if (!sample(cuts[i]) || (i && !sample((cuts[i - 1] + cuts[i]) / 2))) return false;
  }
  return true;
}

// The conservative screen raster can sever a real narrow land bridge. Only
// when its paths cannot place a picture, use a bounded route on the underlying
// geographic land raster. Every raster cell touched by a route stays on real land;
// unlike a sea-distance allowance this cannot jump from an island to mainland.
const geographicRouteCache = new WeakMap();
function geographicLandRoute(mask, source) {
  const contains = mask.geographicContains;
  if (typeof contains !== 'function' || !contains(source.lng, source.lat)) return null;
  let routes = geographicRouteCache.get(contains);
  if (!routes) { routes = new Map(); geographicRouteCache.set(contains, routes); }
  const key = `${source.lat}:${source.lng}`;
  if (routes.has(key)) return routes.get(key);
  const stepKm = 2, half = 118, side = half * 2 + 1;
  // Longitude scale is bounded near the poles. Over this local latitude range,
  // each nominal 2km edge is at most 2.5km. 118 edges plus the final connection
  // therefore stay below 300km; this deliberately favours false negatives.
  const deltaLat = stepKm / (Math.PI / 180 * 6371);
  const deltaLng = deltaLat / Math.max(.2, Math.cos(source.lat * Math.PI / 180));
  const land = new Int8Array(side * side), steps = new Uint16Array(side * side).fill(65535);
  const queue = new Uint32Array(side * side);
  const pointAt = index => ({ lng: source.lng + (index % side - half) * deltaLng,
    lat: source.lat + (Math.floor(index / side) - half) * deltaLat });
  const isLand = index => {
    if (!land[index]) { const point = pointAt(index); land[index] = contains(point.lng, point.lat) ? 1 : -1; }
    return land[index] === 1;
  };
  const origin = half * side + half;
  queue[0] = origin; steps[origin] = 0; land[origin] = 1;
  let head = 0, tail = 1;
  // Expand this exact same bounded graph only when a candidate needs it.
  // Distant/offshore candidates used to build every route before being rejected.
  // Keep the queue frontier so subsequent candidates resume the same BFS.
  const exploreUntil = target => {
    while (head < tail && steps[target] === 65535) {
      const index = queue[head++], nextStep = steps[index] + 1;
      if (nextStep > half) continue;
      const x = index % side, y = Math.floor(index / side), from = pointAt(index);
      for (const next of [x ? index - 1 : -1, x + 1 < side ? index + 1 : -1,
        y ? index - side : -1, y + 1 < side ? index + side : -1]) {
        if (next < 0 || steps[next] !== 65535 || !isLand(next)) continue;
        const to = pointAt(next);
        if (!geographicLandSegment(mask, from, to)) continue;
        steps[next] = nextStep; queue[tail++] = next;
      }
    }
  };
  const route = { reaches(point) {
    if (!point || geographicDistance(source, point) > 300) return false;
    const difference = ((point.lng - source.lng + 540) % 360) - 180;
    const x = Math.round(difference / deltaLng) + half, y = Math.round((point.lat - source.lat) / deltaLat) + half;
    if (x < 0 || y < 0 || x >= side || y >= side) return false;
    const target = y * side + x;
    if (!isLand(target)) return false;
    exploreUntil(target);
    if (steps[target] === 65535) return false;
    const from = pointAt(target);
    return geographicLandSegment(mask, from, point);
  } };
  if (routes.size >= 32) routes.delete(routes.keys().next().value);
  routes.set(key, route);
  return route;
}

// Conservative fallback for masks without path distances, and for the short
// connection from a tiny island to the nearest usable mainland cell. Counting
// total water (not merely matching endpoint components) prevents sea crossings
// between Europe and Africa within the same connected Afro-Eurasian landmass.
function shortWaterConnection(mask, from, to, maximumWater = 12) {
  // A few pixels of sea at a distant/mobile zoom may span a thousand km.
  // Coastal fallback must remain geographically local as well as visually near.
  if (typeof mask.geographicAt === 'function') {
    const target = mask.geographicAt(to.x, to.y);
    if (geographicDistance(from, target) > 300) return false;
  }
  const contains = typeof mask.containsPoint === 'function' ? (x, y) => mask.containsPoint(x, y)
    : typeof mask.componentAt === 'function' ? (x, y) => { const component = mask.componentAt(x, y); return Number.isInteger(component) && component >= 0; } : null;
  if (!contains) return false;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 2)), stepLength = distance / steps;
  let water = 0;
  for (let step = 0; step < steps; step++) {
    const fraction = (step + 0.5) / steps;
    if (!contains(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction)) water += stepLength;
    if (water > maximumWater) return false;
  }
  return true;
}

// One actual image per brewery before a second image from any brewery. There is
// no per-brewery or per-cluster image limit; available screen cells set capacity.
function representativePhotos(members, selectedId) {
  const lists = members.filter(hasPhoto).map(place => ({ place, beers: place.photoBeers.filter(validPhoto).slice().sort(compareBeerPhotoRank) }))
    .sort((a, b) => Number(b.place.id === selectedId) - Number(a.place.id === selectedId)
      || compareBeerPhotoRank(a.beers[0], b.beers[0]) || String(a.place.id).localeCompare(String(b.place.id)));
  const seen = new Set(), photos = [];
  for (let index = 0; lists.some(list => index < list.beers.length); index++) {
    for (const { place, beers } of lists) {
      const beer = beers[index];
      if (!beer || seen.has(beer.id)) continue;
      seen.add(beer.id); photos.push({ beer, place });
    }
  }
  return photos;
}

/** Shared by layout and the renderer so continuous camera zoom uses one size. */
export function photoDimensions({ zoom = 1, photoZoomBase = 1, compact = false } = {}) {
  const basePhotoHeight = compact ? 14 : 26;
  const baseZoom = finite(photoZoomBase) && photoZoomBase > 0 ? photoZoomBase : 1;
  const relativePhotoZoom = finite(zoom) && zoom > 0
    ? zoom / baseZoom : 1;
  // Beyond the initial view, follow the sphere's projected radius instead of
  // retaining a screen-pixel floor over a tiny Earth. With zoom=2.5/altitude,
  // this is sqrt(home*(home+2)/(altitude*(altitude+2))), as in the sky scene.
  const photoScale = relativePhotoZoom < 1
    ? relativePhotoZoom * Math.sqrt((2.5 + 2 * baseZoom) / (2.5 + 2 * zoom))
    : relativePhotoZoom;
  const photoHeight = Math.max(.01, Math.round(Math.min(basePhotoHeight * photoScale,
    compact ? 32 : 56) * 100) / 100);
  return { photoHeight, photoWidth: Math.round(photoHeight * 0.52 * 100) / 100 };
}

/**
 * Original marker x/y and lat/lng remain the representative's source anchor.
 * photos use x/y relative to the marker's visual center, with separate original
 * sourceX/Y and displayOffsetX/Y. Only photographs occupy screen space;
 * countRect is null. Groups without photos retain metadata with zero dimensions
 * and no occupancy rectangles, so renderers must not create a fallback symbol.
 * markerWidth/Height enclose only photographs; empty portions of that enclosing
 * box may overlap other groups or controls and must not be culled.
 * Optional landMask.intersectsRect tests actual land inside the raw image frame.
 * landPointInRect returns an interior land contact used only for path routing;
 * the photo center can be offshore. Legacy containsRect remains supported.
 * componentAt returns a
 * nonnegative land component ID, or -1/null for water.
 * Optional distancesFrom(x,y,maxDistance,{snapDistance}) returns distanceAt(x,y)
 * along land, with Infinity for unreachable cells. It takes precedence over the
 * conservative straight-line fallback when evaluating each source's vicinity.
 * previousPlacements is an optional Map<beerId, {x,y,maxDisplayDistance?}> of
 * prior image anchors projected into this frame's CSS pixels. Safe anchors are
 * retained exactly, even across group changes. With preservePrevious, unsafe
 * previous images are omitted for this layout instead of jumping to a new cell.
 * relocatablePhotoIds explicitly permits already-hidden images to re-enter at a
 * new safe grid cell; a safe previous center always takes precedence. The caller
 * owns the hidden-time/settled-camera policy and the re-entry fade.
 * A caller may scale the prior, already validated reach with the projection;
 * this never relaxes actual rectangle/land contact or local land-path checks. Photos may
 * partly overlap, with both pairwise and accumulated occlusion bounded.
 * All photos use the same dimensions at a given zoom, including retained ones.
 * A source without room waits for more map space. A retainOnly source keeps safe old
 * anchors but cannot generate new images from behind the globe/outside the view.
 */
export function layoutMapMarkers(entries, {
  width, height, zoom = 1, photoZoomBase = 1, compact = false, selectedId, landMask,
  previousPlacements, preservePrevious = false, relocatablePhotoIds = new Set(),
  obstacles = [], leftMargin = 8, rightMargin = 8, topMargin = 8, bottomMargin = 8,
} = {}) {
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) {
    return { markers: [], clipped: entries.map(entry => ({ entry, reason: 'viewport' })) };
  }
  const clipped = [], zoomFactor = Math.log2(Math.max(1, finite(zoom) ? zoom : 1));
  // Start with small, uniform bottles, then grow them with the map's relative
  // zoom. A globe supplies its responsive home zoom; flat maps use 1. Partial
  // overlaps improve dense/coastal capacity without changing any land checks.
  const reachReferenceHeight = compact ? 30 : 32;
  const { photoWidth, photoHeight } = photoDimensions({ zoom, photoZoomBase, compact });
  const previous = previousPlacements instanceof Map ? previousPlacements : new Map();
  const landConstrained = typeof landMask?.intersectsRect === 'function' || typeof landMask?.containsRect === 'function';
  // Preserve nearby-source grouping without reserving a visible badge or any
  // cells for it. Allocation and collision detection use photographs only.
  const gap = 1, groupingWidth = landConstrained ? 32 : 90, groupingHeight = landConstrained ? 14 : 22;
  const hasComponents = landConstrained && typeof landMask.componentAt === 'function';
  const componentAt = (x, y) => {
    const component = hasComponents ? landMask.componentAt(x, y) : null;
    return Number.isInteger(component) && component >= 0 ? component : null;
  };
  const bounds = { left: Math.max(0, finite(leftMargin) ? leftMargin : 8), right: width - Math.max(0, finite(rightMargin) ? rightMargin : 8),
    top: Math.max(0, finite(topMargin) ? topMargin : 8), bottom: height - Math.max(0, finite(bottomMargin) ? bottomMargin : 8) };
  const blocked = obstacles.filter(rect => rect && [rect.left, rect.right, rect.top, rect.bottom].every(finite)
    && rect.right > rect.left && rect.bottom > rect.top);
  const fitsPhoto = rect => rect.left >= bounds.left && rect.right <= bounds.right
    && rect.top >= bounds.top && rect.bottom <= bounds.bottom
    && !blocked.some(obstacle => overlaps(rect, obstacle, gap))
    && (!landConstrained || photoTouchesLand(landMask, rect));
  const photoCell = (x, y, rect) => {
    if (!fitsPhoto(rect)) return null;
    const landPoint = typeof landMask?.landPointInRect === 'function' ? landMask.landPointInRect(rect) : { x, y };
    if (!landPoint) return null;
    const component = componentAt(landPoint.x, landPoint.y);
    // Real geographic land can be narrower than one conservative path cell.
    if (hasComponents && component === null && typeof landMask?.landPointInRect !== 'function') return null;
    return { x, y, rect, landPoint, component, scale: 1, photoWidth, photoHeight };
  };
  const previousCell = beerId => {
    const point = previous.get(beerId);
    if (!point || !finite(point.x) || !finite(point.y)) return null;
    return photoCell(point.x, point.y, rectAt(point.x, point.y, photoWidth, photoHeight));
  };
  const candidates = [], retainedOnlySources = new Set();
  for (const entry of entries) {
    if (![entry.x, entry.y, entry.lat, entry.lng].every(finite) || Math.abs(entry.lat) > 90 || Math.abs(entry.lng) > 180) {
      clipped.push({ entry, reason: 'coordinates' }); continue;
    }
    if (entry.retainOnly || entry.x < bounds.left || entry.x > bounds.right || entry.y < bounds.top || entry.y > bounds.bottom) {
      if (!(entry.photoBeers || []).some(beer => previousCell(beer.id))) {
        clipped.push({ entry, reason: 'bounds' }); continue;
      }
      retainedOnlySources.add(entry.id);
    }
    const pictured = hasPhoto(entry);
    candidates.push({ entry, pictured, rect: rectAt(entry.x, entry.y, groupingWidth, groupingHeight) });
  }
  candidates.sort((a, b) => Number(b.entry.id === selectedId) - Number(a.entry.id === selectedId)
    || Number(b.pictured) - Number(a.pictured) || String(a.entry.id).localeCompare(String(b.entry.id)));
  const groups = [];
  for (const candidate of candidates) {
    const neighbours = groups.filter(other => overlaps(candidate.rect, other.rect, gap));
    if (neighbours.length) {
      neighbours.sort((a, b) => Math.hypot(a.entry.x - candidate.entry.x, a.entry.y - candidate.entry.y)
        - Math.hypot(b.entry.x - candidate.entry.x, b.entry.y - candidate.entry.y)
        || String(a.entry.id).localeCompare(String(b.entry.id)));
      neighbours[0].members.push(candidate.entry);
    } else {
      groups.push({ ...candidate, members: [candidate.entry] });
    }
  }

  // Metadata-only groups reserve no space. Even the source point itself can be
  // occupied by a photograph when it satisfies the same land/overlay checks.
  for (const group of groups) {
    group.available = representativePhotos(group.members, selectedId);
    group.placed = []; group.photoCursor = 0;
  }
  // Light horizontal overlap with staggered rows keeps labels mostly exposed.
  // The shared occupancy guard also bounds accumulated overlap from neighbours.
  const pitchX = photoWidth * .88, pitchY = photoHeight * .97;
  let sharedCells;
  const layoutCells = () => {
    if (sharedCells) return sharedCells;
    const w = photoWidth, h = photoHeight, cells = [];
    for (let row = 0, y = bounds.top + h / 2; y + h / 2 <= bounds.bottom; row++, y += pitchY) {
      for (let x = bounds.left + w / 2 + (row % 2) * pitchX / 2; x + w / 2 <= bounds.right; x += pitchX) {
        const rect = rectAt(x, y, w, h);
        const cell = photoCell(x, y, rect);
        if (cell) cells.push({ ...cell, index: cells.length, key: cells.length });
      }
    }
    return sharedCells = cells;
  };
  const shortSide = Math.max(0, Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top));
  for (const group of groups) {
    group.sources = new Map();
    for (const { place } of group.available) {
      if (group.sources.has(place.id)) continue;
      // Every photo expands near its own brewery, even when nearby breweries
      // share a group. Selection adds room, never the entire viewport.
      const fraction = Math.min(place.id === selectedId ? 0.5 : 0.44,
        0.24 + 0.1 * zoomFactor + (place.id === selectedId ? 0.1 : 0));
      const localReach = reachReferenceHeight * ((place.id === selectedId ? 5 : 3) + 1.5 * zoomFactor);
      const radius = Math.max(pitchY, Math.min(shortSide * fraction, landConstrained ? localReach : Infinity));
      const sourceComponent = componentAt(place.x, place.y);
      const hasPaths = landConstrained && typeof landMask.distancesFrom === 'function';
      const policies = new Map();
      const oldCells = group.available.filter(photo => photo.place.id === place.id)
        .map(photo => previousCell(photo.beer.id)).filter(Boolean);
      // The same reach policy admits grid cells and arbitrary retained centers.
      // Including retained centers matters on a narrow island where the new
      // global grid has no cell, but a previously placed rectangle still fits.
      const policyFor = reach => {
        const key = reach;
        if (policies.has(key)) return policies.get(key);
        // A source outside this projection can only preserve already validated
        // geographic anchors. Its off-screen path cannot be sampled here.
        if (retainedOnlySources.has(place.id)) {
          const policy = { cells: [], accepts: cell => Math.hypot(cell.x - place.x, cell.y - place.y) <= reach
            && (typeof landMask?.geographicAt !== 'function' || geographicDistance(place, landMask.geographicAt(cell.x, cell.y)) <= 300) };
          policies.set(key, policy); return policy;
        }
        const nearby = [...layoutCells(), ...oldCells].map(cell => ({ cell, distance: Math.hypot(cell.x - place.x, cell.y - place.y) }))
          .filter(candidate => candidate.distance <= reach)
          .sort((a, b) => a.distance - b.distance || (a.cell.index ?? Infinity) - (b.cell.index ?? Infinity));
        const offshore = sourceComponent === null && hasPaths && typeof landMask.nearestLandPoint === 'function'
          && typeof landMask.geographicAt === 'function';
        // Every water-source attachment has a geographic limit, including at a
        // far zoom where the old 12px snap could span an entirely missing island.
        const nearestShore = offshore ? landMask.nearestLandPoint(place.x, place.y, reach) : null;
        const actualLandSource = typeof landMask?.geographicContains === 'function' && landMask.geographicContains(place.lng, place.lat);
        const shore = nearestShore && (actualLandSource
          ? continuousGeographicLand(landMask, place, nearestShore)
          : geographicDistance(place, landMask.geographicAt(nearestShore.x, nearestShore.y)) <= 20) ? nearestShore : null;
        const pathBudget = offshore ? shore ? reach - shore.distance : 0 : reach;
        const distances = hasPaths && (!offshore || shore) ? landMask.distancesFrom(
          shore?.x ?? place.x, shore?.y ?? place.y, pathBudget, { snapDistance: offshore ? 0 : 12 }) : null;
        let component = shore?.component ?? sourceComponent;
        let reaches = cell => offshore
          ? !!shore && cell.component === shore.component && distances.distanceAt(landSupport(cell).x, landSupport(cell).y) <= pathBudget
          : distances ? distances.distanceAt(landSupport(cell).x, landSupport(cell).y) <= reach
            : (!hasComponents || (component !== null && cell.component === component))
              && (!landConstrained || shortWaterConnection(landMask, place, landSupport(cell)));
        if (actualLandSource && typeof landMask?.landPointInRect === 'function') {
          const screenReaches = reaches;
          // Routing stops at land within the frame, not at its possibly ocean
          // center. Thin islands need no fully-land screen cell to support a photo.
          reaches = cell => screenReaches(cell) || (Math.hypot(landSupport(cell).x - place.x, landSupport(cell).y - place.y) <= reach
            && continuousGeographicLand(landMask, place, landSupport(cell)));
        }
        if (!offshore && hasComponents && !nearby.some(candidate => reaches(candidate.cell))) {
          // Sources actually on an island/land retain the existing short-sea
          // policy. A large body of water never becomes a coastal correction.
          const coastalReach = Math.min(reach, reachReferenceHeight * 2);
          const nearest = nearby.find(candidate => candidate.distance <= coastalReach && shortWaterConnection(landMask, place, landSupport(candidate.cell)));
          component = nearest?.cell.component ?? null;
          const remaining = nearest ? reach - nearest.distance : 0;
          const coastalDistances = nearest && hasPaths
            ? landMask.distancesFrom(landSupport(nearest.cell).x, landSupport(nearest.cell).y, remaining, { snapDistance: 0 }) : null;
          reaches = cell => !!nearest && cell.component === component && (coastalDistances
            ? coastalDistances.distanceAt(landSupport(cell).x, landSupport(cell).y) <= remaining
            : shortWaterConnection(landMask, place, landSupport(cell)));
        }
        // New images must remain geographically local even when a large
        // continent offers thousands of kilometres within a few screen pixels.
        // Retained anchors were already validated on entry and do not move.
        const localGeography = cell => !landConstrained || typeof landMask.geographicAt !== 'function'
          || geographicDistance(place, landMask.geographicAt(cell.x, cell.y)) <= 300;
        const localCandidates = nearby.filter(candidate => localGeography(candidate.cell));
        if (actualLandSource && localCandidates.length && !localCandidates.some(candidate => reaches(candidate.cell))) {
          const route = geographicLandRoute(landMask, place), screenReaches = reaches;
          if (route) reaches = cell => screenReaches(cell) || route.reaches(landMask.geographicAt(landSupport(cell).x, landSupport(cell).y));
        }
        let cells = nearby.filter(candidate => Number.isInteger(candidate.cell.index)
          && reaches(candidate.cell) && localGeography(candidate.cell)).map(candidate => candidate.cell);
        if (!cells.length && actualLandSource && typeof landMask.geographicAt === 'function') {
          // A narrower frame can still miss a small peninsula when the global
          // lattice changes phase. Only an otherwise empty actual-land source
          // gets a bounded local half-pitch search. The geographic land route,
          // actual rectangle/land contact, overlays and 300km limit are unchanged.
          const route = geographicLandRoute(landMask, place), screenReaches = reaches;
          if (route) reaches = cell => screenReaches(cell) || route.reaches(landMask.geographicAt(landSupport(cell).x, landSupport(cell).y));
          const stepX = pitchX / 2, stepY = pitchY / 2;
          const cols = Math.ceil(reach / stepX), rows = Math.ceil(reach / stepY);
          const offsets = [];
          for (let row = -rows; row <= rows; row++) for (let col = -cols; col <= cols; col++) {
            const dx = col * stepX, dy = row * stepY, distance = Math.hypot(dx, dy);
            if (distance <= reach) offsets.push({ col, row, dx, dy, distance });
          }
          offsets.sort((a, b) => a.distance - b.distance || a.row - b.row || a.col - b.col);
          for (const offset of offsets.slice(0, 4096)) {
            const x = place.x + offset.dx, y = place.y + offset.dy;
            const rect = rectAt(x, y, photoWidth, photoHeight);
            const contact = photoCell(x, y, rect);
            if (!contact) continue;
            const cell = { ...contact, index: layoutCells().length + cells.length,
              key: `local:${place.id}:${offset.row}:${offset.col}` };
            if (localGeography(cell) && reaches(cell)) cells.push(cell);
          }
        }
        const accepts = cell => Math.hypot(cell.x - place.x, cell.y - place.y) <= reach && localGeography(cell) && reaches(cell);
        const policy = { accepts, cells };
        policies.set(key, policy);
        return policy;
      };
      group.sources.set(place.id, { cells: policyFor(radius).cells, cursor: 0, radius, sourceComponent, policyFor });
    }
    group.capacity = new Set([...group.sources.values()].flatMap(source => source.cells.map(cell => cell.key))).size;
  }
  const usedBeerIds = new Set(), representedSources = new Set(), rejectedPrevious = new Set();
  // Retained and new images use the renderer's same bounded-overlap policy.
  const occupied = createPhotoOccupancy();
  const collides = rect => !occupied.canPlace(rect);
  const placePhoto = (group, photo, source, cell, placementRetained, reach = source.radius) => {
    group.placed.push({ ...photo, cell, source, placementRetained, reach });
    occupied.add(cell.rect);
    usedBeerIds.add(photo.beer.id); representedSources.add(photo.place.id);
    return true;
  };
  const retainPhoto = (group, photo) => {
    const id = photo.beer.id;
    if (usedBeerIds.has(id) || rejectedPrevious.has(id) || !previous.has(id)) return false;
    const source = group.sources.get(photo.place.id), point = previous.get(id), cell = previousCell(id);
    const reach = Math.max(source.radius, finite(point?.maxDisplayDistance) ? point.maxDisplayDistance : 0);
    if (!cell || collides(cell.rect) || !source.policyFor(reach).accepts(cell)) {
      rejectedPrevious.add(id);
      return false;
    }
    return placePhoto(group, photo, source, cell, true, reach);
  };
  const allocatePhoto = (group, photo) => {
    if (usedBeerIds.has(photo.beer.id)) return false;
    if (retainPhoto(group, photo)) return true;
    if (preservePrevious && previous.has(photo.beer.id) && !relocatablePhotoIds.has(photo.beer.id)) return false;
    const source = group.sources.get(photo.place.id);
    if (retainedOnlySources.has(photo.place.id)) return false;
    while (source.cursor < source.cells.length && collides(source.cells[source.cursor].rect)) source.cursor++;
    if (source.cursor >= source.cells.length) return false;
    return placePhoto(group, photo, source, source.cells[source.cursor++], false);
  };
  // Give every brewery a first attempt before any brewery's second image. Old
  // first images keep their anchors, then new breweries get their first chance.
  // Remaining old images are reserved before filling holes with new images.
  const firstPass = groups.map(group => {
    const sources = new Map();
    for (const photo of group.available) {
      if (!sources.has(photo.place.id)) sources.set(photo.place.id, []);
      sources.get(photo.place.id).push(photo);
    }
    return { group, sources: [...sources.values()] };
  }).sort((a,b)=>Number(b.group.entry.id===selectedId)-Number(a.group.entry.id===selectedId)
    ||compareBeerPhotoRank(a.group.available[0]?.beer,b.group.available[0]?.beer));
  const firstRound = allocate => {
    for (let index = 0; firstPass.some(item => index < item.sources.length); index++) {
      for (const { group, sources } of firstPass) {
        const sourcePhotos = sources[index];
        if (!sourcePhotos || representedSources.has(sourcePhotos[0].place.id)) continue;
        for (const photo of sourcePhotos) if (allocate(group, photo)) break;
      }
    }
  };
  const remainingRounds = allocate => {
    for (const group of groups) group.photoCursor = 0;
    let progressed;
    do {
      progressed = false;
      for (const group of groups) {
        while (group.photoCursor < group.available.length) {
          const photo = group.available[group.photoCursor++];
          if (!allocate(group, photo)) continue;
          progressed = true;
          break;
        }
      }
    } while (progressed);
  };
  if (previous.size) firstRound(retainPhoto);
  firstRound(allocatePhoto);
  if (previous.size) remainingRounds(retainPhoto);
  remainingRounds(allocatePhoto);

  const markers = groups.map(group => {
    const { entry, members } = group;
    const rects = group.placed.map(photo => photo.cell.rect);
    const outer = rects.length ? { left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)),
      top: Math.min(...rects.map(rect => rect.top)), bottom: Math.max(...rects.map(rect => rect.bottom)) }
      : { left: entry.x, right: entry.x, top: entry.y, bottom: entry.y };
    const centerX = (outer.left + outer.right) / 2, centerY = (outer.top + outer.bottom) / 2;
    const photos = group.placed.map(({ beer, place, cell, source, placementRetained, reach }) => ({ beer, brewery: place.brewery,
      sourceId: place.id, sourceLat: place.lat, sourceLng: place.lng, sourceX: place.x, sourceY: place.y,
      x: cell.x - centerX, y: cell.y - centerY, width: cell.photoWidth, height: cell.photoHeight, scale: cell.scale,
      displayOffsetX: cell.x - place.x, displayOffsetY: cell.y - place.y,
      landComponent: cell.component, landContactX: landSupport(cell).x, landContactY: landSupport(cell).y, sourceLandComponent: source.sourceComponent, maxDisplayDistance: reach, placementRetained,
    }));
    return { ...entry, anchorId: entry.id, representative: entry,
      id: members.length > 1 ? `cluster:${entry.id}` : entry.id,
      kind: members.length > 1 ? 'cluster' : entry.kind, members,
      beerCount: members.reduce((total, member) => total + count(member), 0),
      photoBeers: photos.map(photo => photo.beer), photos,
      displayOffsetX: centerX - entry.x, displayOffsetY: centerY - entry.y,
      markerWidth: outer.right - outer.left, markerHeight: outer.bottom - outer.top,
      countRect: null,
      occupancyRects: rects, photoWidth, photoHeight, photoGap: pitchX - photoWidth, landConstrained,
      // Kept for existing consumers; this is spatial capacity, not a truncation.
      maximumPhotos: Math.max(group.capacity, photos.length), availablePhotoCount: group.available.length,
      hiddenPhotoCount: group.available.length - photos.length, expanded: photos.length > 1 };
  });
  return { markers, clipped };
}
