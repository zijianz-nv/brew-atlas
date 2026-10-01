import { Vector3 } from 'three';
import { createScreenLandMask } from './land-mask.mjs';
import { createSphereUnprojector } from './map-projection.mjs';
import { layoutMapMarkers } from './marker-layout.mjs';

const radians = Math.PI / 180;
const point = (lat, lng, radius) => new Vector3(
  radius * Math.cos(lat * radians) * Math.sin(lng * radians),
  radius * Math.sin(lat * radians),
  radius * Math.cos(lat * radians) * Math.cos(lng * radians));

/** Plan a deliberate focus once, without moving the live camera or photo anchors.
 * A narrow island can have eligible images but no complete image-sized land slot
 * at the usual focus distance. Probe the exact existing placement rules, retaining
 * identical photo sizes, coastal clearance, local routes and collision checks.
 * Ordinary camera changes never invoke this planner.
 */
export function choosePhotoFocusAltitude({ camera, target, places, geographicMask,
  width, height, radius = 100, initialAltitude = .6, minimumAltitude = .08,
  maximumAttempts = 9, layoutOptions = {} }) {
  const fallback = { altitude: initialAltitude, found: false, attempts: [] };
  if (!camera?.clone || !target || !Number.isFinite(target.lat) || !Number.isFinite(target.lng)
    || !geographicMask?.contains || !(width > 0 && height > 0 && radius > 0)
    || !places?.some(place => place.id === target.id && place.photoBeers?.length)) return fallback;
  const probe = camera.clone(), attempts = [];
  const first = Math.max(minimumAltitude, initialAltitude);
  for (let index = 0; index < maximumAttempts; index++) {
    const altitude = Math.max(minimumAltitude, first * .76 ** index);
    probe.position.copy(point(target.lat, target.lng, radius * (1 + altitude)));
    probe.lookAt(0, 0, 0); probe.updateMatrixWorld();
    const unproject = createSphereUnprojector(probe, width, height, radius);
    const landMask = createScreenLandMask({ width, height, step: 2, geographicMask, unproject });
    const entries = places.flatMap(place => {
      const facing = Math.sin(target.lat * radians) * Math.sin(place.lat * radians)
        + Math.cos(target.lat * radians) * Math.cos(place.lat * radians)
        * Math.cos((place.lng - target.lng) * radians);
      if (facing < 1 / (1 + altitude)) return [];
      const projected = point(place.lat, place.lng, radius * 1.002).project(probe);
      return [{ ...place, x: (projected.x + 1) / 2 * width,
        y: (1 - projected.y) / 2 * height }];
    });
    const result = layoutMapMarkers(entries, { ...layoutOptions, width, height,
      zoom: 2.5 / altitude, selectedId: target.id, landMask });
    const photos = result.markers.flatMap(marker => marker.photos);
    const targetPhotos = photos.filter(photo => photo.sourceId === target.id).length;
    attempts.push({ altitude, photos: photos.length, targetPhotos });
    if (targetPhotos) return { altitude, found: true, attempts };
    if (altitude === minimumAltitude) break;
  }
  // Do not zoom helplessly into an unplaceable/offshore source. The usual focus
  // still lets the user explore; a source image or coordinate is never invented.
  return { ...fallback, attempts };
}
