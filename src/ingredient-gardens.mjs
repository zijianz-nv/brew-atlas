import * as THREE from 'three';

// Original, deterministic miniature crop models. Local +Y is up; roots are at
// (0,0,0). three-globe objectFacesSurface points local +Z outward, so its caller
// should rotate this group +PI/2 about X. No textures, soil discs or map offsets.
const TYPES = new Set(['barley', 'hops', 'wheat', 'oats', 'rye', 'citrus', 'coriander', 'coffee', 'cocoa']);
const cache = new Map();
const primitives = new Map();
let materials;
let fieldHitMaterial,fieldHitGeometry;
const UP = new THREE.Vector3(0, 1, 0);
const PALETTE = {
  stem: '#82915c', young: '#a7ad69', leaf: '#668c59', leafLight: '#8aa86c',
  darkLeaf: '#436e4a', grass: '#648067', bark: '#83634c', gold: '#deb66b',
  grain: '#ecd095', rye: '#c6b579', oat: '#d1c69b', hop: '#bdd18a',
  coffee: '#b93e37', coffeeRipe: '#e06549', citrus: '#efa93f', cocoa: '#d49641',
  cream: '#f3e2b3', flower: '#eef0d8',
};

function materialPair() {
  if (!materials) materials = [
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  ];
  return materials;
}

function primitive(kind) {
  if (!primitives.has(kind)) {
    const geometry = kind === 'seed' ? new THREE.SphereGeometry(1, 4, 2)
      : kind === 'fruit' ? new THREE.SphereGeometry(1, 6, 3)
      : new THREE.CylinderGeometry(.65, 1, 1, kind === 'twig' ? 3 : 5, 1, false);
    primitives.set(kind, geometry);
  }
  return primitives.get(kind);
}

class GeometryBatch {
  constructor() { this.positions = []; this.normals = []; this.colors = []; this.indices = []; }
  stamp(geometry, matrix, color) {
    const offset = this.positions.length / 3;
    const positions = geometry.attributes.position, normals = geometry.attributes.normal;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), tint = new THREE.Color(color);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
      normal.fromBufferAttribute(normals, i).applyNormalMatrix(normalMatrix);
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      // Subtle facet variation is baked into shared geometry, never animated.
      const light = .94 + .06 * Math.max(0, normal.y);
      this.colors.push(tint.r * light, tint.g * light, tint.b * light);
    }
    const index = geometry.index;
    if (index) for (let i = 0; i < index.count; i++) this.indices.push(offset + index.getX(i));
    else for (let i = 0; i < positions.count; i++) this.indices.push(offset + i);
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const at = (point, dx = 0, dy = 0, dz = 0) => point.clone().add(v(dx, dy, dz));

function tube(batch, start, end, radius, color = PALETTE.stem, twig = true) {
  const delta = end.clone().sub(start), length = delta.length();
  if (length < 1e-5) return;
  batch.stamp(primitive(twig ? 'twig' : 'branch'), new THREE.Matrix4().compose(
    start.clone().add(end).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()),
    v(radius, length, radius)), color);
}

function ellipsoid(batch, center, size, color, direction = UP, detailed = false) {
  batch.stamp(primitive(detailed ? 'fruit' : 'seed'), new THREE.Matrix4().compose(center,
    new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()), v(...size)), color);
}

// Curved, creased leaf surface: a raised midrib and a drooping tip provide a
// readable botanical silhouette from both the globe's side and overhead views.
function leaf(batch, base, direction, length, width, color, { bend = .17, lobed = false, segments = 4 } = {}) {
  const points = [], indices = [];
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const envelope = Math.sin(Math.PI * t) ** .72;
    const halfWidth = width * envelope * (lobed ? .83 + .17 * Math.cos(t * Math.PI * 6) : 1);
    const curvature = -bend * length * t * t;
    points.push(-halfWidth, length * t, curvature, 0, length * t, curvature + width * .22 * envelope,
      halfWidth, length * t, curvature);
    if (row < segments) {
      const i = row * 3;
      indices.push(i, i + 3, i + 1, i + 1, i + 3, i + 4, i + 1, i + 4, i + 2, i + 2, i + 4, i + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  batch.stamp(geometry, new THREE.Matrix4().compose(base,
    new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()), v(1, 1, 1)), color);
  geometry.dispose();
}

function grass(batch, compact) {
  const count = compact ? 3 : 5;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996, radius = .13 + (i % 3) * .09;
    const base = v(Math.cos(angle) * radius, .006, Math.sin(angle) * radius);
    leaf(batch, base, v(Math.cos(angle) * .65, 1, Math.sin(angle) * .65), .26 + (i % 3) * .065,
      .019, i % 2 ? PALETTE.grass : PALETTE.young, { segments: 3, bend: .3 });
  }
}

