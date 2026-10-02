import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalCountry,featureCountry,createCountryPicker,createMapTapTracker,isCountrySurfaceEvent} from '../src/country-selection.mjs';
import {countryOutlineSegments,createCountryOutline,COUNTRY_OUTLINE_BANDS} from '../src/country-outline.mjs';
import {Vector3,Group,Mesh,BoxGeometry,MeshBasicMaterial,PerspectiveCamera} from 'three';
import {ingredientAtPointer,consumeIngredientEvent} from '../src/ingredient-picking.mjs';

test('actual bundled map picks countries at real inland points; ocean clears, and date-line islands stay separate',()=>{
  const map=JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson',import.meta.url),'utf8'));
  const pick=createCountryPicker(map.features);
  for(const [lat,lng,name] of [[39.9,116.4,'China'],[51.5,-.12,'United Kingdom'],[38,-97,'United States'],[43.2,76.9,'Kazakhstan'],[40,16,'Italy'],[36,138,'Japan'],[-18,178,'Fiji'],[64,-151,'United States']])assert.equal(featureCountry(pick(lat,lng)),name);
  for(const [lat,lng] of [[0,-140],[0,-30],[NaN,0],[91,0]])assert.equal(pick(lat,lng),null);
  assert.equal(featureCountry(pick(64,209)),'United States','longitude wraps without inventing a world-spanning polygon');
});

test('holes are not assigned to their surrounding country and separate islands do not join across water',()=>{
  const box=(x,y,w)=>[[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]];
  const a={properties:{name:'Example'},geometry:{type:'MultiPolygon',coordinates:[[box(0,0,10),box(4,4,2)],[box(20,0,4)]]}};
  const pick=createCountryPicker([a]);assert.equal(pick(2,2),a);assert.equal(pick(5,5),null);assert.equal(pick(2,15),null);assert.equal(pick(2,22),a);
});

test('country aliases match the catalogue without merging separate regions or guessing an unknown country',()=>{
  assert.equal(canonicalCountry('United States of America'),'United States');assert.equal(canonicalCountry('Czech Republic'),'Czechia');
  assert.equal(canonicalCountry('Russian Federation'),'Russia');assert.equal(canonicalCountry('Hong Kong'),'Hong Kong');
  assert.equal(canonicalCountry('Taiwan'),'Taiwan');assert.equal(canonicalCountry('Georgia'),'Georgia');assert.equal(canonicalCountry(null),'unknown');
  for(const part of ['England','Scotland','Wales','Northern Ireland'])assert.equal(canonicalCountry(part),'United Kingdom');
});

test('short taps select but drags, return-to-start drags, cancellation and multitouch do not',()=>{
  const tap=createMapTapTracker();tap.start(1,0,0);assert.equal(tap.end(1,2,3),true);
  tap.start(1,0,0);tap.move(1,30,0);assert.equal(tap.end(1,0,0),false);
  tap.start(1,0,0);tap.start(2,0,0);assert.equal(tap.end(1,0,0),false);assert.equal(tap.end(2,0,0),false);
  tap.start(1,0,0);tap.cancel();assert.equal(tap.end(1,0,0),false);
  assert.equal(isCountrySurfaceEvent({target:{closest:()=>({tagName:'BUTTON'})}}),false);
  assert.equal(isCountrySurfaceEvent({target:{closest:()=>null}}),true);
});

const spherePoint=(lat,lng,altitude)=>{
  const phi=lat*Math.PI/180,theta=lng*Math.PI/180,r=100*(1+altitude);
  return {x:r*Math.cos(phi)*Math.sin(theta),y:r*Math.sin(phi),z:r*Math.cos(phi)*Math.cos(theta)};
};

test('Russia outline uses only boundary segments above the sphere, without a triangulated country cap',()=>{
  const {features}=JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson',import.meta.url),'utf8'));
  const positions=countryOutlineSegments(features.filter(feature=>featureCountry(feature)==='Russia'),spherePoint);
  assert.ok(positions.length>600);
  for(let i=0;i<positions.length;i+=6){
    const a=new Vector3(...positions.slice(i,i+3)),b=new Vector3(...positions.slice(i+3,i+6));
    assert.ok(a.clone().add(b).multiplyScalar(.5).length()>100.1,'even the chord midpoint clears the earth, avoiding z-fighting');
    assert.ok(a.distanceTo(b)<.88,'coarse segments follow short surface arcs instead of cutting through the earth');
  }
});

