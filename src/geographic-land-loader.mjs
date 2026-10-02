import {APP_BASE_URL,withBasePath} from './base-path.mjs';
import {decodeGeographicLandMask} from './land-mask.mjs';

/** Static gzip is explicitly decoded so GitHub Pages needs no custom headers. */
export async function loadBundledGeographicLand({signal}={}) {
  const response=await fetch(withBasePath('/maps/earth-land-8192.bin.gz?v=20261002',APP_BASE_URL),{signal});
  if(!response.ok)throw new Error(`Geographic land HTTP ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const decoded=bytes[0]===31&&bytes[1]===139
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  return decodeGeographicLandMask(decoded);
}
