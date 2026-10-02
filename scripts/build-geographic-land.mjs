import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createGeographicLandMask,decodeGeographicLandMask} from '../src/land-mask.mjs';
const root=new URL('../',import.meta.url);
const source=await readFile(new URL('public/maps/world-50m.geojson',root));
const start=performance.now();
const mask=createGeographicLandMask(JSON.parse(source),{width:8192,height:4096,coastMargin:0});
const packed=mask.toPackedRaster(),gzip=gzipSync(packed,{level:9});
const decoded=decodeGeographicLandMask(packed);
// Exhaustive cell-centre equality includes islands, lakes and the antimeridian.
for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){
 const lng=(x+.5)/mask.width*360-180,lat=90-(y+.5)/mask.height*180;
 if(mask.contains(lng,lat)!==decoded.contains(lng,lat))throw new Error(`Raster mismatch ${x},${y}`);
}
await writeFile(new URL('public/maps/earth-land-8192.bin.gz',root),gzip);
const metadata={generatedAt:new Date().toISOString(),source:'world-50m.geojson',
 sourceSha256:createHash('sha256').update(source).digest('hex'),width:8192,height:4096,coastMargin:0,
 packedBytes:packed.length,gzipBytes:gzip.length,sha256:createHash('sha256').update(gzip).digest('hex'),
 comparedCells:mask.width*mask.height,exactCellEquality:true,elapsedMs:Math.round(performance.now()-start),
 provenance:'Same Natural Earth 1:50m geometry and scanline raster as the browser; no coordinate rounding or coastline simplification.'};
await writeFile(new URL('public/maps/earth-land-8192.json',root),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify(metadata));