test('outline fades through three screen-width bands and cannot intercept country or plant clicks',()=>{
  let clock=0;
  const features=[{geometry:{type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[0,0]]]}}];
  const outline=createCountryOutline(features,spherePoint,{now:()=>clock});
  const renderer={getViewport:target=>target.set(0,0,390,700)};
  assert.equal(outline.children.length,3);
  for(const [index,line] of outline.children.entries()){
    const hits=[];line.raycast({},hits);assert.deepEqual(hits,[]);
    assert.equal(line.isLineSegments2,true);assert.equal(line.material.depthWrite,false);assert.equal(line.material.depthTest,true);
    assert.equal(line.material.linewidth,COUNTRY_OUTLINE_BANDS[index].width);
    line.onBeforeRender(renderer);assert.equal(line.material.opacity,0);
  }
  clock=160;for(const line of outline.children){line.onBeforeRender(renderer);assert.ok(line.material.opacity>0&&line.material.opacity<1);}
  clock=320;for(const [index,line] of outline.children.entries()){line.onBeforeRender(renderer);assert.equal(line.material.opacity,COUNTRY_OUTLINE_BANDS[index].opacity);}
  outline.userData.dispose();
  const reduced=createCountryOutline(features,spherePoint,{reducedMotion:true});
  assert.equal(reduced.children[2].material.opacity,COUNTRY_OUTLINE_BANDS[2].opacity);reduced.userData.dispose();
});

test('actual invisible patch hit surface takes priority over the globe, but never picks the far hemisphere',()=>{
  const camera=new PerspectiveCamera(50,1,.1,1000);camera.position.set(0,0,300);camera.lookAt(0,0,0);
  const scene=new Group(),front=new Group(),back=new Group();
  for(const [group,id,z] of [[front,'front-field',102],[back,'far-field',-102]]){
    group.userData.regionId=id;const material=new MeshBasicMaterial();material.visible=false;
    group.add(new Mesh(new BoxGeometry(6,6,2),material));group.position.z=z;scene.add(group);
  }
  const args={event:{clientX:200,clientY:200},rect:{left:0,top:0,width:400,height:400},camera,globeRadius:100};
  assert.equal(ingredientAtPointer({...args,adapters:[front,back]}),'front-field');
  assert.equal(ingredientAtPointer({...args,adapters:[back]}),null,'earth blocks a plant on the far side');
  assert.equal(ingredientAtPointer({...args,event:{clientX:10,clientY:10},adapters:[front,back]}),null,'no hit enlargement beyond the real patch bounds');
  for(const group of [front,back]){group.children[0].geometry.dispose();group.children[0].material.dispose();}
});

test('consumed plant events cannot subsequently change country or clear it as ocean',()=>{
  let immediate=false;
  const event={preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.cancelBubble=true;},stopImmediatePropagation(){immediate=true;},target:{closest:()=>null}};
  consumeIngredientEvent(event);assert.equal(immediate,true);assert.equal(isCountrySurfaceEvent(event),false);
});

test('China browsing group includes Taiwan and Japan while Japan remains an independent selection',async()=>{
 const {countrySelectionKey,countrySelectionValues,matchesCountrySelection,countrySelectionLabel}=await import('../src/country-selection.mjs');
 const {filterCatalog,countFacets}=await import('../src/catalog-filters.mjs');
 const map=JSON.parse(readFileSync(new URL('../public/maps/world-50m.geojson',import.meta.url),'utf8'));
 const pick=createCountryPicker(map.features);
 assert.equal(featureCountry(pick(23.7,121)),'China');assert.equal(featureCountry(pick(36,138)),'Japan');
 assert.equal(countrySelectionKey('Taiwan'),'China');assert.equal(canonicalCountry('Taiwan'),'Taiwan');assert.equal(canonicalCountry('Japan'),'Japan');
 const china=map.features.filter(f=>matchesCountrySelection('China',f.properties.name)).map(f=>f.properties.name).sort();
 assert.deepEqual(china,['China','Japan','Taiwan']);
 assert.deepEqual(map.features.filter(f=>matchesCountrySelection('Japan',f.properties.name)).map(f=>f.properties.name),['Japan']);
 assert.equal(countrySelectionLabel('China','中国台湾'),'中国');assert.equal(countrySelectionLabel('Japan'),'日本');
 const beers=['China','Taiwan','Japan','Singapore'].map((country,i)=>({id:String(i),breweryId:country}));
 const breweries=Object.fromEntries(beers.map(b=>[b.breweryId,{country:b.breweryId}]));
 assert.deepEqual(filterCatalog(beers,{},breweries,{country:'China'}).map(b=>b.breweryId),['China','Taiwan','Japan']);
 assert.deepEqual(filterCatalog(beers,{},breweries,{country:'Japan'}).map(b=>b.breweryId),['Japan']);
 const counts=countFacets(beers,{},breweries,{}).country;assert.equal(counts.China,3);assert.equal(counts.Japan,1);assert.equal(counts.all,4);
 assert.deepEqual(countrySelectionValues('Singapore'),['Singapore']);
});