function grainGarden(type, foliage, harvest, compact) {
  const count = compact ? 4 : 6;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996 + .23, r = .19 + .085 * (i % 5);
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    const height = 1.38 + (i % 4) * .19, lean = .12 + (i % 3) * .05;
    const stem = [v(x, .008, z), v(x * 1.1, height * .43, z * 1.1),
      v(x + Math.cos(angle) * lean, height, z + Math.sin(angle) * lean)];
    tube(foliage, stem[0], stem[1], .015);
    tube(foliage, stem[1], stem[2], .012, type === 'rye' ? '#769287' : PALETTE.young);
    for (let j = 0; j < 2; j++) {
      const a = angle + j * 2.6, base = stem[0].clone().lerp(stem[2], .3 + j * .25);
      leaf(foliage, base, v(Math.cos(a) * .7, .65, Math.sin(a) * .7), .5 + j * .06,
        type === 'wheat' ? .055 : .035, type === 'rye' ? '#739786' : PALETTE.leafLight, { bend: .4, segments: 3 });
    }
    const tip = stem[2];
    if (type === 'oats') {
      const top = at(tip, .08, .49, 0);
      tube(foliage, tip, top, .009, PALETTE.oat);
      const branches = compact ? 3 : 4;
      for (let j = 0; j < branches; j++) {
        const a = angle + j * 2.4;
        const joint = tip.clone().lerp(top, .2 + j * .16);
        const hanging = at(joint, Math.cos(a) * (.22 - j * .025), -.11, Math.sin(a) * (.22 - j * .025));
        const elbow = joint.clone().lerp(hanging, .55).add(v(0, .07, 0));
        tube(harvest, joint, elbow, .006, PALETTE.oat);
        tube(harvest, elbow, hanging, .005, PALETTE.oat);
        ellipsoid(harvest, at(hanging, 0, -.055, 0), [.042, .12, .036], j % 2 ? PALETTE.cream : PALETTE.oat, v(.2, 1, .1));
        if (!compact) ellipsoid(harvest, at(hanging, .055, -.025, .025), [.031, .085, .031], PALETTE.oat);
      }
      continue;
    }
    const rows = type === 'wheat' ? 6 : 5;
    const earHeight = type === 'rye' ? .68 : .56;
    const top = at(tip, .07, earHeight, .02);
    tube(harvest, tip, top, .012, PALETTE.gold);
    for (let j = 0; j < rows; j++) for (const side of [-1, 1]) {
      const t = (j + .3) / rows, a = angle + (j % 2) * .75;
      const outward = v(Math.cos(a) * side, 0, Math.sin(a) * side);
      const center = tip.clone().lerp(top, t).addScaledVector(outward, type === 'wheat' ? .048 : .035);
      ellipsoid(harvest, center, [type === 'wheat' ? .056 : .037, type === 'rye' ? .095 : .082, .035],
        type === 'rye' ? PALETTE.rye : j % 2 ? PALETTE.grain : PALETTE.gold, outward.clone().multiplyScalar(.42).add(UP));
      // Awns are narrow tapered ribbons, not expensive cylinders or screen lines.
      if (type !== 'wheat' || j > 3) leaf(harvest, at(center, 0, .065, 0),
        outward.clone().multiplyScalar(.42).add(UP), type === 'barley' ? .43 : .25,
        type === 'barley' ? .007 : .005, PALETTE.grain, { bend: .02, segments: 2 });
    }
  }
}

