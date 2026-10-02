import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngredientGarden, getIngredientGardenStats, createIngredientField, getIngredientFieldStats, setGardenSway, disposeIngredientGardenCache } from '../src/ingredient-gardens.mjs';
import { INGREDIENT_REGIONS, INGREDIENT_TYPES } from '../src/ingredient-regions.mjs';
import {Raycaster,Vector3} from 'three';

function meshes(group) {
  const result = [];
  group.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
}

test('crop fields form a wide patch of small plants without multiplying draw calls', () => {
  for (const {id} of INGREDIENT_TYPES) for (const compact of [true,false]) {
    const field=createIngredientField(id,{compact}), stats=getIngredientFieldStats(id,{compact});
    const plants=meshes(field).filter(mesh=>mesh.material.visible), base=getIngredientGardenStats(id,{compact});
    assert.equal(plants.length,2);
    assert.ok(plants.every(mesh=>mesh.isInstancedMesh&&mesh.count===20));
    assert.ok(stats.bounds.max[1]<=base.bounds.max[1]*.52);
    assert.ok(stats.bounds.max[0]-stats.bounds.min[0]>1.9*stats.bounds.max[1]);
    assert.ok(stats.bounds.min[1]>=-.01);
    assert.equal(stats.drawCalls,2);
    assert.equal(stats.triangles,base.triangles*20);
    field.updateMatrixWorld(true);
    const hit=field.getObjectByName('ingredient-field-hit-area');
    assert.equal(hit.material.visible,false);
    assert.ok(new Raycaster(new Vector3(0,8,0),new Vector3(0,-1,0)).intersectObject(hit).length>0,'gaps inside field remain clickable without visible geometry');
  }
  assert.ok(INGREDIENT_REGIONS.reduce((sum,r)=>sum+getIngredientFieldStats(r.type).triangles,0)<1_200_000);
  assert.ok(INGREDIENT_REGIONS.reduce((sum,r)=>sum+getIngredientFieldStats(r.type,{compact:true}).triangles,0)<800_000);
});

test('all nine crops have finite indexed 3D surfaces and compact roots without external textures', () => {
  for (const { id } of INGREDIENT_TYPES) for (const compact of [false, true]) {
    const group = createIngredientGarden(id, { compact });
    assert.equal(group.isGroup, true);
    const objects = meshes(group);
    assert.ok(objects.length > 0 && objects.length <= 3, id);
    for (const mesh of objects) {
      for (const field of ['position', 'normal', 'color']) {
        const attribute = mesh.geometry.attributes[field];
        assert.ok(attribute?.count > 0);
        assert.ok([...attribute.array].every(Number.isFinite), `${id}: finite ${field}`);
      }
      const position = mesh.geometry.attributes.position;
      const normal = mesh.geometry.attributes.normal;
      assert.equal(normal.count, position.count);
      assert.equal(mesh.geometry.attributes.color.count, position.count);
      assert.equal(mesh.geometry.index.count % 3, 0);
      assert.ok([...mesh.geometry.index.array].every(index => index >= 0 && index < position.count));
      assert.equal(mesh.material.map, null);
      assert.equal(mesh.material.transparent, false);
    }
    const { bounds } = getIngredientGardenStats(id, { compact });
    assert.ok(bounds.min[1] >= -.01 && bounds.min[1] <= .02, `${id}: root stays at ground`);
    assert.ok(bounds.max[1] > 1.5 && bounds.max[1] < 3.5, `${id}: botanical height`);
    assert.ok(bounds.max[0] - bounds.min[0] > .5 && bounds.max[2] - bounds.min[2] > .5,
      `${id}: dimensional foliage, not a single billboard`);
  }
});

test('the complete current region scene stays below its geometry and draw-call budgets', () => {
  let detailedTotal = 0, compactTotal = 0;
  for (const region of INGREDIENT_REGIONS) {
    const detailed = getIngredientGardenStats(region.type);
    const compact = getIngredientGardenStats(region.type, { compact: true });
    assert.ok(compact.triangles < detailed.triangles, `${region.type}: compact genuinely saves geometry`);
    assert.ok(detailed.drawCalls <= 3 && compact.drawCalls <= 3);
    detailedTotal += detailed.triangles; compactTotal += compact.triangles;
  }
  assert.ok(detailedTotal < 80_000, `full scene: ${detailedTotal}`);
  assert.ok(compactTotal < 50_000, `phone scene: ${compactTotal}`);
});

test('region instances share immutable geometry resources but retain independent scene transforms', () => {
  const first = createIngredientGarden('coffee'), second = createIngredientGarden('coffee');
  assert.notEqual(first, second);
  const a = meshes(first), b = meshes(second);
  for (let index = 0; index < a.length; index++) {
    assert.equal(a[index].geometry, b[index].geometry);
    assert.equal(a[index].material, b[index].material);
    assert.notEqual(a[index], b[index]);
  }
  const positions = a[0].geometry.attributes.position.array.slice();
  first.position.set(9, 8, 7); first.rotation.set(Math.PI / 2, .3, .2); first.scale.setScalar(4.1);
  const external = [first.position.toArray(), first.rotation.toArray(), first.scale.toArray()];
  for (const seconds of [0, 1, 10, 1000]) {
    setGardenSway(first, seconds);
    assert.deepEqual([first.position.toArray(), first.rotation.toArray(), first.scale.toArray()], external);
    const crown = first.children[0];
    assert.ok(Math.abs(crown.rotation.x) <= .008 && Math.abs(crown.rotation.z) <= .012);
  }
  assert.deepEqual(second.position.toArray(), [0, 0, 0]);
  assert.equal(second.children[0].rotation.x, 0);
  assert.deepEqual(a[0].geometry.attributes.position.array, positions);
  const rotation = first.children[0].rotation.toArray();
  setGardenSway(first, NaN); setGardenSway(first, Infinity); setGardenSway(null, 1);
  assert.deepEqual(first.children[0].rotation.toArray(), rotation);
});

test('unknown categories fail explicitly and full teardown permits safe cache reconstruction', () => {
  assert.throws(() => createIngredientGarden('water'), RangeError);
  assert.throws(() => getIngredientGardenStats('yeast'), RangeError);
  const oldGroup = createIngredientGarden('barley');
  const oldGeometry = meshes(oldGroup)[0].geometry, oldMaterial = meshes(oldGroup)[0].material;
  let geometryDisposals = 0, materialDisposals = 0;
  oldGeometry.addEventListener('dispose', () => geometryDisposals++);
  oldMaterial.addEventListener('dispose', () => materialDisposals++);
  const oldStats = getIngredientGardenStats('barley');
  disposeIngredientGardenCache(); disposeIngredientGardenCache();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
  const rebuilt = meshes(createIngredientGarden('barley'));
  assert.notEqual(rebuilt[0].geometry, oldGeometry);
  assert.notEqual(rebuilt[0].material, oldMaterial);
  assert.deepEqual(getIngredientGardenStats('barley'), oldStats);
});
