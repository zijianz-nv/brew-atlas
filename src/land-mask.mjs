/**
 * Land occupancy from the same bundled, antimeridian-cut GeoJSON as the texture.
 * No DOM or network dependency. This follows the map's resolution; it is not a
 * more precise coastline than Natural Earth. Reuse one geographic mask and
 * rebuild the screen mask only when its projection / viewport changes.
 */
const finite = Number.isFinite;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function polygonsOf(feature) {
  const geometry = feature?.geometry || feature;
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

/** Scanline even-odd fill per polygon, then union countries and islands. */
function fillPolygon(data, width, height, polygon) {
  const edges = [];
  let minimumY = height, maximumY = 0;
  for (const ring of polygon) {
    if (!Array.isArray(ring) || ring.length < 3) continue;
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index], b = ring[(index + 1) % ring.length];
      if (!a || !b || ![a[0], a[1], b[0], b[1]].every(finite)) continue;
      const x1 = (a[0] + 180) / 360 * width, y1 = (90 - a[1]) / 180 * height;
      const x2 = (b[0] + 180) / 360 * width, y2 = (90 - b[1]) / 180 * height;
      if (y1 === y2) continue;
      const low = Math.min(y1, y2), high = Math.max(y1, y2);
      edges.push([x1, y1, (x2 - x1) / (y2 - y1), low, high]);
      minimumY = Math.min(minimumY, low); maximumY = Math.max(maximumY, high);
    }
  }
  const first = Math.max(0, Math.ceil(minimumY - 0.5));
  const last = Math.min(height, Math.ceil(maximumY - 0.5));
  for (let row = first; row < last; row++) {
    const y = row + 0.5, crossings = [];
    for (const [x, startY, slope, low, high] of edges) {
      if (y >= low && y < high) crossings.push(x + (y - startY) * slope);
    }
    crossings.sort((a, b) => a - b);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const start = clamp(Math.ceil(crossings[index] - 0.5), 0, width);
      const end = clamp(Math.ceil(crossings[index + 1] - 0.5), 0, width);
      if (end > start) data.fill(1, row * width + start, row * width + end);
    }
  }
}

/**
 * contains(lng, lat) samples a cached equirectangular raster. A one-cell inward
 * margin excludes ambiguous coastline pixels, without introducing country
 * border gaps. The bundled polygons are already split at +/-180, exactly as in
 * the displayed texture; no shortest-path rewriting of their edges is applied.
 */
export function createGeographicLandMask(features, { width = 4096, height = 2048, coastMargin = 1 } = {}) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0)
    || width * height > 33554432) throw new RangeError('Invalid geographic raster dimensions');
  if (![0, 1].includes(coastMargin)) throw new RangeError('coastMargin must be 0 or 1 raster cell');
  const source = new Uint8Array(width * height);
  for (const feature of (Array.isArray(features) ? features : features?.features || [])) {
    for (const polygon of polygonsOf(feature)) fillPolygon(source, width, height, polygon);
  }
  const data = coastMargin ? new Uint8Array(source.length) : source;
  if (coastMargin) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 0; x < width; x++) {
        const left = (x + width - 1) % width, right = (x + 1) % width;
        if (source[y * width + x] && source[y * width + left] && source[y * width + right]
          && source[(y - 1) * width + x] && source[(y - 1) * width + left] && source[(y - 1) * width + right]
          && source[(y + 1) * width + x] && source[(y + 1) * width + left] && source[(y + 1) * width + right]) data[y * width + x] = 1;
      }
    }
  }
  return {
    width, height, coastMargin,
    contains(lng, lat) {
      if (!finite(lng) || !finite(lat) || lat < -90 || lat > 90) return false;
      const longitude = ((lng + 180) % 360 + 360) % 360;
      const x = Math.min(width - 1, Math.floor(longitude / 360 * width));
      const y = clamp(Math.floor((90 - lat) / 180 * height), 0, height - 1);
      return data[y * width + x] === 1;
    },
  };
}

/** Label four-connected land cells. IDs are local to this screen-mask instance. */
function labelComponents(cells, columns, rows) {
  const labels = new Int32Array(cells.length).fill(-1);
  const queue = new Int32Array(cells.length);
  let count = 0;
  for (let seed = 0; seed < cells.length; seed++) {
    if (!cells[seed] || labels[seed] !== -1) continue;
    let head = 0, tail = 1;
    queue[0] = seed; labels[seed] = count;
    while (head < tail) {
      const index = queue[head++], x = index % columns;
      const neighbours = [x ? index - 1 : -1, x + 1 < columns ? index + 1 : -1,
        index >= columns ? index - columns : -1, index + columns < cells.length ? index + columns : -1];
      for (const next of neighbours) {
        if (next >= 0 && cells[next] && labels[next] === -1) {
          labels[next] = count; queue[tail++] = next;
        }
      }
    }
    count++;
  }
  return { labels, count };
}

