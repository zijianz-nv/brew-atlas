import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {loadStaticMap} from '../src/static-map-loader.mjs';
const geometry = {type:'FeatureCollection',features:[{type:'Feature',properties:{name:'island'},geometry:{type:'Polygon',coordinates:[[[1,2],[1.05,2],[1,2.1],[1,2]]]}}]};

test('static gzip sidecar preserves every source coordinate and property', async () => {
  const calls=[];
  const result=await loadStaticMap('/brew-atlas/maps/world.geojson?version=1', {fetchImpl:async (url, options) => {
    calls.push({url, signal:options.signal}); return new Response(gzipSync(JSON.stringify(geometry)));
  }});
  assert.deepEqual(result,geometry);
  assert.deepEqual(calls.map(call=>call.url),['/brew-atlas/maps/world.geojson.gz?version=1']);
});

test('404 sidecar falls back to the unchanged ordinary map once',async()=>{
  const calls=[];
  const result=await loadStaticMap('/maps/world.geojson',{fetchImpl:async url=>{
    calls.push(url);return url.endsWith('.gz')?new Response('',{status:404}):Response.json(geometry);
  }});
  assert.deepEqual(result,geometry);assert.deepEqual(calls,['/maps/world.geojson.gz','/maps/world.geojson']);
});

test('older browsers without DecompressionStream load the ordinary map directly',async()=>{
  const calls=[];await loadStaticMap('/maps/world.geojson',{DecompressionStreamImpl:null,fetchImpl:async url=>{calls.push(url);return Response.json(geometry);}});
  assert.deepEqual(calls,['/maps/world.geojson']);
});

test('content-encoding decoded JSON is not decompressed twice',async()=>{
  assert.deepEqual(await loadStaticMap('/map.geojson',{fetchImpl:async()=>Response.json(geometry)}),geometry);
});

test('corrupt or denied compressed geometry is not silently accepted or retried',async()=>{
  await assert.rejects(loadStaticMap('/map.geojson',{fetchImpl:async()=>new Response(new Uint8Array([31,139,0,0]))}));
  await assert.rejects(loadStaticMap('/map.geojson',{fetchImpl:async()=>Response.json({type:'FeatureCollection',features:null})}),/Invalid map/);
  let requests=0;await assert.rejects(loadStaticMap('/map.geojson',{fetchImpl:async()=>{requests++;return new Response('',{status:403});}}),/403/);assert.equal(requests,1);
});

test('abort is preserved and never falls back to another request',async()=>{
  const controller=new AbortController();controller.abort();let requests=0;
  await assert.rejects(loadStaticMap('/map.geojson',{signal:controller.signal,fetchImpl:async (_url,{signal})=>{requests++;signal.throwIfAborted();}}),{name:'AbortError'});
  assert.equal(requests,1);
});
