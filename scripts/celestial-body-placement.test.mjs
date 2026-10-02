import test from 'node:test';
import assert from 'node:assert/strict';
import {placeCelestialBodies} from '../src/celestial-body-placement.mjs';
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