function hopGarden(foliage, harvest, compact) {
  const vines = compact ? 2 : 3;
  for (let i = 0; i < vines; i++) {
    const x = (i - (vines - 1) / 2) * .45, angle = i * 2.1;
    let previous = v(x, .01, 0);
    for (let j = 1; j <= 7; j++) {
      const point = v(x + Math.sin(j * .85 + angle) * .15, j * .29, Math.cos(j * .85 + angle) * .13);
      tube(foliage, previous, point, .02, PALETTE.stem);
      if (j >= 2 && j % 2 === 0) {
        const side = j % 4 === 0 ? -1 : 1;
        const base = at(point, side * .12, .02, 0);
        tube(foliage, point, base, .009);
        for (let lobe = -1; lobe <= 1; lobe++) leaf(foliage, base,
          v(side * (.65 + lobe * .15), .45, lobe * .5), lobe === 0 ? .56 : .4,
          .13, (j + i) % 3 ? PALETTE.leaf : PALETTE.leafLight, { lobed: true, bend: .3, segments: 3 });
      }
      if (j === 3 || j === 6) {
        const cone = at(point, i % 2 ? -.23 : .23, -.07, .16);
        tube(foliage, point, at(cone, 0, .13, 0), .009);
        ellipsoid(harvest, cone, [.13, .2, .13], PALETTE.hop);
        for (let tier = 0; tier < 3; tier++) for (let p = 0; p < 5; p++) {
          const a = p * Math.PI * 2 / 5 + tier * .65;
          const base = at(cone, Math.cos(a) * .09, .13 - tier * .09, Math.sin(a) * .09);
          leaf(harvest, base, v(Math.cos(a) * .4, -1, Math.sin(a) * .4), .17, .065,
            (p + tier) % 3 ? PALETTE.hop : '#d8df9c', { segments: 2, bend: -.12 });
        }
      }
      previous = point;
    }
  }
}

function coffeeGarden(foliage, harvest, compact) {
  const stems = compact ? 2 : 3;
  for (let i = 0; i < stems; i++) {
    const a = i * 2.39996, base = v(Math.cos(a) * .27, 0, Math.sin(a) * .27);
    const top = at(base, Math.cos(a) * .18, 1.55 + i * .12, Math.sin(a) * .18);
    tube(foliage, base, top, .039, PALETTE.bark, false);
    for (let j = 0; j < 3; j++) for (const side of [-1, 1]) {
      const angle = a + j * 1.55, joint = base.clone().lerp(top, .37 + j * .21);
      const direction = v(Math.cos(angle) * side, .27, Math.sin(angle) * side);
      const end = joint.clone().addScaledVector(direction, .43 - j * .045);
      tube(foliage, joint, end, .014, PALETTE.bark);
      leaf(foliage, end, direction, .51, .135, (j + i) % 2 ? PALETTE.darkLeaf : PALETTE.leaf,
        { bend: .35, segments: 4 });
      for (let berry = 0; berry < 2; berry++) {
        const center = joint.clone().lerp(end, .44 + berry * .24).add(v(.015, -.038, .035));
        ellipsoid(harvest, center, [.06, .075, .059], berry ? PALETTE.coffee : PALETTE.coffeeRipe);
      }
    }
  }
}

