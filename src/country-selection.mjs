// Catalogue aliases, not guesses from brewery coordinates or award regions.
const ALIASES = new Map([
  ["People's Republic of China",'China'],['People’s Republic of China','China'],['中华人民共和国','China'],['中国','China'],
  ['United States of America','United States'],['USA','United States'],['U.S.A.','United States'],
  ['UK','United Kingdom'],['Great Britain','United Kingdom'],
  ['England','United Kingdom'],['Scotland','United Kingdom'],['Wales','United Kingdom'],['Northern Ireland','United Kingdom'],
  ['Czech Republic','Czechia'],['Russian Federation','Russia'],
  ['Korea, Republic of','South Korea'],['Republic of Korea','South Korea'],
  ['Viet Nam','Vietnam'],['Türkiye','Turkey'],['Macedonia','North Macedonia'],
  ['Macedonia, the Former Yugoslav Republic of','North Macedonia'],
  ["Côte d'Ivoire",'Côte d’Ivoire'],['Ivory Coast','Côte d’Ivoire'],
  ['eSwatini','Eswatini'],['Swaziland','Eswatini'],
  ['Bosnia and Herz.','Bosnia and Herzegovina'],['Antigua and Barb.','Antigua and Barbuda'],
  ['Dominican Rep.','Dominican Republic'],['Central African Rep.','Central African Republic'],
  ['Dem. Rep. Congo','Democratic Republic of the Congo'],['Congo','Republic of the Congo'],
  ['Eq. Guinea','Equatorial Guinea'],['S. Sudan','South Sudan'],['W. Sahara','Western Sahara'],
].map(([alias,country])=>[alias.toLowerCase(),country]));

export function canonicalCountry(value) {
  if(typeof value!=='string'||!value.trim())return 'unknown';
  const name=value.trim();return ALIASES.get(name.toLowerCase())||name;
}
// This is an intentionally asymmetric browsing group, separate from source
// country metadata: Taiwan opens China; China includes Japan; Japan stays solo.
export function countrySelectionKey(value) {
  const country=canonicalCountry(value);
  return ['Taiwan','中国台湾','台湾','臺灣','Taiwan, Province of China'].includes(country)?'China':country;
}
export function countrySelectionValues(value) {
  const country=countrySelectionKey(value);
  return country==='Japan'?['Japan','China']:[country];
}
export const matchesCountrySelection=(selected,value)=>countrySelectionValues(value).includes(countrySelectionKey(selected));
export function countrySelectionLabel(value,fallback) {
  const country=countrySelectionKey(value);
  return {China:'中国',Japan:'日本','United Kingdom':'英国'}[country]||fallback||country;
}
export const featureCountry=feature=>countrySelectionKey(feature?.properties?.name);

function ringContains(ring,lng,lat) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    const cross=(lng-xi)*(yj-yi)-(lat-yi)*(xj-xi);
    if(Math.abs(cross)<1e-10&&lng>=Math.min(xi,xj)&&lng<=Math.max(xi,xj)&&lat>=Math.min(yi,yj)&&lat<=Math.max(yi,yj))return true;
    if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}

/** Uses the bundled, antimeridian-split vector map. Polygon holes stay water. */
export function createCountryPicker(features) {
  const entries=(features||[]).flatMap(feature=>{
    const geometry=feature?.geometry;
    const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    return polygons.filter(p=>p[0]?.length).map(([outer,...holes])=>{
      let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
      for(const [lng,lat] of outer){left=Math.min(left,lng);right=Math.max(right,lng);bottom=Math.min(bottom,lat);top=Math.max(top,lat);}
      return {feature,outer,holes,left,right,bottom,top};
    });
  });
  return (lat,lng)=>{
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90)return null;
    const x=lng>=-180&&lng<=180?lng:((lng+180)%360+360)%360-180;
    for(const entry of entries){
      if(x<entry.left||x>entry.right||lat<entry.bottom||lat>entry.top)continue;
      if(ringContains(entry.outer,x,lat)&&!entry.holes.some(hole=>ringContains(hole,x,lat)))return entry.feature;
    }
    return null;
  };
}

/** Track total movement, not just release displacement (dragging back is a drag). */
export function createMapTapTracker(threshold=6) {
  let active=null;
  return {
    start(id,x,y){if(active){active.cancelled=true;return;}active={id,x,y,cancelled:false};},
    move(id,x,y){if(active&&active.id===id&&Math.hypot(x-active.x,y-active.y)>threshold)active.cancelled=true;},
    end(id,x,y){if(!active||active.id!==id)return false;const click=!active.cancelled&&Math.hypot(x-active.x,y-active.y)<=threshold;active=null;return click;},
    cancel(){active=null;},
  };
}

export function isCountrySurfaceEvent(event) {
  return !event?.defaultPrevented&&!event?.cancelBubble
    &&!event?.target?.closest?.('button,a,input,select,[data-marker-id],.globe-ingredient-marker');
}
