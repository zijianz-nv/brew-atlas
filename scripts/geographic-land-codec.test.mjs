import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createGeographicLandMask,decodeGeographicLandMask} from '../src/land-mask.mjs';
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
const features=[{geometry:{type:'Polygon',coordinates:[ring(-80,-40,80,40),ring(-15,-15,15,15)]}},
 {geometry:{type:'MultiPolygon',coordinates:[[ring(-180,-10,-160,10)],[ring(160,-10,180,10)]]}}];
for(const coastMargin of [0,1])test(`packed land preserves every sample and wrap with coast margin ${coastMargin}`,()=>{
 const mask=createGeographicLandMask(features,{width:127,height:63,coastMargin});
 const decoded=decodeGeographicLandMask(mask.toPackedRaster());
 for(let y=0;y<63;y++)for(let x=0;x<127;x++){
  const lng=(x+.5)/127*360-180,lat=90-(y+.5)/63*180;
  assert.equal(decoded.contains(lng,lat),mask.contains(lng,lat));
  assert.equal(decoded.contains(lng+720,lat),mask.contains(lng,lat));
 }
 assert.equal(decoded.contains(0,0),false,'lake/hole is water');
 assert.equal(decoded.contains(50,0),true,'continental land');
 assert.equal(decoded.contains(179,0),true,'antimeridian island');
 assert.equal(decoded.contains(NaN,0),false);assert.equal(decoded.contains(0,91),false);
 assert.deepEqual(decoded.toPackedRaster(),mask.toPackedRaster());
});
test('invalid versions, dimensions and truncated land assets fail closed',()=>{
 const bytes=createGeographicLandMask(features,{width:64,height:32,coastMargin:0}).toPackedRaster();
 assert.throws(()=>decodeGeographicLandMask(bytes.slice(0,19)),/header/);
 assert.throws(()=>decodeGeographicLandMask(bytes.slice(0,-1)),/dimensions/);
 const changed=bytes.slice();changed[17]=99;assert.throws(()=>decodeGeographicLandMask(changed),/header/);
 const wrong=bytes.slice();new DataView(wrong.buffer).setUint32(8,0,true);assert.throws(()=>decodeGeographicLandMask(wrong),/dimensions/);
});
test('bundled precise raster keeps the existing 8192 by 4096 zero-margin policy',async()=>{
 const bytes=gunzipSync(await readFile(new URL('../public/maps/earth-land-8192.bin.gz',import.meta.url)));
 const mask=decodeGeographicLandMask(bytes);
 assert.deepEqual([mask.width,mask.height,mask.coastMargin],[8192,4096,0]);
 assert.equal(mask.contains(116.4,39.9),true);assert.equal(mask.contains(0,0),false);
});
