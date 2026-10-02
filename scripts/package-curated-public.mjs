#!/usr/bin/env node
import {copyFile, cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {writeCatalogChunks} from './catalog-chunks.mjs';
import {writeCatalogBootstrap} from './catalog-bootstrap.mjs';
import {writeStaticGzipSidecars} from './compressed-assets.mjs';
import {packageGzipCatalogChunks, verifyPagesPackage} from './pages-package.mjs';
import {displayImagePaths, publicFiles, createArchiveRewriter} from './published-assets.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceCatalog = JSON.parse(await readFile(resolve(root,'public/data/catalog.json'),'utf8'));
if (sourceCatalog.metadata?.id !== 'local-all-v1') throw new Error('Refusing to package an unrecognized catalog');
const retainedImages = displayImagePaths(sourceCatalog);
const imageFiles = await publicFiles(root,'images');
for (const path of imageFiles) if (path.startsWith('/images/ingredients/')) retainedImages.add(path);
const sourceFiles = await publicFiles(root,'data-sources');
const retainedSources = sourceFiles.filter(path => /\.(md|txt)$/i.test(path));
const retained = new Set([...retainedImages,...retainedSources]);
const archived = [...imageFiles,...sourceFiles].filter(path => !retained.has(path));
const revision = process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const tracked = new Set(execFileSync('git',['ls-tree','-r','--name-only',revision,'public/images','public/data-sources'],
  {cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}).trim().split('\n'));
for (const path of archived) if (!tracked.has(`public${path}`)) throw new Error(`Asset archive is missing ${path}; commit source assets before packaging`);
const archive = createArchiveRewriter({archivedPaths:archived,retainedPaths:retained,revision});
const catalog = archive.json(sourceCatalog);
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
for (const path of retainedSources) {
  const target = resolve(root,'dist',path.slice(1));
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,archive.text(await readFile(resolve(root,'public',path.slice(1)),'utf8'),path));
}
const sourceNotices = ['WORLD-SOURCES.md','ARCHIVE-SOURCES.md','MAP-SOURCES.md','OPENBEER-SOURCES.md','OFF-PHOTO-SOURCES.md'];
let softwareNotices = await readFile(resolve(root,'THIRD-PARTY-NOTICES.md'),'utf8');
for (const name of sourceNotices) {
  await writeFile(resolve(root,'dist/data-sources',name),archive.text(await readFile(resolve(root,'research',name),'utf8'),`/data-sources/${name}`));
  softwareNotices = softwareNotices.replaceAll(`research/${name}`,`data-sources/${name}`);
}
// Only adjust the introductory distribution paths; retain license and attribution text.
softwareNotices = softwareNotices.replaceAll('dist/data-sources/','data-sources/');
await writeFile(resolve(root,'dist/THIRD-PARTY-NOTICES.md'),archive.text(softwareNotices));
for (const asset of retainedImages) {
  if (!asset.startsWith('/images/') || asset.includes('..')) throw new Error(`Unexpected active asset ${asset}`);
  await mkdir(dirname(resolve(root,'dist',asset.slice(1))),{recursive:true});
  await copyFile(resolve(root,'public',asset.slice(1)),resolve(root,'dist',asset.slice(1)));
}
await writeFile(resolve(root,'dist/data-sources/ASSET-ARCHIVE.md'),`# Original asset archive\n\nThe site includes all images used by its current interface. Other source images and raw evidence remain in the [versioned source archive](${archive.treeRoot}). Catalog references point to immutable archive files; source records, credits and licenses are preserved.\n`);
console.log(`Published ${retainedImages.size} display images; ${archived.length} source assets retained in commit ${revision} instead of the website.`);
console.log(`Packaged ${catalog.beers.length} merged local records in ${chunked.parts.length} byte-bounded chunks, manifest ${chunked.bytes} bytes, and their cached images.`);
console.log(`Map bootstrap: ${bootstrap.bootstrap.catalog.beers.length} records, ${bootstrap.bytes} JSON bytes / ${bootstrap.gzipBytes} gzip bytes; complete catalog remains available on demand.`);
console.log(`Static gzip sidecars: ${mapSidecars.length} maps and ${assetSidecars.length} JS/CSS assets; uncompressed originals retained.`);
const pages = await verifyPagesPackage(resolve(root,'dist'));
console.log(`Pages package: ${pages.bytes} bytes / ${pages.maxBytes} maximum; ${compressedCatalog.records} complete records in ${compressedCatalog.chunks} lossless gzip chunks, saving ${compressedCatalog.removedBytes} bytes.`);