/**
 * Every cell checks four corners plus its centre through the actual projection.
 * A rectangle passes only when EVERY intersected cell is land (integral-image
 * query), with an additional 2px inward safety margin by default. This checks
 * its interior, not merely its corners. step=2 is conservative at normal display
 * sizes; step=3 trades slightly more coastal clearance for less projection work.
 *
 * unproject(x,y) must return {lng,lat} on the visible sphere/plane, or null.
 * Land components are >=0; ocean, off-screen and off-globe points return -1.
 * Components describe connected visible land, not political continent labels.
 */
export function createScreenLandMask({ width, height, unproject, geographicMask, step = 2, padding = 2 } = {}) {
  if (![width, height, step].every(value => finite(value) && value > 0)
    || !finite(padding) || padding < 0 || typeof unproject !== 'function'
    || typeof geographicMask?.contains !== 'function') throw new TypeError('Invalid screen land mask options');
  const columns = Math.ceil(width / step), rows = Math.ceil(height / step);
  if (columns * rows > 4194304) throw new RangeError('Screen land mask exceeds its sampling bound');
  const vertexColumns = columns + 1, vertices = new Uint8Array(vertexColumns * (rows + 1));
  const cells = new Uint8Array(columns * rows);
  const landAt = (x, y) => {
    const point = unproject(x, y);
    return point && geographicMask.contains(point.lng, point.lat) ? 1 : 0;
  };
  for (let y = 0; y <= rows; y++) {
    for (let x = 0; x <= columns; x++) vertices[y * vertexColumns + x] = landAt(Math.min(width, x * step), Math.min(height, y * step));
  }
  const stride = columns + 1, integral = new Uint32Array(stride * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let rowWater = 0;
    for (let x = 0; x < columns; x++) {
      const vertex = y * vertexColumns + x;
      const land = vertices[vertex] && vertices[vertex + 1] && vertices[vertex + vertexColumns]
        && vertices[vertex + vertexColumns + 1]
        && landAt((x * step + Math.min(width, (x + 1) * step)) / 2,
          (y * step + Math.min(height, (y + 1) * step)) / 2);
      cells[y * columns + x] = land ? 1 : 0;
      rowWater += land ? 0 : 1;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowWater;
    }
  }
  const { labels, count } = labelComponents(cells, columns, rows);
  const indexAt = (x, y) => finite(x) && finite(y) && x >= 0 && x < width && y >= 0 && y < height
    ? Math.floor(y / step) * columns + Math.floor(x / step) : -1;
  const componentAt = (x, y) => { const index = indexAt(x, y); return index < 0 ? -1 : labels[index]; };
  const mask = {
    width, height, step, padding, columns, rows, componentCount: count,
    geographicAt: (x, y) => indexAt(x, y) < 0 ? null : unproject(x, y),
    // Read the underlying land raster before conservative screen-cell sampling.
    // This distinguishes a real offshore source from a thin coastal land pixel.
    geographicContains: geographicMask.contains,
    geographicWidth: geographicMask.width, geographicHeight: geographicMask.height,
    componentAt,
    containsPoint: (x, y) => componentAt(x, y) >= 0,
    containsRect(rect) {
      if (!rect || ![rect.left, rect.right, rect.top, rect.bottom].every(finite)
        || rect.right <= rect.left || rect.bottom <= rect.top) return false;
      const left = rect.left - padding, right = rect.right + padding;
      const top = rect.top - padding, bottom = rect.bottom + padding;
      if (left < 0 || right > width || top < 0 || bottom > height) return false;
      const x1 = Math.floor(left / step), x2 = Math.min(columns, Math.ceil(right / step));
      const y1 = Math.floor(top / step), y2 = Math.min(rows, Math.ceil(bottom / step));
      return integral[y2 * stride + x2] - integral[y1 * stride + x2]
        - integral[y2 * stride + x1] + integral[y1 * stride + x1] === 0;
    },
    /** Optional coastal lookup, strictly bounded in screen pixels. */
    nearestLandPoint(x, y, maxDistance = 36) {
      if (![x, y, maxDistance].every(finite) || maxDistance < 0) return null;
      const existing = componentAt(x, y);
      if (existing >= 0) return { x, y, component: existing, distance: 0 };
      let closest = null, distanceSquared = maxDistance * maxDistance;
      const x1 = clamp(Math.floor((x - maxDistance) / step), 0, columns - 1);
      const x2 = clamp(Math.floor((x + maxDistance) / step), 0, columns - 1);
      const y1 = clamp(Math.floor((y - maxDistance) / step), 0, rows - 1);
      const y2 = clamp(Math.floor((y + maxDistance) / step), 0, rows - 1);
      for (let row = y1; row <= y2; row++) {
        for (let column = x1; column <= x2; column++) {
          const component = labels[row * columns + column];
          if (component < 0) continue;
          const px = (column * step + Math.min(width, (column + 1) * step)) / 2;
          const py = (row * step + Math.min(height, (row + 1) * step)) / 2;
          const squared = (px - x) ** 2 + (py - y) ** 2;
          if (squared <= distanceSquared) {
            distanceSquared = squared; closest = { x: px, y: py, component, distance: Math.sqrt(squared) };
          }
        }
      }
      return closest;
    },
  };
  const pathCache = new Map();
  /**
   * Shortest four-neighbour route through land, measured in CSS pixels. This
   * deliberately charges for a detour around a sea even when both coasts belong
   * to one connected landmass. No ocean cell or diagonal corner is traversed.
   *
   * At most 255 steps / 511x511 cells and 24 cached source/radius combinations
   * per screen mask. Larger requests are explicitly marked truncated, and
   * points beyond that bound return Infinity. Defaults cover local 120-200px
   * expansion comfortably. Sources just off the low-resolution coast can snap
   * within snapDistance; that displacement is included in the distance budget.
   */
  mask.distancesFrom = (x, y, requestedDistance = 200, { snapDistance = 36 } = {}) => {
    const unavailable = { source: null, maxDistance: 0, truncated: false, sampledCells: 0, visitedCells: 0,
      distanceAt: () => Infinity };
    if (![x, y, requestedDistance, snapDistance].every(finite) || requestedDistance < 0 || snapDistance < 0) return unavailable;
    const maxDistance = Math.min(requestedDistance, step * 255);
    const snapLimit = Math.min(snapDistance, 36);
    const key = `${x},${y},${maxDistance},${snapLimit},${requestedDistance > maxDistance}`;
    if (pathCache.has(key)) {
      const cached = pathCache.get(key);
      pathCache.delete(key); pathCache.set(key, cached);
      return cached;
    }
    const save = result => {
      if (pathCache.size >= 24) pathCache.delete(pathCache.keys().next().value);
      pathCache.set(key, result);
      return result;
    };
    const source = mask.nearestLandPoint(x, y, snapLimit);
    if (!source || source.distance > maxDistance) return save({ ...unavailable, maxDistance,
      truncated: requestedDistance > maxDistance });
    const sourceIndex = indexAt(source.x, source.y);
    const sx = sourceIndex % columns, sy = Math.floor(sourceIndex / columns);
    const centreX = (sx * step + Math.min(width, (sx + 1) * step)) / 2;
    const centreY = (sy * step + Math.min(height, (sy + 1) * step)) / 2;
    const startOffset = source.distance + Math.hypot(centreX - source.x, centreY - source.y);
    const radius = Math.min(255, Math.floor(maxDistance / step));
    const left = Math.max(0, sx - radius), right = Math.min(columns - 1, sx + radius);
    const top = Math.max(0, sy - radius), bottom = Math.min(rows - 1, sy + radius);
    const localWidth = right - left + 1, localHeight = bottom - top + 1;
    const distances = new Uint16Array(localWidth * localHeight).fill(65535);
    const queue = new Uint32Array(distances.length);
    const origin = (sy - top) * localWidth + sx - left;
    distances[origin] = 0; queue[0] = origin;
    let head = 0, tail = 1;
    while (head < tail) {
      const index = queue[head++], nextDistance = distances[index] + 1;
      if (nextDistance * step + startOffset > maxDistance) continue;
      const localX = index % localWidth, localY = Math.floor(index / localWidth);
      const neighbours = [localX ? index - 1 : -1, localX + 1 < localWidth ? index + 1 : -1,
        localY ? index - localWidth : -1, localY + 1 < localHeight ? index + localWidth : -1];
      for (const next of neighbours) {
        if (next < 0 || distances[next] !== 65535) continue;
        const globalX = next % localWidth + left, globalY = Math.floor(next / localWidth) + top;
        if (!cells[globalY * columns + globalX]) continue;
        distances[next] = nextDistance; queue[tail++] = next;
      }
    }
    return save({ source, maxDistance, truncated: requestedDistance > maxDistance,
      sampledCells: distances.length, visitedCells: tail,
      distanceAt(targetX, targetY) {
        const target = indexAt(targetX, targetY);
        if (target < 0 || labels[target] !== source.component) return Infinity;
        const tx = target % columns, ty = Math.floor(target / columns);
        if (tx < left || tx > right || ty < top || ty > bottom) return Infinity;
        const hops = distances[(ty - top) * localWidth + tx - left];
        if (hops === 65535) return Infinity;
        const endX = (tx * step + Math.min(width, (tx + 1) * step)) / 2;
        const endY = (ty * step + Math.min(height, (ty + 1) * step)) / 2;
        // Within one fully safe cell, the direct segment stays on land.
        const distance = target === sourceIndex
          ? source.distance + Math.hypot(targetX - source.x, targetY - source.y)
          : startOffset + hops * step + Math.hypot(targetX - endX, targetY - endY);
        return distance <= maxDistance ? distance : Infinity;
      },
    });
  };
  mask.canReach = (sourceX, sourceY, targetX, targetY, { maxDistance = 200, snapDistance = 36 } = {}) =>
    finite(mask.distancesFrom(sourceX, sourceY, maxDistance, { snapDistance }).distanceAt(targetX, targetY));
  return mask;
}