function cocoaPod(batch, center, length, radius, color, direction) {
  const positions = [], indices = [], rings = 5, sides = 8;
  for (let row = 0; row <= rings; row++) {
    const t = row / rings, envelope = Math.sin(Math.PI * t) ** .62;
    for (let side = 0; side < sides; side++) {
      const a = side * Math.PI * 2 / sides, r = radius * envelope * (side % 2 ? .84 : 1);
      positions.push(Math.cos(a) * r, (t - .5) * length, Math.sin(a) * r);
      if (row < rings) {
        const i = row * sides + side, next = row * sides + (side + 1) % sides;
        indices.push(i, i + sides, next, next, i + sides, next + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  batch.stamp(geometry, new THREE.Matrix4().compose(center,
    new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()), v(1, 1, 1)), color);
  geometry.dispose();
}

function treeGarden(type, foliage, harvest, compact) {
  const cocoa = type === 'cocoa', trunk = v(0, 1.32, 0);
  tube(foliage, v(0, .008, 0), trunk, .071, PALETTE.bark, false);
  const branches = compact ? 4 : 6;
  for (let i = 0; i < branches; i++) {
    const a = i * 2.39996, joint = v(0, .66 + (i % 3) * .2, 0);
    const end = v(Math.cos(a) * (.6 + (i % 2) * .1), 1.36 + (i % 3) * .18, Math.sin(a) * .6);
    const fork = joint.clone().lerp(end, .64).add(v(0, .12, 0));
    tube(foliage, joint, fork, .028, PALETTE.bark, false);
    tube(foliage, fork, end, .018, PALETTE.bark);
    for (let j = 0; j < (compact ? 3 : 4); j++) {
      const theta = a + (j - 1.5) * .65;
      const base = fork.clone().lerp(end, .2 + j * .24);
      leaf(foliage, base, v(Math.cos(theta), .3 + (j % 2) * .25, Math.sin(theta)),
        cocoa ? .67 : .42, cocoa ? .17 : .115, j % 2 ? PALETTE.leaf : PALETTE.darkLeaf,
        { bend: cocoa ? .45 : .19, segments: 4 });
    }
    if (cocoa) {
      // Cacao is cauliflorous: pods emerge near trunk and older branches,
      // rather than being hung on the ends of a citrus-shaped canopy.
      const center = joint.clone().lerp(fork, .26).add(v(Math.cos(a) * .09, -.14, Math.sin(a) * .09));
      cocoaPod(harvest, center, .54, .13, i % 2 ? '#b76b38' : PALETTE.cocoa, v(Math.cos(a) * .28, 1, Math.sin(a) * .28));
    } else {
      const center = at(end, 0, -.14, 0);
      ellipsoid(harvest, center, [.15, .155, .15], i % 2 ? PALETTE.citrus : '#e5be54', UP, true);
      leaf(foliage, at(center, 0, .14, 0), v(.5, .2, .2), .12, .035, PALETTE.darkLeaf, { segments: 2 });
    }
  }
}

function corianderGarden(foliage, harvest, compact) {
  const stems = compact ? 5 : 7;
  for (let i = 0; i < stems; i++) {
    const a = i * 2.39996, base = v(Math.cos(a) * .28, 0, Math.sin(a) * .28);
    const crown = at(base, Math.cos(a) * .18, 1.2 + (i % 3) * .19, Math.sin(a) * .18);
    tube(foliage, base, crown, .015, PALETTE.young);
    for (let branch = 0; branch < 2; branch++) {
      const joint = base.clone().lerp(crown, .34 + branch * .23), angle = a + branch * 2.2;
      for (let leaflet = -1; leaflet <= 1; leaflet++) leaf(foliage, joint,
        v(Math.cos(angle + leaflet * .45), .52, Math.sin(angle + leaflet * .45)),
        .35, .025, PALETTE.leafLight, { segments: 3, lobed: true, bend: .15 });
    }
    const rays = compact ? 5 : 6;
    for (let ray = 0; ray < rays; ray++) {
      const angle = a + ray * Math.PI * 2 / rays;
      const flower = at(crown, Math.cos(angle) * .22, .11, Math.sin(angle) * .22);
      tube(foliage, crown, flower, .007, PALETTE.young);
      for (let petal = 0; petal < 3; petal++) {
        const pa = petal * Math.PI * 2 / 3;
        ellipsoid(harvest, at(flower, Math.cos(pa) * .025, 0, Math.sin(pa) * .025),
          [.028, .016, .028], petal === 0 ? PALETTE.cream : PALETTE.flower);
      }
    }
  }
}

function definition(type, compact) {
  if (!TYPES.has(type)) throw new RangeError(`Unknown ingredient garden type: ${type}`);
  const key = `${type}:${compact ? 'compact' : 'full'}`;
  if (cache.has(key)) return cache.get(key);
  const foliage = new GeometryBatch(), harvest = new GeometryBatch();
  grass(foliage, compact);
  if (['barley', 'wheat', 'oats', 'rye'].includes(type)) grainGarden(type, foliage, harvest, compact);
  else if (type === 'hops') hopGarden(foliage, harvest, compact);
  else if (type === 'coffee') coffeeGarden(foliage, harvest, compact);
  else if (type === 'coriander') corianderGarden(foliage, harvest, compact);
  else treeGarden(type, foliage, harvest, compact);
  const geometries = [foliage.geometry(), harvest.geometry()];
  const bounds = geometries.reduce((box, geometry) => box.union(geometry.boundingBox), new THREE.Box3());
  const triangles = geometries.reduce((sum, geometry) => sum + geometry.index.count / 3, 0);
  const vertices = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const value = { geometries, stats: Object.freeze({ type, compact: Boolean(compact), drawCalls: geometries.length,
    triangles, vertices, bounds: Object.freeze({ min: Object.freeze(bounds.min.toArray()), max: Object.freeze(bounds.max.toArray()) }) }) };
  cache.set(key, value);
  return value;
}

export function createIngredientGarden(type, { compact = false } = {}) {
  const model = definition(type, compact), group = new THREE.Group(), crown = new THREE.Group();
  group.name = `ingredient-garden-${type}`;
  crown.name = 'garden-crown';
  const sharedMaterials = materialPair();
  model.geometries.forEach((geometry, index) => {
    const mesh = new THREE.Mesh(geometry, sharedMaterials[index]);
    mesh.name = index === 0 ? 'stems-and-leaves' : 'flowers-grains-and-fruit';
    mesh.castShadow = false; mesh.receiveShadow = false;
    crown.add(mesh);
  });
  group.add(crown);
  group.userData.ingredientGarden = { type, compact: Boolean(compact), stats: model.stats };
  return group;
}

// A low, wide crop patch: several small botanical clumps, not one giant plant.
// Instancing shares the two botanical meshes, so a field still takes two draws.
const FIELD_CLUMPS = Object.freeze(Array.from({length:20},(_,index)=>{
  const row=Math.floor(index/5),column=index%5;
  return Object.freeze([(column-2)*.60+(row%2)*.12,(row-1.5)*.48,
    .46+(index%4)*.016, index*2.39996]);
}));

function fieldMatrices() {
  return FIELD_CLUMPS.map(([x,z,scale,angle]) => new THREE.Matrix4().compose(
    v(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, angle), v(scale,scale,scale)));
}

export function getIngredientFieldStats(type, { compact = false } = {}) {
  const model = definition(type, compact), bounds = new THREE.Box3();
  for (const matrix of fieldMatrices()) for (const geometry of model.geometries)
    bounds.union(geometry.boundingBox.clone().applyMatrix4(matrix));
  return Object.freeze({ ...model.stats, clumps: FIELD_CLUMPS.length,
    triangles: model.stats.triangles * FIELD_CLUMPS.length,
    tallestClump: model.stats.bounds.max[1] * .508,
    bounds: Object.freeze({ min: Object.freeze(bounds.min.toArray()), max: Object.freeze(bounds.max.toArray()) }) });
}

export function createIngredientField(type, { compact = false } = {}) {
  const model = definition(type, compact), group = new THREE.Group(), crown = new THREE.Group();
  const transforms = fieldMatrices(), sharedMaterials = materialPair();
  group.name = `ingredient-field-${type}`; crown.name = 'garden-crown';
  model.geometries.forEach((geometry, index) => {
    const mesh = new THREE.InstancedMesh(geometry, sharedMaterials[index], transforms.length);
    transforms.forEach((matrix, instance) => mesh.setMatrixAt(instance, matrix));
    mesh.name = index ? 'field-grains-and-fruit' : 'field-stems-and-leaves';
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    // The precise patch box below handles selection. Picking every leaf and
    // grain across twenty instances is needlessly expensive on pointer moves.
    mesh.raycast = () => {};
    crown.add(mesh);
  });
  group.add(crown);
  const stats=getIngredientFieldStats(type, { compact });
  group.userData.ingredientGarden = { type, compact, field: true, stats };
  // Hit the whole patch, including the tiny gaps between stems. Material stays
  // invisible to the renderer while Mesh.raycast remains enabled (no extra draw).
  fieldHitMaterial ||= new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  fieldHitGeometry ||= new THREE.BoxGeometry(1,1,1);
  const hit=new THREE.Mesh(fieldHitGeometry,fieldHitMaterial);
  const box=new THREE.Box3(v(...stats.bounds.min),v(...stats.bounds.max));
  box.getCenter(hit.position);box.getSize(hit.scale);hit.name='ingredient-field-hit-area';
  hit.userData.ingredientHitArea=true;group.add(hit);
  return group;
}

// Time is seconds. Only the internal crown rotates (<1 degree), so an external
// surface orientation, geographic position and scale are never overwritten.
export function setGardenSway(group, timeSeconds) {
  const crown = group?.children.find(child => child.name === 'garden-crown');
  if (!crown || !Number.isFinite(timeSeconds)) return;
  const type = group.userData.ingredientGarden?.type ?? '';
  const phase = [...type].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) * .013;
  crown.rotation.x = Math.sin(timeSeconds * .68 + phase) * .008;
  crown.rotation.z = Math.sin(timeSeconds * .53 + phase * .7) * .012;
}

export function getIngredientGardenStats(type, { compact = false } = {}) {
  return definition(type, compact).stats;
}

// Shared resources outlive individual map objects. Call only after all garden
// objects using this module have been removed (e.g. view teardown), never when
// removing one region. Later calls can safely rebuild the cache.
export function disposeIngredientGardenCache() {
  for (const { geometries } of cache.values()) for (const geometry of geometries) geometry.dispose();
  cache.clear();
  for (const geometry of primitives.values()) geometry.dispose();
  primitives.clear();
  if (materials) for (const material of materials) material.dispose();
  materials = undefined;
  fieldHitGeometry?.dispose();fieldHitMaterial?.dispose();fieldHitGeometry=undefined;fieldHitMaterial=undefined;
}
