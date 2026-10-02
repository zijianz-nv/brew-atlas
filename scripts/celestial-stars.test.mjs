import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ZODIAC_CONSTELLATIONS,CELESTIAL_STAR_METADATA,projectEquatorial,projectEquatorialLine,createConstellationSkyMap} from '../src/celestial-stars.mjs';
test('twelve figures retain catalog star positions, valid links and source license',()=>{
 assert.equal(ZODIAC_CONSTELLATIONS.length,12);
 assert.equal(CELESTIAL_STAR_METADATA.epoch,'J2000');
 assert.equal(CELESTIAL_STAR_METADATA.view,'unfolded_full_sky_atlas');
 assert.match(readFileSync(new URL('../public/data-sources/celestial/d3-celestial-LICENSE.txt',import.meta.url),'utf8'),/Copyright \(c\) 2015, Olaf Frohn/);
 for(const c of ZODIAC_CONSTELLATIONS){
  assert.ok(c.stars.length>=3);assert.ok(c.lines.length);
  for(const s of c.stars){assert.ok(s.raDeg>=0&&s.raDeg<360);assert.ok(Math.abs(s.decDeg)<=90);assert.ok(Number.isFinite(s.magnitude));assert.match(s.id,/^HIP \d+$/);}
  for(const l of c.lines)for(const i of l)assert.ok(Number.isInteger(i)&&c.stars[i]);
 }
 const stars=ZODIAC_CONSTELLATIONS.flatMap(c=>c.stars);
 const antares=stars.find(s=>s.id==='HIP 80763');
 assert.ok(Math.abs(antares.raDeg-247.3519)<.002);assert.ok(Math.abs(antares.decDeg+26.4320)<.002);
 const spica=stars.find(s=>s.id==='HIP 65474');
 assert.ok(Math.abs(spica.raDeg-201.2983)<.002);assert.ok(Math.abs(spica.decDeg+11.1613)<.002);
 assert.deepEqual(ZODIAC_CONSTELLATIONS.filter(c=>c.starEmphasis).map(c=>c.name),['Libra','Scorpius']);
});
test('equirectangular orientation respects RA, declination, wrap and invalid positions',()=>{
 const o={width:360,height:180};
 assert.deepEqual(projectEquatorial(180,0,o),{x:180,y:90});
 assert.deepEqual(projectEquatorial(90,30,o),{x:270,y:60});
 assert.deepEqual(projectEquatorial(450,30,o),projectEquatorial(90,30,o));
 assert.equal(projectEquatorial(180,90,o).y,0);assert.equal(projectEquatorial(180,-90,o).y,180);
 assert.equal(projectEquatorial(90,0,{...o,raIncreasesLeft:false}).x,90);
 assert.throws(()=>projectEquatorial(0,91,o),RangeError);assert.throws(()=>projectEquatorial(NaN,0,o),RangeError);
 assert.throws(()=>projectEquatorial(0,0,{width:0}),RangeError);
});
test('seam crossing is clipped into edge segments instead of drawing across the sky',()=>{
 const segments=projectEquatorialLine([[359,10],[1,20]],{width:360,height:180});
 assert.equal(segments.length,2);
 assert.ok(segments.every(([a,b])=>Math.abs(a.x-b.x)<=1.00001));
 assert.ok(Math.abs(segments[0][1].y-75)<1e-9);assert.ok(Math.abs(segments[1][0].y-75)<1e-9);
 const endpoint=projectEquatorialLine([[0,10],[1,20]],{width:360,height:180});
 assert.ok(endpoint.every(([a,b])=>Math.abs(a.x-b.x)<=1.00001));
});
test('all constellations share one coordinate frame under rotation and resize',()=>{
 for(const centerRaDeg of [0,30,180,350]){
  const options={width:1200,height:600,centerRaDeg};const map=createConstellationSkyMap(options);
  for(const c of map){
   for(const star of c.stars)assert.deepEqual({x:star.x,y:star.y},projectEquatorial(star.raDeg,star.decDeg,options));
   for(const [a,b]of c.segments)assert.ok(Math.abs(a.x-b.x)<=600.000001);
  }
 }
});
