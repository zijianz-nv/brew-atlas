import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {applyMapThumbnails} from './apply-map-thumbnails.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(bytes=10000){
 const root=await mkdtemp(join(tmpdir(),'beer-map-thumbs-'));await mkdir(join(root,'public/images'),{recursive:true});
 const source=Buffer.from('approved photo'),thumbnail=Buffer.alloc(bytes,3);await writeFile(join(root,'public/images/original.png'),source);await writeFile(join(root,'public/images/small.webp'),thumbnail);
 const registry={entries:[{sourcePath:'/images/original.png',sourceSha256:hash(source),thumbnail:'/images/small.webp',thumbnailSha256:hash(thumbnail)}]};
 return{root,registry,cleanup:()=>rm(root,{recursive:true,force:true})};
}
test('every depicted beer gets a bounded thumbnail without changing its original or record count',async()=>{
 const f=await fixture();try{const catalog={beers:[{id:'a',image:'/images/original.png',imageOriginal:'/images/original.png'},{id:'b',image:'/images/original.png'},{id:'pending'}]};
 const audit=await applyMapThumbnails(catalog,f);assert.equal(catalog.beers.length,3);assert.equal(catalog.beers[0].image,'/images/original.png');assert.equal(catalog.beers[0].imageOriginal,'/images/original.png');assert.equal(catalog.beers[0].imageThumbnail,'/images/small.webp');assert.equal(audit.records,2);assert.equal(audit.maximumBytes,10000);assert.equal(audit.uniqueThumbnails,1);
 }finally{await f.cleanup()}
});
test('even one byte over the 10KB contract fails packaging',async()=>{const f=await fixture(10001);try{await assert.rejects(applyMapThumbnails({beers:[{id:'a',image:'/images/original.png'}]},f),/exceeds 10KB/)}finally{await f.cleanup()}});
test('changed source identity or missing thumbnail evidence cannot silently use a stale asset',async()=>{const f=await fixture(120);try{
 await assert.rejects(applyMapThumbnails({beers:[{id:'a',image:'/images/missing.png'}]},f),/Missing 10KB/);
 await writeFile(join(f.root,'public/images/original.png'),'a different bottle');
 await assert.rejects(applyMapThumbnails({beers:[{id:'a',image:'/images/original.png'}]},f),/Stale/);
 }finally{await f.cleanup()}});
