import {Group, Vector3} from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

// Screen-pixel widths: a crisp gold edge with two soft outer bands, no fill.
export const COUNTRY_OUTLINE_BANDS = Object.freeze([
  {width:7.5,opacity:0.10,color:0xf0be61},
  {width:4.8,opacity:0.22,color:0xf2c673},
  {width:2.4,opacity:0.94,color:0xffdda0},
]);

/** Keep line chords above the globe even along coarse/long boundary segments. */
export function countryOutlineSegments(features,getCoords,altitude=0.0015) {
  const positions=[];
  const point=([lng,lat])=>new Vector3().copy(getCoords(lat,lng,altitude));
  for(const feature of features||[]) {
    const geometry=feature?.geometry;
    const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
    for(const polygon of polygons)for(const ring of polygon)for(let i=1;i<ring.length;i++) {
      const from=point(ring[i-1]),to=point(ring[i]);
      if(!Number.isFinite(from.lengthSq()+to.lengthSq())||!from.lengthSq()||!to.lengthSq())continue;
      const radius=from.length(),steps=Math.max(1,Math.ceil(from.angleTo(to)/(Math.PI/360)));
      let previous=from;
      for(let step=1;step<=steps;step++) {
        const next=from.clone().lerp(to,step/steps).normalize().multiplyScalar(radius);
        positions.push(...previous.toArray(),...next.toArray());previous=next;
      }
    }
  }
  return positions;
}

/** Decorative only. Raycasts pass through to the original globe and plants. */
export function createCountryOutline(features,getCoords,{reducedMotion=false,now=()=>performance.now()}={}) {
  const group=new Group();group.name='selected-country-outline';
  group.userData={outlineOnly:true,fadeDuration:reducedMotion?0:320};
  const geometry=new LineSegmentsGeometry().setPositions(countryOutlineSegments(features,getCoords));
  const started=now();
  COUNTRY_OUTLINE_BANDS.forEach((band,index)=>{
    const material=new LineMaterial({color:band.color,linewidth:band.width,transparent:true,
      opacity:reducedMotion?band.opacity:0,depthTest:true,depthWrite:false,toneMapped:false});
    const line=new LineSegments2(geometry,material);line.name=`country-outline-band-${index}`;
    line.renderOrder=20+index;line.raycast=()=>{};
    const beforeRender=line.onBeforeRender;
    line.onBeforeRender=function(renderer,...args){
      beforeRender.call(this,renderer,...args);
      const progress=reducedMotion?1:Math.min(1,Math.max(0,(now()-started)/320));
      material.opacity=band.opacity*(1-(1-progress)**3);
    };
    group.add(line);
  });
  group.userData.dispose=()=>{geometry.dispose();for(const line of group.children)line.material.dispose();};
  return group;
}
