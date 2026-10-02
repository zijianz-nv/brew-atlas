import {APP_BASE_URL,withBasePath} from './base-path.mjs';

export const TERRAIN_TEXTURE_WIDTHS=Object.freeze([2048,4096,8192]);
/** Initial transfer stays 2K mobile / 4K desktop. Call the detailed path only
 * once a close-up view needs it. Low-memory devices and GPU limits take priority.
 * Null means no bundled size fits the GPU: keep the already displayed texture.
 */
export function selectTerrainTextureWidth({compact=false,detailed=false,maxTextureSize=8192,deviceMemory}={}){
 const gpuLimit=Number.isFinite(maxTextureSize)?Math.max(0,maxTextureSize):8192;
 let desired=detailed?(compact?4096:8192):(compact?2048:4096);
 if(Number.isFinite(deviceMemory)&&deviceMemory>0){
  if(deviceMemory<=2)desired=Math.min(desired,2048);
  else if(deviceMemory<=4)desired=Math.min(desired,4096);
 }
 return TERRAIN_TEXTURE_WIDTHS.filter(width=>width<=Math.min(desired,gpuLimit)).at(-1)??null;
}
export function terrainTextureUrl(options={}){
 const width=selectTerrainTextureWidth(options);
 return width?withBasePath(`/maps/earth-terrain-${width}.webp?v=atlas-soft-hd-20261002`,APP_BASE_URL):null;
}
async function loadTerrain(options){
 const url=terrainTextureUrl(options);
 if(!url){if(options.fallbackUrl)return options.fallbackUrl;throw new RangeError('No bundled terrain texture fits this GPU');}
 try{
  // Hand Three the downloaded blob URL, avoiding a duplicate image request.
  const response=await fetch(url,{signal:options.signal});
  if(!response.ok)throw new Error(`Terrain texture HTTP ${response.status}`);
  const blob=await response.blob();
  options.signal?.throwIfAborted();
  return URL.createObjectURL(blob);
 }catch(error){
  // Aborted/disposed scenes must not be resurrected with their old texture.
  if(options.signal?.aborted||error?.name==='AbortError')throw error;
  if(options.fallbackUrl)return options.fallbackUrl;
  throw error;
 }
}
/** Locally bundled shaded relief; no tile service, API key or remote requests.
 * Caller owns newly returned blob URLs and should revoke them after decoding.
 */
export async function makeTerrainTexture(_features,{compact=false,...options}={}){
 return loadTerrain({...options,compact,detailed:false});
}
/** On-demand upgrade using the same source raster and palette. Keep the old
 * texture visible until TextureLoader succeeds; a returned fallbackUrl is the
 * same supplied URL and is NOT a newly owned blob. Do not downgrade on zoom-out.
 * Pass the renderer's capabilities.maxTextureSize and optional deviceMemory.
 */
export async function makeDetailedTerrainTexture(_features,{compact=false,...options}={}){
 return loadTerrain({...options,compact,detailed:true});
}