/**
 * Sparse version for animation-frame culling. Construct with a fresh camera
 * snapshot each frame: point/cell results are memoized only within this guard.
 * It uses exactly the same corner+centre cells and rectangle padding as the
 * full screen mask, but does not rasterize unused areas or label landmasses.
 * componentAt is only a presence check here (0 land / -1 unavailable); use the
 * full screen mask's components when deciding which landmass may receive a beer.
 */
export function createProjectedLandGuard({ width, height, unproject, geographicMask, step = 2, padding = 2 } = {}) {
  if (![width, height, step].every(value => finite(value) && value > 0)
    || !finite(padding) || padding < 0 || typeof unproject !== 'function'
    || typeof geographicMask?.contains !== 'function') throw new TypeError('Invalid projected land guard options');
  const columns = Math.ceil(width / step), rows = Math.ceil(height / step);
  const vertices = new Map(), cells = new Map();
  const landAt = (x, y) => {
    const point = unproject(x, y);
    return Boolean(point && geographicMask.contains(point.lng, point.lat));
  };
  const vertexAt = (x, y) => {
    const key = y * (columns + 1) + x;
    if (!vertices.has(key)) vertices.set(key, landAt(Math.min(width, x * step), Math.min(height, y * step)));
    return vertices.get(key);
  };
  const cellAt = (x, y) => {
    const key = y * columns + x;
    if (!cells.has(key)) cells.set(key, vertexAt(x, y) && vertexAt(x + 1, y)
      && vertexAt(x, y + 1) && vertexAt(x + 1, y + 1)
      && landAt((x * step + Math.min(width, (x + 1) * step)) / 2,
        (y * step + Math.min(height, (y + 1) * step)) / 2));
    return cells.get(key);
  };
  const containsPoint = (x, y) => finite(x) && finite(y) && x >= 0 && x < width && y >= 0 && y < height
    && cellAt(Math.floor(x / step), Math.floor(y / step));
  return {
    width, height, step, padding,
    containsPoint,
    componentAt: (x, y) => containsPoint(x, y) ? 0 : -1,
    containsRect(rect) {
      if (!rect || ![rect.left, rect.right, rect.top, rect.bottom].every(finite)
        || rect.right <= rect.left || rect.bottom <= rect.top) return false;
      const left = rect.left - padding, right = rect.right + padding;
      const top = rect.top - padding, bottom = rect.bottom + padding;
      if (left < 0 || right > width || top < 0 || bottom > height) return false;
      const x1 = Math.floor(left / step), x2 = Math.min(columns, Math.ceil(right / step));
      const y1 = Math.floor(top / step), y2 = Math.min(rows, Math.ceil(bottom / step));
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) if (!cellAt(x, y)) return false;
      }
      return true;
    },
  };
}
