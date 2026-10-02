import test from 'node:test';import assert from 'node:assert/strict';
import {selectTerrainTextureWidth,terrainTextureUrl,makeDetailedTerrainTexture} from '../src/terrain-texture.mjs';
test('startup and close-up resolutions respect mobile, memory and actual GPU limits',()=>{
 assert.equal(selectTerrainTextureWidth({compact:true}),2048);
 assert.equal(selectTerrainTextureWidth({}),4096);
 assert.equal(selectTerrainTextureWidth({compact:true,detailed:true}),4096);
 assert.equal(selectTerrainTextureWidth({detailed:true}),8192);
 assert.equal(selectTerrainTextureWidth({detailed:true,maxTextureSize:4096}),4096);
 assert.equal(selectTerrainTextureWidth({detailed:true,deviceMemory:2}),2048);
 assert.equal(selectTerrainTextureWidth({detailed:true,deviceMemory:4}),4096);
 assert.equal(selectTerrainTextureWidth({detailed:true,maxTextureSize:1024}),null);
 assert.match(terrainTextureUrl({detailed:true}),/earth-terrain-8192\.webp/);
});
test('failed close-up requests retain the supplied initial texture, while cancellation propagates',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:false,status:404});
 try{
  assert.equal(await makeDetailedTerrainTexture([],{fallbackUrl:'blob:current'}),'blob:current');
  assert.equal(await makeDetailedTerrainTexture([],{fallbackUrl:'blob:current',maxTextureSize:1024}),'blob:current');
  await assert.rejects(makeDetailedTerrainTexture([]),/HTTP 404/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(makeDetailedTerrainTexture([],{fallbackUrl:'blob:current',signal:controller.signal}));
 }finally{globalThis.fetch=previous;}
});
