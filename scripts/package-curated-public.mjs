#!/usr/bin/env node
import {copyFile, cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeCatalogChunks} from './catalog-chunks.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(resolve(root,'public/data/catalog.json'),'utf8'));
if (catalog.metadata?.id !== 'local-all-v1') throw new Error('Refusing to package an unrecognized catalog');
await mkdir(resolve(root,'dist/data'),{recursive:true});
await mkdir(resolve(root,'dist/images/curated'),{recursive:true});
await mkdir(resolve(root,'dist/data-sources/curated'),{recursive:true});
const chunked = await writeCatalogChunks(catalog, resolve(root,'dist/data'), {gzip:true});
await copyFile(resolve(root,'public/favicon.svg'),resolve(root,'dist/favicon.svg'));
await cp(resolve(root,'public/maps'),resolve(root,'dist/maps'),{recursive:true});
await cp(resolve(root,'public/data-sources'),resolve(root,'dist/data-sources'),{recursive:true});
const sourceNotices = ['WORLD-SOURCES.md','ARCHIVE-SOURCES.md','MAP-SOURCES.md','OPENBEER-SOURCES.md','OFF-PHOTO-SOURCES.md'];
let softwareNotices = await readFile(resolve(root,'THIRD-PARTY-NOTICES.md'),'utf8');
for (const name of sourceNotices) {
  await copyFile(resolve(root,'research',name),resolve(root,'dist/data-sources',name));
  softwareNotices = softwareNotices.replaceAll(`research/${name}`,`data-sources/${name}`);
}
// Only adjust the introductory distribution paths; retain license and attribution text.
softwareNotices = softwareNotices.replaceAll('dist/data-sources/','data-sources/');
await writeFile(resolve(root,'dist/THIRD-PARTY-NOTICES.md'),softwareNotices);
for (const asset of new Set(catalog.beers.flatMap(b=>[b.image,b.imageOriginal,b.imageThumbnail]).filter(Boolean))) {
  if (!asset.startsWith('/images/') || asset.includes('..')) throw new Error(`Unexpected active asset ${asset}`);
  await mkdir(dirname(resolve(root,'dist',asset.slice(1))),{recursive:true});
  await copyFile(resolve(root,'public',asset.slice(1)),resolve(root,'dist',asset.slice(1)));
}
console.log(`Packaged ${catalog.beers.length} merged local records in ${chunked.parts.length} byte-bounded chunks, manifest ${chunked.bytes} bytes, and their cached images.`);
