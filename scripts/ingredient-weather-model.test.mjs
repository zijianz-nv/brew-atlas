import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Group,Vector3} from 'three';
import {createIngredientWeatherBadge,disposeWeatherBadgeCache,ingredientWeatherBadgeCacheStats} from '../src/ingredient-weather-model.mjs';

test('six small +Y-up weather badges use at most two merged draw calls and no texture or text',()=>{
  for(const kind of ['sunny','cloudy','rain','snow','storm','fog']){
    const badge=createIngredientWeatherBadge(kind),box=new Box3().setFromObject(badge),size=box.getSize(new Vector3());
    assert(badge instanceof Group);assert(badge.children.length>=1&&badge.children.length<=2,kind);
    assert(box.min.y>=0&&box.max.y<=2,`${kind}: Y bounds ${box.min.y}, ${box.max.y}`);
    assert(size.x<=3.5&&size.z<=1.2,`${kind}: bounded canopy hint`);
    for(const mesh of badge.children){
      assert(mesh.isMesh);assert.equal(mesh.geometry.groups.length,0,'one material draw per merged mesh');
      assert(mesh.geometry.attributes.color);assert.equal(mesh.material.map,null);
      assert.equal(mesh.material.depthWrite,false);assert(mesh.material.opacity>.5&&mesh.material.opacity<1);
      for(const key of ['position','normal','color'])assert([...mesh.geometry.attributes[key].array].every(Number.isFinite));
    }
  }
  const stats=ingredientWeatherBadgeCacheStats();assert.equal(stats.kinds,6);assert.equal(stats.materials,2);
  assert(stats.models.every(model=>model.triangles<1500),'small, bounded geometry budget');
});

test('instances share GPU resources but their transforms and children remain independent',()=>{
  const first=createIngredientWeatherBadge('rain'),second=createIngredientWeatherBadge('rain');
  assert.notEqual(first,second);assert.notEqual(first.children[0],second.children[0]);
  assert.equal(first.children[0].geometry,second.children[0].geometry);
  assert.equal(first.children[0].material,second.children[0].material);
  first.position.set(3,4,5);first.children[0].visible=false;
  assert.deepEqual(second.position.toArray(),[0,0,0]);assert.equal(second.children[0].visible,true);
  first.removeFromParent();assert(second.children[0].geometry.attributes.position.count>0);
});

test('unknown conditions are empty; cache disposal is explicit and a later call rebuilds safely',()=>{
  for(const kind of ['unknown','',null,undefined,0,'rainy'])assert.equal(createIngredientWeatherBadge(kind).children.length,0);
  const before=createIngredientWeatherBadge('sunny').children[0].geometry;let disposals=0;
  before.addEventListener('dispose',()=>{disposals++});
  disposeWeatherBadgeCache();assert.equal(disposals,1);assert.equal(ingredientWeatherBadgeCacheStats().kinds,0);
  const after=createIngredientWeatherBadge('sunny').children[0].geometry;assert.notEqual(before,after);
  disposeWeatherBadgeCache();
});
