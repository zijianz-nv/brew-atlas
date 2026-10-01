import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createSphereUnprojector } from '../src/map-projection.mjs';

const point = (lat, lng, radius = 100) => new Vector3(
  radius * Math.cos(lat * Math.PI / 180) * Math.sin(lng * Math.PI / 180),
  radius * Math.sin(lat * Math.PI / 180),
  radius * Math.cos(lat * Math.PI / 180) * Math.cos(lng * Math.PI / 180));

test('screen-to-globe inverse matches the rendered camera across hemispheres, zooms and viewports', () => {
  for (const [lat, lng] of [[35,10],[-35,150],[40,-100],[20,179],[-70,-179],[80,90]]) {
    for (const [width, height] of [[1440,674],[390,570]]) {
      for (const distance of [160,360,550]) {
        const camera = new PerspectiveCamera(50, width / height, 0.1, 3000);
        camera.position.copy(point(lat,lng,distance)); camera.lookAt(0,0,0); camera.updateMatrixWorld();
        const inverse = createSphereUnprojector(camera,width,height);
        for (const [dlat,dlng] of [[0,0],[3,4],[-3,-4]]) {
          const source = point(lat+dlat,lng+dlng);
          const projected = source.clone().project(camera);
          const result = inverse((projected.x+1)/2*width,(1-projected.y)/2*height);
          assert(result);
          assert(source.distanceTo(point(result.lat,result.lng)) < 1e-7);
        }
      }
    }
  }
});

test('sphere inverse rejects ocean-independent off-globe space and keeps a stable camera snapshot', () => {
  const camera = new PerspectiveCamera(50, 2, 0.1, 3000);
  camera.position.set(0,0,400); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  const inverse = createSphereUnprojector(camera,1000,500);
  assert.equal(inverse(0,0),null); assert.equal(inverse(-1,250),null); assert.equal(inverse(NaN,250),null);
  const center = inverse(500,250); assert(Math.abs(center.lat)<1e-8 && Math.abs(center.lng)<1e-8);
  camera.position.set(400,0,0); camera.lookAt(0,0,0); camera.updateMatrixWorld();
  assert.deepEqual(inverse(500,250),center);
  assert(Math.abs(createSphereUnprojector(camera,1000,500)(500,250).lng-90)<1e-8);
});
