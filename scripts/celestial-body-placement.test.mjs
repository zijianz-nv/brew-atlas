import test from 'node:test';
import assert from 'node:assert/strict';
import {balancedOverviewBodies,constellationInteriorBounds,placeCelestialBodies} from '../src/celestial-body-placement.mjs';
import {createConstellationRingLayout} from '../src/constellation-layout.mjs';
import {createCelestialOrbits,minimumSkyScale} from '../src/celestial-orbits.mjs';
const body=(name,x,y,width=20,height=20)=>({name,x,y,width,height});
const rect=b=>({x:b.x-b.width/2,y:b.y-b.height/2,width:b.width,height:b.height});
const intersects=(a,b,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width>b.x-gap&&a.y<b.y+b.height+gap&&a.y+a.height>b.y-gap;
test('free bodies stay still; a blocked body moves to its closest legal center without moving exclusions',()=>{
 const input={width:300,height:200,padding:0,gap:0,bodies:[body('MARS',70,80),body('VENUS',250,160)],exclusions:[{x:60,y:60,width:50,height:40}]};
 const snapshot=structuredClone(input),placed=placeCelestialBodies(input);
 assert.deepEqual({x:placed[0].x,y:placed[0].y},{x:50,y:80});
 assert.equal(placed[1].moved,false);assert.ok(placed.every(b=>b.placed));
 assert.deepEqual(input,snapshot);
});
test('Sun Moon and Mars reserve nearby positions before outer planets, regardless of input order',()=>{
 const placed=placeCelestialBodies({width:220,height:180,padding:0,gap:8,bodies:[body('JUPITER',110,90),body('SUN',110,90),body('MOON',40,35),body('MARS',180,130)]});
 assert.equal(placed[1].moved,false);assert.equal(placed[2].moved,false);assert.equal(placed[3].moved,false);assert.equal(placed[0].moved,true);
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)assert.equal(intersects(rect(placed[i]),rect(placed[j]),8),false);
});
test('screen controls, Earth and constellation boxes stay clear on a compact viewport',()=>{
 const exclusions=[{x:120,y:220,width:130,height:130},{x:0,y:0,width:250,height:62},{x:0,y:500,width:390,height:120},{x:20,y:130,width:95,height:70},{x:250,y:160,width:110,height:85}];
 const bodies=['SUN','MOON','MARS','JUPITER','SATURN','VENUS','NEPTUNE'].map((n,i)=>body(n,180+i*3,270,24+i*2,24));
 const options={width:390,height:620,gap:5,padding:6,exclusions,bodies},placed=placeCelestialBodies(options);
 assert.ok(placed.every(b=>b.placed));assert.deepEqual(placeCelestialBodies(options),placed);
 for(const b of placed){const r=rect(b);assert.ok(r.x>=6&&r.y>=6&&r.x+r.width<=384&&r.y+r.height<=614);for(const exclusion of exclusions)assert.equal(intersects(r,exclusion,5),false);}
 for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++)assert.equal(intersects(rect(placed[i]),rect(placed[j]),5),false);
});
test('impossible layouts explicitly return unplaced bodies instead of overlapping a constellation',()=>{
 const result=placeCelestialBodies({width:100,height:100,bodies:[body('SUN',50,50,110,110),body('MOON',50,50)],exclusions:[{x:0,y:0,width:100,height:100}]});
 assert.ok(result.every(b=>!b.placed&&b.x===null&&b.y===null));
 assert.throws(()=>placeCelestialBodies({width:NaN,height:100}),RangeError);
});
test('occupied boxes stay inside the circle, including corners, and never escape a blocked interior',()=>{
 const bounds={type:'circle',x:160,y:150,radius:90};
 const placed=placeCelestialBodies({width:320,height:300,bounds,bodies:[body('SUN',310,10,40,40),body('MOON',10,280,22,30)]});
 for(const p of placed){assert(p.placed);assert((Math.abs(p.x-160)+p.width/2)**2+(Math.abs(p.y-150)+p.height/2)**2<=90**2+1e-7);}
 const blocked=placeCelestialBodies({width:320,height:300,bounds:{type:'rectangle',x:90,y:80,width:120,height:130},bodies:[body('SUN',20,20)],exclusions:[{x:90,y:80,width:120,height:130}]});
 assert.equal(blocked[0].placed,false);
 assert.throws(()=>placeCelestialBodies({width:320,height:300,bounds:{type:'circle',x:160,y:150,radius:-1}}),RangeError);
});
test('all nine overview bodies fit inside fixed desktop and mobile constellations without obstructing Earth or controls',()=>{
 for(const [width,height,earthRadius]of [[1440,670,330],[1720,920,430],[1280,490,260],[424,588,254],[409,484,217.9],[354,339,174]]){
  const compact=width<600,skyHeight=height+90,scale=minimumSkyScale(width),r=earthRadius*scale+8;
  const exclusions=[{x:width/2-r,y:height/2-r,width:r*2,height:r*2+18},{x:0,y:0,width:compact?width:365,height:compact?12:140},
   compact?{x:width-260,y:height-14,width:236,height:44}:{x:width-80,y:height*.3,width:80,height:320},
   {x:width/2-155,y:skyHeight-58,width:310,height:58},...(compact?[{x:0,y:0,width:24,height:skyHeight},{x:width-24,y:0,width:24,height:skyHeight}]:[])];
  const sky=createConstellationRingLayout({width,height:skyHeight,centerY:height/2,exclusions}),snapshot=structuredClone(sky);
  assert.equal(sky.length,12);
  const bounds=constellationInteriorBounds({constellations:sky,width,centerY:height/2,gap:compact?5:10});
  const widths=compact?{SUN:160,MOON:33,MARS:26,MERCURY:32,VENUS:46,JUPITER:72,SATURN:110,URANUS:48,NEPTUNE:47}
   :{SUN:Math.min(360,Math.max(210,width*.25)),MOON:76,MARS:48,MERCURY:42,VENUS:68,JUPITER:118,SATURN:190,URANUS:70,NEPTUNE:72};
  const bodies=Object.entries(createCelestialOrbits(width,height).points).filter(([name])=>name!=='EARTH').map(([name,p])=>({name,
   x:width/2+(p.x-width/2)*scale,y:height/2+(p.y-height/2)*scale,width:widths[name]*scale*p.depth,
   height:widths[name]*scale*p.depth*(name==='SATURN'?.6875:1)+(name==='SUN'?0:8)}));
  const gap=compact?5:10,options={width,height:skyHeight,bounds,exclusions:[...exclusions,...sky],gap,padding:compact?24:12};
  let placed;
  for(const sizeScale of compact?[1,.85,.7,.55]:[1]){
   placed=placeCelestialBodies({...options,bodies:balancedOverviewBodies(bodies,bounds).map(b=>b.name==='SUN'?{...b,width:b.width*sizeScale,height:b.height*sizeScale}:b)});
   if(placed.every(p=>p.placed))break;
  }
  assert.equal(placed.filter(p=>p.placed).length,9,`${width}x${height} retains all bodies`);
  assert.deepEqual(sky,snapshot,'planet placement must not move constellations');
  const upper=placed.filter(p=>p.y<height/2),lower=placed.filter(p=>p.y>=height/2);
  assert(upper.length>=3&&lower.length>=3,`${width}x${height} distributes bodies above and below Earth`);
  for(const [i,p]of placed.entries()){
   const occupied=rect(p);
   if(bounds.type==='rectangle')assert(occupied.x>=bounds.x-1e-7&&occupied.y>=bounds.y-1e-7&&occupied.x+occupied.width<=bounds.x+bounds.width+1e-7&&occupied.y+occupied.height<=bounds.y+bounds.height+1e-7);
   else assert((Math.abs(p.x-bounds.x)+p.width/2)**2+(Math.abs(p.y-bounds.y)+p.height/2)**2<=bounds.radius**2+1e-7);
   for(const obstacle of [...exclusions,...sky])assert(!intersects(occupied,obstacle,gap-1e-7),`${p.name} overlaps a reserved region`);
   for(const other of placed.slice(i+1))assert(!intersects(occupied,rect(other),gap-1e-7),`${p.name}/${other.name} overlap`);
  }
 }
});
