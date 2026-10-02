import {canonicalCountry} from './country-selection.mjs';

// Search-only spelling equivalents, never coordinates or producer verification.
// Scope by the recorded country so the Florida city does not inherit Russian
// Chinese/Cyrillic spellings. Unknown-country records remain unassigned.
const SAINT_PETERSBURG=Object.freeze([
  '圣彼得堡','聖彼得堡','Saint Petersburg','St. Petersburg','St Petersburg',
  'Sankt-Peterburg','Sankt Petersburg','Санкт-Петербург',
]);
const cityKey=value=>typeof value==='string'?value.normalize('NFKC').toLowerCase().replace(/[\s.\-‐‑–—]+/gu,''):'';
const petersburgKeys=new Set(SAINT_PETERSBURG.map(cityKey));
export function citySearchAliases(brewery){
  if(canonicalCountry(brewery?.country).toLowerCase()!=='russia')return [];
  const recorded=[brewery?.city,brewery?.cityZh,...(Array.isArray(brewery?.cityAliases)?brewery.cityAliases:[])];
  return recorded.some(name=>petersburgKeys.has(cityKey(name)))?SAINT_PETERSBURG:[];
}
