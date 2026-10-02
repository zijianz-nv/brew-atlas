#!/usr/bin/env node
import {copyFile, cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeCatalogChunks} from './catalog-chunks.mjs';
import {writeCatalogBootstrap} from './catalog-bootstrap.mjs';
import {writeStaticGzipSidecars} from './compressed-assets.mjs';
import {packageGzipCatalogChunks, verifyPagesPackage} from './pages-package.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(await readFile(resolve(root,'public/data/catalog.json'),'utf8'));
if (catalog.metadata?.id !== 'local-all-v1') throw new Error('Refusing to package an unrecognized catalog');
await mkdir(resolve(root,'dist/data'),{recursive:true});
await mkdir(resolve(root,'dist/images/curated'),{recursive:true});
await mkdir(resolve(root,'dist/data-sources/curated'),{recursive:true});
const chunked = await writeCatalogChunks(catalog, resolve(root,'dist/data'), {gzip:true,maxHeaderBytes:16*1024*1024});
const compressedCatalog = await packageGzipCatalogChunks(resolve(root,'dist/data'));
const bootstrap = await writeCatalogBootstrap(catalog, resolve(root,'dist/data'), {gzip:true});
await copyFile(resolve(root,'public/favicon.svg'),resolve(root,'dist/favicon.svg'));
await cp(resolve(root,'public/maps'),resolve(root,'dist/maps'),{recursive:true});
await cp(resolve(root,'public/images/ingredients'),resolve(root,'dist/images/ingredients'),{recursive:true});
const mapSidecars = await writeStaticGzipSidecars(resolve(root,'dist/maps'), ['.geojson']);
const assetSidecars = await writeStaticGzipSidecars(resolve(root,'dist/assets'), ['.js','.css']);
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
const provenanceImages = b => [typeof b.imageBeforeCutout==='string'?b.imageBeforeCutout:null,
  b.imageBeforeCutout?.image, b.imageBeforeCutout?.imageOriginal,
  b.imageBeforeCutout?.imageThumbnail, b.imageDerivation?.sourceImage,
  b.imageDerivation?.original,b.imageDerivation?.fullResolutionCutout]
  .filter(asset => typeof asset === 'string' && asset.startsWith('/images/'));
for (const asset of new Set(catalog.beers.flatMap(b=>[b.image,b.imageOriginal,b.imageThumbnail,b.labelImage,b.labelImageOriginal,...provenanceImages(b)]).filter(Boolean))) {
  if (!asset.startsWith('/images/') || asset.includes('..')) throw new Error(`Unexpected active asset ${asset}`);
  await mkdir(dirname(resolve(root,'dist',asset.slice(1))),{recursive:true});
  await copyFile(resolve(root,'public',asset.slice(1)),resolve(root,'dist',asset.slice(1)));
}
console.log(`Packaged ${catalog.beers.length} merged local records in ${chunked.parts.length} byte-bounded chunks, manifest ${chunked.bytes} bytes, and their cached images.`);
console.log(`Map bootstrap: ${bootstrap.bootstrap.catalog.beers.length} records, ${bootstrap.bytes} JSON bytes / ${bootstrap.gzipBytes} gzip bytes; complete catalog remains available on demand.`);
console.log(`Static gzip sidecars: ${mapSidecars.length} maps and ${assetSidecars.length} JS/CSS assets; uncompressed originals retained.`);
const pages = await verifyPagesPackage(resolve(root,'dist'));
console.log(`Pages package: ${pages.bytes} bytes / ${pages.maxBytes} maximum; ${compressedCatalog.records} complete records in ${compressedCatalog.chunks} lossless gzip chunks, saving ${compressedCatalog.removedBytes} bytes.`);
