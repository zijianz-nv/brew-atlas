import { Matrix4 } from 'three';

// Snapshot the actual renderer camera. Analytic sphere intersection avoids a
// triangle raycast for every land-mask sample and rejects the far hemisphere.
export function createSphereUnprojector(camera, width, height, radius = 100) {
  camera.updateMatrixWorld();
  const matrix = new Matrix4().multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse).elements;
  const world = camera.matrixWorld.elements;
  const ox = world[12], oy = world[13], oz = world[14];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const valid = width > 0 && height > 0 && radius > 0 && c > 0;
  return (x, y) => {
    if (!valid || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > width || y < 0 || y > height) return null;
    const nx = x / width * 2 - 1, ny = 1 - y / height * 2;
    const w = matrix[3] * nx + matrix[7] * ny + matrix[11] * 0.5 + matrix[15];
    const dx = (matrix[0] * nx + matrix[4] * ny + matrix[8] * 0.5 + matrix[12]) / w - ox;
    const dy = (matrix[1] * nx + matrix[5] * ny + matrix[9] * 0.5 + matrix[13]) / w - oy;
    const dz = (matrix[2] * nx + matrix[6] * ny + matrix[10] * 0.5 + matrix[14]) / w - oz;
    const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz;
    const discriminant = b * b - a * c;
    if (!(discriminant >= 0) || !a) return null;
    const t = (-b - Math.sqrt(discriminant)) / a;
    if (!(t > 0)) return null;
    const hx = ox + dx * t, hy = oy + dy * t, hz = oz + dz * t;
    return { lat: Math.asin(Math.max(-1, Math.min(1, hy / radius))) * 180 / Math.PI,
      lng: Math.atan2(hx, hz) * 180 / Math.PI };
  };
}
